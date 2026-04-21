from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.models.platform_group import DimGroup
from app.models.platform_person import DimPerson, DimPersonFeatureAccess
from app.schemas.planner import PlannerRoleCode
from app.schemas.planner_role_assignment import (
    PlannerRoleAssignmentOut,
    PlannerRoleAssignmentSetOut,
    PlannerRoleAssignmentToggleIn,
)
from app.schemas.user import UserContext
from app.services.platform_feature_access import PLANNER_APP_FEATURE_CODE
from app.services.planner_policy import resolve_planner_roles
from app.services.planner_role_access import (
    GL_MANAGEABLE_ROLES,
    list_explicit_planner_roles,
    manageable_roles_for_actor,
    normalize_planner_role_code,
    set_explicit_planner_role,
)
from app.api.routes.planner import _load_platform_person, _resolve_actor

router = APIRouter(prefix="/planner/role-assignments", tags=["planner-role-access"])


def _person_display_name(person: DimPerson) -> str:
    fallback = " ".join(part for part in [str(person.first_name or "").strip(), str(person.last_name or "").strip()] if part).strip()
    return str(person.display_name or person.full_name or fallback or person.email or person.person_id).strip()


def _parse_member_ids(raw_value: str | None) -> list[str]:
    members: list[str] = []
    seen: set[str] = set()
    for token in str(raw_value or "").split(","):
        person_id = token.strip()
        if not person_id or person_id in seen:
            continue
        seen.add(person_id)
        members.append(person_id)
    return members


async def _group_leader_scoped_person_ids(platform_session: AsyncSession, leader_person_id: str | None) -> set[str]:
    if not leader_person_id:
        return set()
    groups = (
        await platform_session.execute(
            select(DimGroup).where(DimGroup.group_leader_person_id == leader_person_id)
        )
    ).scalars().all()
    scoped_ids: set[str] = {leader_person_id}
    for group in groups:
        scoped_ids.update(_parse_member_ids(group.member_person_ids))
        group_leader_id = str(group.group_leader_person_id or "").strip()
        if group_leader_id:
            scoped_ids.add(group_leader_id)
    return scoped_ids


def _can_manage_assignments(user: UserContext, actor) -> bool:
    manageable = manageable_roles_for_actor(actor)
    return bool(manageable) and bool(user.person_id_platform)


def _assert_manageable_role(actor, role_code: PlannerRoleCode) -> None:
    manageable = set(manageable_roles_for_actor(actor))
    if role_code not in manageable:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot assign this planner role")


