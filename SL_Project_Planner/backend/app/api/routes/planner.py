from __future__ import annotations

import logging
import re
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core.auth import get_current_user
from app.models.planner import PlannerDocument, SLProjectPlannerRow
from app.models.platform_group import DimGroup
from app.models.platform_person import DimPerson
from app.schemas.planner import (
    PlannerActorOut,
    PlannerAssignableMemberOut,
    PlannerAssignmentWorkspaceOut,
    PlannerBoardOut,
    PlannerDecisionIn,
    PlannerProjectOut,
    PlannerRoleCode,
    PlannerRowCreate,
    PlannerRowOut,
    PlannerRowUpdate,
    PlannerSummaryOut,
)
from app.schemas.user import UserContext
from app.services.planner_audit import log_audit_event, planner_row_snapshot
from app.services.planner_scheduler import recalculate_project_schedule
from app.services.planner_policy import PlannerActorPolicy, policy_for_roles, resolve_planner_roles
from app.services.planner_role_access import list_explicit_planner_roles

router = APIRouter(prefix="/planner", tags=["planner"])
logger = logging.getLogger(__name__)

PROTECTED_PLANNING_FIELDS = {
    "project_name",
    "contract_reference",
    "discipline_code",
    "stage_code",
    "package_code",
    "activity_title",
    "plan_layer",
    "source_type",
    "change_type",
    "baseline_start_date",
    "baseline_end_date",
    "live_start_date",
    "live_end_date",
    "duration_days",
    "dependency_codes",
    "schedule_mode",
    "group_leader_person_id",
    "project_anchor_person_id",
    "senior_architect_person_id",
    "assigned_to_person_id",
}
ASSIGNED_EDIT_FIELDS = {"activity_description", "activity_status", "actual_start_date", "actual_end_date", "percent_complete"}
SCOPED_EDIT_FIELDS = ASSIGNED_EDIT_FIELDS | PROTECTED_PLANNING_FIELDS | {"priority", "change_reason"}


async def _auto_activity_code(session: AsyncSession, project_code: str) -> str:
    base_code = (project_code or "GEN").strip().upper().replace(" ", "_")
    prefix = f"ACT-{base_code}-"
    rows = (
        await session.execute(
            select(SLProjectPlannerRow.activity_code).where(
                SLProjectPlannerRow.project_code == project_code,
                SLProjectPlannerRow.activity_code.like(f"{prefix}%"),
            )
        )
    ).scalars().all()
    next_number = 1
    pattern = re.compile(rf"^ACT-{re.escape(base_code)}-(\d+)$")
    for code in rows:
        match = pattern.match(code or "")
        if not match:
            continue
        next_number = max(next_number, int(match.group(1)) + 1)
    return f"{prefix}{next_number:03d}"


def _friendly_db_error(exc: Exception) -> str:
    message = str(getattr(exc, "orig", exc)).lower()
    if "uq_sl_project_planner_project_activity_layer" in message:
        return "Duplicate activity code detected for this project. Please retry."
    if "foreign key constraint fails" in message:
        return "Linked person reference is invalid. Please refresh and try again."
    if "data too long" in message:
        return "One of the fields is too long. Please shorten the value and retry."
    return "Database write failed. Please verify planner DB schema is fully migrated."


async def _safe_recalculate(session: AsyncSession, project_code: str) -> None:
    try:
        async with session.begin_nested():
            await recalculate_project_schedule(session, project_code)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Planner schedule recalc skipped for %s: %s", project_code, exc)


async def _safe_log_audit(session: AsyncSession, **kwargs) -> None:
    try:
        async with session.begin_nested():
            await log_audit_event(session, **kwargs)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Planner audit log skipped: %s", exc)


async def _load_platform_person(platform_session: AsyncSession, person_id: str | None) -> DimPerson | None:
    if not person_id:
        return None
    return await platform_session.get(DimPerson, person_id)


async def _resolve_actor(platform_session: AsyncSession, user: UserContext) -> PlannerActorPolicy:
    person = await _load_platform_person(platform_session, user.person_id_platform)
    explicit_role_map = await list_explicit_planner_roles(platform_session, [user.person_id_platform] if user.person_id_platform else [])
    return policy_for_roles(resolve_planner_roles(user, person, explicit_role_map.get(user.person_id_platform or "", [])))


