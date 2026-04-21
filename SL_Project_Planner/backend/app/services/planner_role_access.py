from __future__ import annotations

from sqlalchemy import delete, func, select, text, update
from sqlalchemy.exc import OperationalError, ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.platform_person import DimPersonRole
from app.models.platform_role import DimRole
from app.schemas.planner import PlannerRoleCode
from app.services.planner_policy import PlannerActorPolicy

ASSIGNABLE_PLANNER_ROLES: tuple[PlannerRoleCode, ...] = (
    "architect",
    "senior_architect",
    "project_anchor",
    "group_leader",
    "principal",
)

GL_MANAGEABLE_ROLES: tuple[PlannerRoleCode, ...] = (
    "architect",
    "senior_architect",
    "project_anchor",
    "group_leader",
)

PLANNER_DIM_ROLE_CODES: dict[PlannerRoleCode, str] = {
    "architect": "planner_architect",
    "senior_architect": "planner_senior_architect",
    "project_anchor": "planner_project_anchor",
    "group_leader": "planner_group_leader",
    "principal": "planner_principal",
}

PLANNER_DIM_ROLE_NAMES: dict[PlannerRoleCode, str] = {
    "architect": "Planner Architect",
    "senior_architect": "Planner Senior Architect",
    "project_anchor": "Planner Project Anchor",
    "group_leader": "Planner Group Leader",
    "principal": "Planner Principal",
}

_role_catalog_ready = False
_legacy_migration_done = False


def normalize_planner_role_code(value: object) -> PlannerRoleCode | None:
    normalized = str(value or "").strip().lower().replace("-", "_").replace(" ", "_")
    if normalized in ASSIGNABLE_PLANNER_ROLES:
        return normalized  # type: ignore[return-value]
    if normalized.startswith("planner_"):
        normalized = normalized.removeprefix("planner_")
        if normalized in ASSIGNABLE_PLANNER_ROLES:
            return normalized  # type: ignore[return-value]
    return None


def manageable_roles_for_actor(actor: PlannerActorPolicy) -> list[PlannerRoleCode]:
    actor_roles = set(actor.roles)
    if "super_admin" in actor_roles:
        return list(ASSIGNABLE_PLANNER_ROLES)
    if "group_leader" in actor_roles:
        return list(GL_MANAGEABLE_ROLES)
    return []


async def ensure_planner_role_catalog(session: AsyncSession) -> None:
    global _role_catalog_ready
    if _role_catalog_ready:
        return

    wanted_codes = list(PLANNER_DIM_ROLE_CODES.values())
    existing_rows = (
        await session.execute(select(DimRole.role_id, DimRole.role_code, DimRole.role_name).where(DimRole.role_code.in_(wanted_codes)))
    ).all()
    existing_codes = {str(role_code): int(role_id) for role_id, role_code, _role_name in existing_rows if role_code}

    changed = False

    for _role_id, role_code, role_name in existing_rows:
        normalized = normalize_planner_role_code(role_code)
        if normalized is None:
            continue
        wanted_name = PLANNER_DIM_ROLE_NAMES[normalized]
        if str(role_name or "").strip() == wanted_name:
            continue
        await session.execute(
            update(DimRole)
            .where(DimRole.role_code == PLANNER_DIM_ROLE_CODES[normalized])
            .values(role_name=wanted_name)
        )
        changed = True

    if len(existing_codes) < len(wanted_codes):
        max_role_id = (await session.execute(select(func.max(DimRole.role_id)))).scalar_one_or_none() or 0
        next_role_id = int(max_role_id) + 1
        for planner_role in ASSIGNABLE_PLANNER_ROLES:
            role_code = PLANNER_DIM_ROLE_CODES[planner_role]
            if role_code in existing_codes:
                continue
            session.add(
                DimRole(
                    role_id=next_role_id,
                    role_code=role_code,
                    role_name=PLANNER_DIM_ROLE_NAMES[planner_role],
                )
            )
            next_role_id += 1
            changed = True

    if changed:
        await session.commit()

    _role_catalog_ready = True