@router.get("", response_model=list[PlannerRoleAssignmentOut])
async def list_planner_role_assignments(
    q: str | None = Query(default=None),
    person_ids: str | None = Query(default=None),
    limit: int = Query(default=80, ge=1, le=250),
    platform_session: AsyncSession = Depends(deps.get_platform_db_session),
    user: UserContext = Depends(deps.get_user),
):
    actor = await _resolve_actor(platform_session, user)
    if not _can_manage_assignments(user, actor):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")

    actor_roles = set(actor.roles)
    scoped_group_member_ids: set[str] | None = None
    if "super_admin" not in actor_roles:
        scoped_group_member_ids = await _group_leader_scoped_person_ids(platform_session, user.person_id_platform)
        if not scoped_group_member_ids:
            return []

    scoped_person_ids = sorted(
        {
            token.strip()
            for token in str(person_ids or "").split(",")
            if token and token.strip()
        }
    )
    if scoped_group_member_ids is not None:
        scoped_person_ids = [person_id for person_id in scoped_person_ids if person_id in scoped_group_member_ids]
        if person_ids and not scoped_person_ids:
            return []

    base_filters = [
        or_(DimPerson.is_deleted.is_(None), DimPerson.is_deleted == 0),
        func.lower(func.coalesce(DimPerson.status, "")).in_(["working", "active", ""]),
    ]
    if scoped_group_member_ids is not None:
        base_filters.append(DimPerson.person_id.in_(sorted(scoped_group_member_ids)))
    people_by_id: dict[str, DimPerson] = {}

    if scoped_person_ids:
        scoped_stmt = (
            select(DimPerson)
            .where(*base_filters, DimPerson.person_id.in_(scoped_person_ids))
            .order_by(DimPerson.display_name.asc(), DimPerson.full_name.asc(), DimPerson.email.asc())
        )
        scoped_people = (await platform_session.execute(scoped_stmt)).scalars().all()
        for person in scoped_people:
            people_by_id[person.person_id] = person

    if q or not scoped_person_ids:
        search_stmt = select(DimPerson).where(*base_filters)
        if q:
            pattern = f"%{q.strip()}%"
            search_stmt = search_stmt.where(
                (DimPerson.display_name.ilike(pattern))
                | (DimPerson.full_name.ilike(pattern))
                | (DimPerson.email.ilike(pattern))
                | (DimPerson.job_title.ilike(pattern))
                | (DimPerson.department.ilike(pattern))
            )
        search_stmt = search_stmt.order_by(DimPerson.display_name.asc(), DimPerson.full_name.asc(), DimPerson.email.asc()).limit(limit)
        search_people = (await platform_session.execute(search_stmt)).scalars().all()
        for person in search_people:
            people_by_id.setdefault(person.person_id, person)

    people = sorted(
        people_by_id.values(),
        key=lambda person: (
            str(person.display_name or "").lower(),
            str(person.full_name or "").lower(),
            str(person.email or "").lower(),
            str(person.person_id or "").lower(),
        ),
    )
    person_ids = [person.person_id for person in people]
    explicit_role_map = await list_explicit_planner_roles(platform_session, person_ids)
    feature_rows = (
        await platform_session.execute(
            select(DimPersonFeatureAccess.person_id).where(
                DimPersonFeatureAccess.feature_code == PLANNER_APP_FEATURE_CODE,
                DimPersonFeatureAccess.person_id.in_(person_ids or [""]),
            )
        )
    ).scalars().all()
    access_people = set(feature_rows)

    items: list[PlannerRoleAssignmentOut] = []
    for person in people:
        temp_user = UserContext(
            user_id=person.email or person.person_id,
            email=person.email or "unknown@example.com",
            roles=[],
            person_id_platform=person.person_id,
            full_name=person.full_name or person.display_name,
            platform_role_id=person.role_id,
            platform_role_ids=[person.role_id] if person.role_id is not None else [],
            platform_role_codes=[],
            platform_role_names=[],
        )
        explicit_roles = explicit_role_map.get(person.person_id, [])
        effective_roles = resolve_planner_roles(temp_user, person, explicit_roles)
        inferred_roles = [role for role in resolve_planner_roles(temp_user, person, []) if role != "viewer" or not explicit_roles]
        items.append(
            PlannerRoleAssignmentOut(
                person_id=person.person_id,
                person_code=person.person_code,
                full_name=_person_display_name(person),
                email=person.email,
                status=person.status,
                is_deleted=person.is_deleted,
                department=person.department,
                sub_department=person.sub_department,
                job_title=person.job_title,
                planner_access=person.person_id in access_people,
                inferred_roles=inferred_roles,
                explicit_roles=explicit_roles,
                effective_roles=effective_roles,
            )
        )
    return items


@router.patch("/{person_id}/{role_code}", response_model=PlannerRoleAssignmentSetOut)
async def set_planner_role_assignment(
    person_id: str,
    role_code: str,
    payload: PlannerRoleAssignmentToggleIn,
    platform_session: AsyncSession = Depends(deps.get_platform_db_session),
    user: UserContext = Depends(deps.get_user),
):
    actor = await _resolve_actor(platform_session, user)
    if not _can_manage_assignments(user, actor):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")

    if "super_admin" not in set(actor.roles):
        scoped_group_member_ids = await _group_leader_scoped_person_ids(platform_session, user.person_id_platform)
        if person_id not in scoped_group_member_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Group leaders can modify planner roles only for their own group members",
            )

    normalized_role = normalize_planner_role_code(role_code)
    if normalized_role is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Planner role not supported")
    _assert_manageable_role(actor, normalized_role)

    person = await platform_session.get(DimPerson, person_id)
    if not person:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Person not found")

    existing_explicit = await list_explicit_planner_roles(platform_session, [person_id])
    current_explicit = set(existing_explicit.get(person_id, []))
    if "super_admin" not in set(actor.roles):
        protected = current_explicit - set(GL_MANAGEABLE_ROLES)
        if protected:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This person has protected planner roles. Only super admin can modify them.",
            )

    await set_explicit_planner_role(
        platform_session,
        person_id=person_id,
        role_code=normalized_role,
        enabled=payload.enabled,
        granted_by_person_id=user.person_id_platform,
    )

    updated_explicit = await list_explicit_planner_roles(platform_session, [person_id])
    temp_user = UserContext(
        user_id=person.email or person.person_id,
        email=person.email or "unknown@example.com",
        roles=[],
        person_id_platform=person.person_id,
        full_name=person.full_name or person.display_name,
        platform_role_id=person.role_id,
        platform_role_ids=[person.role_id] if person.role_id is not None else [],
        platform_role_codes=[],
        platform_role_names=[],
    )
    effective_roles = resolve_planner_roles(temp_user, person, updated_explicit.get(person_id, []))
    return PlannerRoleAssignmentSetOut(
        person_id=person_id,
        role_code=normalized_role,
        enabled=payload.enabled,
        effective_roles=effective_roles,
    )