def _actor_out(user: UserContext, actor: PlannerActorPolicy) -> PlannerActorOut:
    return PlannerActorOut(
        person_id_platform=user.person_id_platform,
        full_name=user.full_name,
        planner_role=actor.role,
        planner_roles=list(actor.roles),
        can_view_all=actor.can_view_all,
        can_create=actor.can_create,
        can_create_project=_actor_has_any_role(actor, "super_admin", "group_leader", "project_anchor"),
        can_edit_scoped=actor.can_edit_scoped,
        can_edit_assigned=actor.can_edit_assigned,
        can_approve_architect=actor.can_approve_architect,
        can_approve_senior_architect=actor.can_approve_senior_architect,
        can_soft_delete=actor.can_soft_delete,
        can_hard_delete=actor.can_hard_delete,
    )


async def _visible_project_codes(session: AsyncSession, actor: PlannerActorPolicy, person_id: str | None) -> list[str] | None:
    if actor.can_view_all:
        return None
    if not person_id:
        return []

    stmt = (
        select(SLProjectPlannerRow.project_code)
        .where(
            or_(
                SLProjectPlannerRow.group_leader_person_id == person_id,
                SLProjectPlannerRow.project_anchor_person_id == person_id,
                SLProjectPlannerRow.senior_architect_person_id == person_id,
                SLProjectPlannerRow.assigned_to_person_id == person_id,
                SLProjectPlannerRow.requested_by_person_id == person_id,
                SLProjectPlannerRow.approved_by_person_id == person_id,
                SLProjectPlannerRow.created_by_person_id == person_id,
            )
        )
        .distinct()
    )
    return sorted({code for code in (await session.execute(stmt)).scalars().all() if code})


async def _person_name_map(
    platform_session: AsyncSession,
    ids: set[str],
) -> tuple[dict[str, str], dict[str, PlannerRoleCode], dict[str, list[PlannerRoleCode]]]:
    clean_ids = [value for value in ids if value]
    if not clean_ids:
        return {}, {}, {}

    people = (await platform_session.execute(select(DimPerson).where(DimPerson.person_id.in_(clean_ids)))).scalars().all()
    explicit_role_map = await list_explicit_planner_roles(platform_session, clean_ids)
    names: dict[str, str] = {}
    primary_roles: dict[str, PlannerRoleCode] = {}
    role_lists: dict[str, list[PlannerRoleCode]] = {}
    for person in people:
        names[person.person_id] = (person.display_name or person.full_name or f"{person.first_name} {person.last_name or ''}").strip() or person.person_id
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
        resolved_roles = resolve_planner_roles(temp_user, person, explicit_role_map.get(person.person_id, []))
        primary_roles[person.person_id] = resolved_roles[0]
        role_lists[person.person_id] = resolved_roles
    return names, primary_roles, role_lists


def _can_edit_row(actor: PlannerActorPolicy, row: SLProjectPlannerRow, person_id: str | None) -> bool:
    if actor.can_hard_delete:
        return True
    if actor.can_edit_scoped:
        return (
            row.group_leader_person_id == person_id
            or row.project_anchor_person_id == person_id
            or row.senior_architect_person_id == person_id
            or row.assigned_to_person_id == person_id
        )
    if actor.can_edit_assigned:
        return row.assigned_to_person_id == person_id
    return False


def _can_delete_row(actor: PlannerActorPolicy, _row: SLProjectPlannerRow, _person_id: str | None) -> bool:
    if actor.can_hard_delete:
        return True
    if actor.can_soft_delete:
        return True
    return False


def _actor_has_any_role(actor: PlannerActorPolicy, *roles: PlannerRoleCode) -> bool:
    actor_roles = set(actor.roles)
    return any(role in actor_roles for role in roles)


def _normalize_status(value: object) -> str:
    return str(value or "").strip().lower()