async def _migrate_legacy_assignments_if_present(session: AsyncSession) -> None:
    global _legacy_migration_done
    if _legacy_migration_done:
        return

    await ensure_planner_role_catalog(session)

    try:
        legacy_rows = (
            await session.execute(text("SELECT person_id, role_code FROM planner_role_assignment"))
        ).all()
    except (ProgrammingError, OperationalError):
        _legacy_migration_done = True
        return

    if not legacy_rows:
        _legacy_migration_done = True
        return

    dim_role_rows = (
        await session.execute(select(DimRole.role_id, DimRole.role_code).where(DimRole.role_code.in_(list(PLANNER_DIM_ROLE_CODES.values()))))
    ).all()
    dim_role_ids = {str(role_code): int(role_id) for role_id, role_code in dim_role_rows if role_code}

    existing_links = {
        (str(person_id), int(role_id))
        for person_id, role_id in (
            await session.execute(
                select(DimPersonRole.person_id, DimPersonRole.role_id).where(DimPersonRole.role_id.in_(list(dim_role_ids.values()) or [-1]))
            )
        ).all()
    }

    changed = False
    for person_id, legacy_role_code in legacy_rows:
        normalized = normalize_planner_role_code(legacy_role_code)
        if normalized is None:
            continue
        role_id = dim_role_ids.get(PLANNER_DIM_ROLE_CODES[normalized])
        if role_id is None:
            continue
        link = (str(person_id), int(role_id))
        if link in existing_links:
            continue
        session.add(DimPersonRole(person_id=str(person_id), role_id=int(role_id)))
        existing_links.add(link)
        changed = True

    if changed:
        await session.commit()

    _legacy_migration_done = True


async def list_explicit_planner_roles(
    session: AsyncSession,
    person_ids: list[str] | tuple[str, ...] | set[str] | None = None,
) -> dict[str, list[PlannerRoleCode]]:
    try:
        await ensure_planner_role_catalog(session)
        await _migrate_legacy_assignments_if_present(session)
        stmt = (
            select(DimPersonRole.person_id, DimRole.role_code)
            .select_from(DimPersonRole)
            .join(DimRole, DimRole.role_id == DimPersonRole.role_id)
            .where(DimRole.role_code.in_(list(PLANNER_DIM_ROLE_CODES.values())))
            .order_by(DimPersonRole.person_id.asc(), DimRole.role_code.asc())
        )
        clean_ids = sorted({str(value or "").strip() for value in (person_ids or []) if str(value or "").strip()})
        if clean_ids:
            stmt = stmt.where(DimPersonRole.person_id.in_(clean_ids))
        rows = (await session.execute(stmt)).all()
    except (ProgrammingError, OperationalError):
        return {}

    result: dict[str, list[PlannerRoleCode]] = {}
    for person_id, role_code in rows:
        normalized = normalize_planner_role_code(role_code)
        if normalized is None:
            continue
        result.setdefault(str(person_id), []).append(normalized)
    return result


async def set_explicit_planner_role(
    session: AsyncSession,
    *,
    person_id: str,
    role_code: PlannerRoleCode,
    enabled: bool,
    granted_by_person_id: str | None,
) -> None:
    del granted_by_person_id

    await ensure_planner_role_catalog(session)
    await _migrate_legacy_assignments_if_present(session)

    dim_role_id = (
        await session.execute(
            select(DimRole.role_id).where(DimRole.role_code == PLANNER_DIM_ROLE_CODES[role_code]).limit(1)
        )
    ).scalar_one()

    await session.execute(
        delete(DimPersonRole).where(
            DimPersonRole.person_id == person_id,
            DimPersonRole.role_id == dim_role_id,
        )
    )
    if enabled:
        session.add(DimPersonRole(person_id=person_id, role_id=int(dim_role_id)))
    await session.commit()