def _parse_member_ids(raw_value: str | None) -> list[str]:
    seen: set[str] = set()
    values: list[str] = []
    for token in str(raw_value or "").split(","):
        person_id = token.strip()
        if not person_id or person_id in seen:
            continue
        seen.add(person_id)
        values.append(person_id)
    return values


def _is_active_platform_person(person: DimPerson | None) -> bool:
    if person is None:
        return False
    if int(person.is_deleted or 0) == 1:
        return False
    return _normalize_status(person.status) in {"working", "active", ""}


def _person_display_name(person: DimPerson) -> str:
    fallback = " ".join(
        part
        for part in [str(person.first_name or "").strip(), str(person.last_name or "").strip()]
        if part
    ).strip()
    return str(person.display_name or person.full_name or fallback or person.email or person.person_id).strip()


async def _managed_group_member_scope(
    platform_session: AsyncSession,
    planner_session: AsyncSession,
    *,
    actor: PlannerActorPolicy,
    person_id: str | None,
    project_code: str | None = None,
) -> tuple[set[str], dict[str, tuple[int, str]]]:
    if actor.can_hard_delete:
        groups = (await platform_session.execute(select(DimGroup))).scalars().all()
        all_member_ids: set[str] = set()
        person_to_group: dict[str, tuple[int, str]] = {}
        for group in groups:
            member_ids = _parse_member_ids(group.member_person_ids)
            leader_id = str(group.group_leader_person_id or "").strip()
            scoped_ids = member_ids[:]
            if leader_id and leader_id not in scoped_ids:
                scoped_ids = [leader_id, *scoped_ids]
            for member_id in scoped_ids:
                if not member_id:
                    continue
                all_member_ids.add(member_id)
                person_to_group.setdefault(member_id, (int(group.group_id), str(group.group_name or "")))
        return all_member_ids, person_to_group

    if not person_id:
        return set(), {}

    managed_leader_ids: set[str] = {person_id}
    if project_code:
        managed_rows = (
            await planner_session.execute(
                select(SLProjectPlannerRow.group_leader_person_id)
                .where(
                    SLProjectPlannerRow.project_code == project_code,
                    SLProjectPlannerRow.is_deleted == 0,
                    or_(
                        SLProjectPlannerRow.group_leader_person_id == person_id,
                        SLProjectPlannerRow.project_anchor_person_id == person_id,
                    ),
                )
                .distinct()
            )
        ).scalars().all()
        managed_leader_ids.update({str(value).strip() for value in managed_rows if str(value or "").strip()})

    groups = (await platform_session.execute(select(DimGroup))).scalars().all()
    scoped_member_ids: set[str] = set()
    person_to_group: dict[str, tuple[int, str]] = {}
    for group in groups:
        member_ids = _parse_member_ids(group.member_person_ids)
        leader_id = str(group.group_leader_person_id or "").strip()
        actor_is_member = person_id in member_ids or leader_id == person_id
        manages_group = actor_is_member or (leader_id and leader_id in managed_leader_ids)
        if not manages_group:
            continue
        scoped_ids = member_ids[:]
        if leader_id and leader_id not in scoped_ids:
            scoped_ids = [leader_id, *scoped_ids]
        for member_id in scoped_ids:
            if not member_id:
                continue
            scoped_member_ids.add(member_id)
            person_to_group.setdefault(member_id, (int(group.group_id), str(group.group_name or "")))
    return scoped_member_ids, person_to_group


def _serialize_row(
    row: SLProjectPlannerRow,
    *,
    names: dict[str, str],
    requester_roles: dict[str, PlannerRoleCode],
    requester_role_lists: dict[str, list[PlannerRoleCode]],
    actor: PlannerActorPolicy,
    person_id: str | None,
) -> PlannerRowOut:
    requester_role = requester_roles.get(row.requested_by_person_id or "")
    requester_role_list = requester_role_lists.get(row.requested_by_person_id or "", [])
    return PlannerRowOut(
        planner_row_id=row.planner_row_id,
        project_code=row.project_code,
        project_name=row.project_name,
        contract_reference=row.contract_reference,
        discipline_code=row.discipline_code,
        stage_code=row.stage_code,
        package_code=row.package_code,
        activity_code=row.activity_code,
        activity_title=row.activity_title,
        activity_description=row.activity_description,
        plan_layer=row.plan_layer,  # type: ignore[arg-type]
        source_type=row.source_type,  # type: ignore[arg-type]
        change_type=row.change_type,  # type: ignore[arg-type]
        change_reason=row.change_reason,
        activity_status=row.activity_status,  # type: ignore[arg-type]
        approval_status=row.approval_status,  # type: ignore[arg-type]
        approval_note=row.approval_note,
        priority=row.priority,  # type: ignore[arg-type]
        baseline_start_date=row.baseline_start_date,
        baseline_end_date=row.baseline_end_date,
        live_start_date=row.live_start_date,
        live_end_date=row.live_end_date,
        actual_start_date=row.actual_start_date,
        actual_end_date=row.actual_end_date,
        duration_days=row.duration_days,
        percent_complete=row.percent_complete,
        dependency_codes=row.dependency_codes,
        schedule_mode=row.schedule_mode,  # type: ignore[arg-type]
        group_leader_person_id=row.group_leader_person_id,
        project_anchor_person_id=row.project_anchor_person_id,
        senior_architect_person_id=row.senior_architect_person_id,
        assigned_to_person_id=row.assigned_to_person_id,
        requested_by_person_id=row.requested_by_person_id,
        approved_by_person_id=row.approved_by_person_id,
        approval_requested_at=row.approval_requested_at,
        approval_action_at=row.approval_action_at,
        scheduled_start_date=row.scheduled_start_date,
        scheduled_end_date=row.scheduled_end_date,
        float_days=row.float_days,
        is_critical=row.is_critical,
        last_schedule_run_at=row.last_schedule_run_at,
        is_deleted=row.is_deleted,
        deleted_at=row.deleted_at,
        created_by_person_id=row.created_by_person_id,
        updated_by_person_id=row.updated_by_person_id,
        created_at=row.created_at,
        updated_at=row.updated_at,
        group_leader_name=names.get(row.group_leader_person_id or ""),
        project_anchor_name=names.get(row.project_anchor_person_id or ""),
        senior_architect_name=names.get(row.senior_architect_person_id or ""),
        assigned_to_name=names.get(row.assigned_to_person_id or ""),
        requested_by_name=names.get(row.requested_by_person_id or ""),
        approved_by_name=names.get(row.approved_by_person_id or ""),
        requester_role=requester_role,
        requester_roles=requester_role_list,
        can_edit=_can_edit_row(actor, row, person_id),
        can_delete=_can_delete_row(actor, row, person_id),
        can_approve=False,
        can_reject=False,
    )


def _summary(rows: list[SLProjectPlannerRow]) -> PlannerSummaryOut:
    return PlannerSummaryOut(
        total_rows=len(rows),
        pending_rows=sum(1 for row in rows if row.activity_status != "completed"),
        completed_rows=sum(1 for row in rows if row.activity_status == "completed"),
        pending_approvals=0,
        live_rows=sum(1 for row in rows if row.plan_layer == "live_plan"),
        contract_rows=sum(1 for row in rows if row.plan_layer == "contract_baseline"),
        approved_change_rows=sum(1 for row in rows if row.plan_layer == "approved_change"),
        critical_rows=sum(1 for row in rows if row.is_critical == 1),
    )


def _allowed_update_fields(actor: PlannerActorPolicy) -> set[str]:
    if actor.can_hard_delete or _actor_has_any_role(actor, "group_leader", "project_anchor", "senior_architect"):
        return SCOPED_EDIT_FIELDS
    if _actor_has_any_role(actor, "architect"):
        return ASSIGNED_EDIT_FIELDS | {"change_reason"}
    return set()


def _requires_approval(actor: PlannerActorPolicy, changed_fields: set[str], current_change_type: str | None, next_change_type: str | None) -> bool:
    del actor, changed_fields, current_change_type, next_change_type
    return False


async def _load_visible_row(
    planner_row_id: int,
    *,
    session: AsyncSession,
    actor: PlannerActorPolicy,
    person_id: str | None,
) -> SLProjectPlannerRow:
    row = await session.get(SLProjectPlannerRow, planner_row_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Planner row not found")
    if actor.can_view_all:
        return row
    visible_projects = await _visible_project_codes(session, actor, person_id)
    if not visible_projects or row.project_code not in visible_projects:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access restricted")
    return row


def _related_person_ids(row: SLProjectPlannerRow) -> set[str]:
    return {
        value
        for value in [
            row.group_leader_person_id,
            row.project_anchor_person_id,
            row.senior_architect_person_id,
            row.assigned_to_person_id,
            row.requested_by_person_id,
            row.approved_by_person_id,
        ]
        if value
    }


@router.get("", response_model=PlannerBoardOut)
async def get_planner_board(
    project_code: str | None = Query(default=None),
    include_deleted: bool = Query(default=False),
    session: AsyncSession = Depends(deps.get_db_session),
    platform_session: AsyncSession = Depends(deps.get_platform_db_session),
    user: UserContext = Depends(get_current_user),
):
    actor = await _resolve_actor(platform_session, user)
    visible_projects = await _visible_project_codes(session, actor, user.person_id_platform)

    if project_code and visible_projects is not None and project_code not in visible_projects:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access restricted")

    stmt = select(SLProjectPlannerRow)
    if not include_deleted or not actor.can_hard_delete:
        stmt = stmt.where(SLProjectPlannerRow.is_deleted == 0)
    if project_code:
        stmt = stmt.where(SLProjectPlannerRow.project_code == project_code)
    elif visible_projects is not None:
        if not visible_projects:
            return PlannerBoardOut(actor=_actor_out(user, actor), projects=[], summary=PlannerSummaryOut(), items=[])
        stmt = stmt.where(SLProjectPlannerRow.project_code.in_(visible_projects))

    stmt = stmt.order_by(
        SLProjectPlannerRow.project_code.asc(),
        SLProjectPlannerRow.stage_code.asc(),
        SLProjectPlannerRow.package_code.asc(),
        SLProjectPlannerRow.activity_code.asc(),
        SLProjectPlannerRow.planner_row_id.asc(),
    )
    rows = (await session.execute(stmt)).scalars().all()
    related_ids = set().union(*[_related_person_ids(row) for row in rows]) if rows else set()
    names, requester_roles, requester_role_lists = await _person_name_map(platform_session, related_ids)
    items = [
        _serialize_row(
            row,
            names=names,
            requester_roles=requester_roles,
            requester_role_lists=requester_role_lists,
            actor=actor,
            person_id=user.person_id_platform,
        )
        for row in rows
    ]

    seen_projects: dict[str, str] = {}
    for row in rows:
        seen_projects.setdefault(row.project_code, row.project_name)

    document_count_stmt = select(func.count(PlannerDocument.document_id))
    if project_code:
        document_count_stmt = document_count_stmt.where(PlannerDocument.project_code == project_code)
    elif visible_projects is not None:
        if visible_projects:
            document_count_stmt = document_count_stmt.where(PlannerDocument.project_code.in_(visible_projects))
        else:
            document_count_stmt = document_count_stmt.where(PlannerDocument.document_id == -1)
    document_count = int((await session.execute(document_count_stmt)).scalar() or 0)

    summary_payload = _summary(rows).model_dump()
    summary_payload["attached_documents"] = document_count

    return PlannerBoardOut(
        actor=_actor_out(user, actor),
        projects=[PlannerProjectOut(project_code=code, project_name=name) for code, name in seen_projects.items()],
        summary=PlannerSummaryOut(**summary_payload),
        items=items,
    )


@router.get("/assignments", response_model=PlannerAssignmentWorkspaceOut)
async def planner_assignment_workspace(
    project_code: str | None = Query(default=None),
    session: AsyncSession = Depends(deps.get_db_session),
    platform_session: AsyncSession = Depends(deps.get_platform_db_session),
    user: UserContext = Depends(get_current_user),
):
    actor = await _resolve_actor(platform_session, user)
    visible_projects = await _visible_project_codes(session, actor, user.person_id_platform)
    if project_code and visible_projects is not None and project_code not in visible_projects:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access restricted")

    can_assign = bool(actor.can_edit_scoped or actor.can_hard_delete)
    scoped_member_ids: set[str] = set()
    person_to_group: dict[str, tuple[int, str]] = {}
    if can_assign:
        scoped_member_ids, person_to_group = await _managed_group_member_scope(
            platform_session,
            session,
            actor=actor,
            person_id=user.person_id_platform,
            project_code=project_code,
        )

    assignable_members: list[PlannerAssignableMemberOut] = []
    if scoped_member_ids:
        members = (
            await platform_session.execute(
                select(DimPerson).where(DimPerson.person_id.in_(sorted(scoped_member_ids)))
            )
        ).scalars().all()
        for person in members:
            if not _is_active_platform_person(person):
                continue
            group_payload = person_to_group.get(person.person_id)
            assignable_members.append(
                PlannerAssignableMemberOut(
                    person_id=person.person_id,
                    person_code=person.person_code,
                    full_name=_person_display_name(person),
                    email=person.email,
                    assigned_group_id=group_payload[0] if group_payload else None,
                    assigned_group_name=group_payload[1] if group_payload else None,
                )
            )
        assignable_members.sort(key=lambda value: value.full_name.lower())

    my_total_assigned_tasks = 0
    my_open_assigned_tasks = 0
    if user.person_id_platform:
        base_filters = [
            SLProjectPlannerRow.assigned_to_person_id == user.person_id_platform,
            SLProjectPlannerRow.is_deleted == 0,
        ]
        total_stmt = select(func.count(SLProjectPlannerRow.planner_row_id)).where(*base_filters)
        open_stmt = select(func.count(SLProjectPlannerRow.planner_row_id)).where(
            *base_filters,
            SLProjectPlannerRow.activity_status != "completed",
        )
        if visible_projects is not None:
            if visible_projects:
                total_stmt = total_stmt.where(SLProjectPlannerRow.project_code.in_(visible_projects))
                open_stmt = open_stmt.where(SLProjectPlannerRow.project_code.in_(visible_projects))
            else:
                total_stmt = total_stmt.where(SLProjectPlannerRow.planner_row_id == -1)
                open_stmt = open_stmt.where(SLProjectPlannerRow.planner_row_id == -1)
        my_total_assigned_tasks = int((await session.execute(total_stmt)).scalar() or 0)
        my_open_assigned_tasks = int((await session.execute(open_stmt)).scalar() or 0)

    return PlannerAssignmentWorkspaceOut(
        project_code=project_code,
        can_assign=can_assign,
        assignable_members=assignable_members,
        my_total_assigned_tasks=my_total_assigned_tasks,
        my_open_assigned_tasks=my_open_assigned_tasks,
    )


@router.post("", response_model=PlannerRowOut, status_code=status.HTTP_201_CREATED)
async def create_planner_row(
    payload: PlannerRowCreate,
    session: AsyncSession = Depends(deps.get_db_session),
    platform_session: AsyncSession = Depends(deps.get_platform_db_session),
    user: UserContext = Depends(get_current_user),
):
    actor = await _resolve_actor(platform_session, user)
    if not actor.can_create:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    project_code = str(payload.project_code or "").strip()
    if not project_code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="project_code is required")
    project_exists = (
        await session.execute(
            select(SLProjectPlannerRow.planner_row_id)
            .where(SLProjectPlannerRow.project_code == project_code)
            .limit(1)
        )
    ).scalar_one_or_none()
    if project_exists is None and not _actor_has_any_role(actor, "super_admin", "group_leader", "project_anchor"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Group Leaders, Project Anchors, or Super Admin can create new projects",
        )

    payload_data = payload.model_dump()
    payload_data["project_code"] = project_code
    if not str(payload_data.get("activity_code") or "").strip():
        payload_data["activity_code"] = await _auto_activity_code(session, str(payload_data.get("project_code") or "GEN"))

    requested_by = payload.requested_by_person_id

    if _actor_has_any_role(actor, "group_leader") and not payload_data.get("group_leader_person_id") and user.person_id_platform:
        payload_data["group_leader_person_id"] = user.person_id_platform
    if _actor_has_any_role(actor, "project_anchor") and not payload_data.get("project_anchor_person_id") and user.person_id_platform:
        payload_data["project_anchor_person_id"] = user.person_id_platform
    if _actor_has_any_role(actor, "senior_architect") and not payload_data.get("senior_architect_person_id") and user.person_id_platform:
        payload_data["senior_architect_person_id"] = user.person_id_platform
    if _actor_has_any_role(actor, "architect") and not payload_data.get("assigned_to_person_id") and user.person_id_platform:
        payload_data["assigned_to_person_id"] = user.person_id_platform
    target_person_id = str(payload_data.get("assigned_to_person_id") or "").strip()
    if target_person_id and not actor.can_hard_delete and _actor_has_any_role(actor, "group_leader", "project_anchor"):
        scoped_member_ids, _ = await _managed_group_member_scope(
            platform_session,
            session,
            actor=actor,
            person_id=user.person_id_platform,
            project_code=project_code,
        )
        if target_person_id not in scoped_member_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can assign tasks only to members of your managed group.",
            )

    payload_data["approval_status"] = "not_required"
    payload_data["requested_by_person_id"] = requested_by
    payload_data["approval_requested_at"] = None
    payload_data["approved_by_person_id"] = None
    payload_data["approval_action_at"] = None
    payload_data["approval_note"] = None
    payload_data["created_by_person_id"] = user.person_id_platform
    payload_data["updated_by_person_id"] = user.person_id_platform

    row = SLProjectPlannerRow(**payload_data)
    session.add(row)
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=_friendly_db_error(exc)) from exc
    except SQLAlchemyError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=_friendly_db_error(exc)) from exc

    request_row = None

    await _safe_recalculate(session, row.project_code)
    await _safe_log_audit(
        session,
        project_code=row.project_code,
        entity_type="planner_row",
        entity_id=str(row.planner_row_id),
        action_type="created",
        actor_person_id=user.person_id_platform,
        actor_role=actor.role,
        planner_row_id=row.planner_row_id,
        request_id=request_row.request_id if request_row else None,
        change_summary="Planner row created",
        after_payload=planner_row_snapshot(row),
    )
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=_friendly_db_error(exc)) from exc
    except SQLAlchemyError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=_friendly_db_error(exc)) from exc
    await session.refresh(row)
    names, requester_roles, requester_role_lists = await _person_name_map(platform_session, _related_person_ids(row))
    return _serialize_row(
        row,
        names=names,
        requester_roles=requester_roles,
        requester_role_lists=requester_role_lists,
        actor=actor,
        person_id=user.person_id_platform,
    )


@router.patch("/{planner_row_id}", response_model=PlannerRowOut)
async def update_planner_row(
    planner_row_id: int,
    payload: PlannerRowUpdate,
    session: AsyncSession = Depends(deps.get_db_session),
    platform_session: AsyncSession = Depends(deps.get_platform_db_session),
    user: UserContext = Depends(get_current_user),
):
    actor = await _resolve_actor(platform_session, user)
    row = await _load_visible_row(planner_row_id, session=session, actor=actor, person_id=user.person_id_platform)
    if not _can_edit_row(actor, row, user.person_id_platform):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")

    updates = payload.model_dump(exclude_unset=True)
    allowed = _allowed_update_fields(actor)
    rejected = [field for field in updates.keys() if field not in allowed]
    if rejected:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Fields not editable for your role: {', '.join(sorted(rejected))}")
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nothing to update")
    if "assigned_to_person_id" in updates:
        target_person_id = str(updates.get("assigned_to_person_id") or "").strip()
        if target_person_id and not actor.can_hard_delete:
            scoped_member_ids, _ = await _managed_group_member_scope(
                platform_session,
                session,
                actor=actor,
                person_id=user.person_id_platform,
                project_code=row.project_code,
            )
            if target_person_id not in scoped_member_ids:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You can assign tasks only to members of your managed group.",
                )

    before_payload = planner_row_snapshot(row)
    for field, value in updates.items():
        setattr(row, field, value)
    row.approval_status = "not_required"
    row.approval_requested_at = None
    row.approved_by_person_id = None
    row.approval_action_at = None
    row.approval_note = None
    row.updated_by_person_id = user.person_id_platform
    await _safe_recalculate(session, row.project_code)
    await _safe_log_audit(
        session,
        project_code=row.project_code,
        entity_type="planner_row",
        entity_id=str(row.planner_row_id),
        action_type="updated",
        actor_person_id=user.person_id_platform,
        actor_role=actor.role,
        planner_row_id=row.planner_row_id,
        change_summary="Planner row updated",
        before_payload=before_payload,
        after_payload=updates,
    )
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=_friendly_db_error(exc)) from exc
    except SQLAlchemyError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=_friendly_db_error(exc)) from exc
    await session.refresh(row)
    names, requester_roles, requester_role_lists = await _person_name_map(platform_session, _related_person_ids(row))
    return _serialize_row(
        row,
        names=names,
        requester_roles=requester_roles,
        requester_role_lists=requester_role_lists,
        actor=actor,
        person_id=user.person_id_platform,
    )


async def _decide_planner_row(
    *,
    planner_row_id: int,
    payload: PlannerDecisionIn,
    decision: str,
    session: AsyncSession,
    platform_session: AsyncSession,
    user: UserContext,
) -> PlannerRowOut:
    del planner_row_id, payload, decision, session, platform_session, user
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="Approval workflow is temporarily disabled for planner rows.",
    )


@router.post("/{planner_row_id}/approve", response_model=PlannerRowOut)
async def approve_planner_row(
    planner_row_id: int,
    payload: PlannerDecisionIn,
    session: AsyncSession = Depends(deps.get_db_session),
    platform_session: AsyncSession = Depends(deps.get_platform_db_session),
    user: UserContext = Depends(get_current_user),
):
    return await _decide_planner_row(
        planner_row_id=planner_row_id,
        payload=payload,
        decision="approved",
        session=session,
        platform_session=platform_session,
        user=user,
    )


@router.post("/{planner_row_id}/reject", response_model=PlannerRowOut)
async def reject_planner_row(
    planner_row_id: int,
    payload: PlannerDecisionIn,
    session: AsyncSession = Depends(deps.get_db_session),
    platform_session: AsyncSession = Depends(deps.get_platform_db_session),
    user: UserContext = Depends(get_current_user),
):
    return await _decide_planner_row(
        planner_row_id=planner_row_id,
        payload=payload,
        decision="rejected",
        session=session,
        platform_session=platform_session,
        user=user,
    )


@router.delete("/{planner_row_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_planner_row(
    planner_row_id: int,
    hard: bool = Query(default=False),
    session: AsyncSession = Depends(deps.get_db_session),
    platform_session: AsyncSession = Depends(deps.get_platform_db_session),
    user: UserContext = Depends(get_current_user),
):
    actor = await _resolve_actor(platform_session, user)
    row = await _load_visible_row(planner_row_id, session=session, actor=actor, person_id=user.person_id_platform)
    if not _can_delete_row(actor, row, user.person_id_platform):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")

    before_payload = planner_row_snapshot(row)
    if hard:
        if not actor.can_hard_delete:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only super admin can hard delete")
        await _safe_log_audit(
            session,
            project_code=row.project_code,
            entity_type="planner_row",
            entity_id=str(row.planner_row_id),
            action_type="hard_deleted",
            actor_person_id=user.person_id_platform,
            actor_role=actor.role,
            planner_row_id=row.planner_row_id,
            change_summary="Planner row hard deleted",
            before_payload=before_payload,
        )
        await session.delete(row)
    else:
        row.is_deleted = 1
        row.deleted_at = datetime.utcnow()
        row.updated_by_person_id = user.person_id_platform
        await _safe_log_audit(
            session,
            project_code=row.project_code,
            entity_type="planner_row",
            entity_id=str(row.planner_row_id),
            action_type="archived",
            actor_person_id=user.person_id_platform,
            actor_role=actor.role,
            planner_row_id=row.planner_row_id,
            change_summary="Planner row archived",
            before_payload=before_payload,
            after_payload={"is_deleted": 1, "deleted_at": row.deleted_at},
        )
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=_friendly_db_error(exc)) from exc
    except SQLAlchemyError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=_friendly_db_error(exc)) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)
