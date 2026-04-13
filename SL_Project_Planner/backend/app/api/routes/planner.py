from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core.auth import get_current_user
from app.models.planner import PlannerChangeRequest, PlannerDocument, SLProjectPlannerRow
from app.models.platform_person import DimPerson
from app.schemas.planner import (
    PlannerActorOut,
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
from app.services.planner_audit import dumps_json, log_audit_event, planner_row_snapshot
from app.services.planner_scheduler import recalculate_project_schedule
from app.services.planner_policy import PlannerActorPolicy, can_approve_requester, policy_for_role, resolve_planner_role

router = APIRouter(prefix="/planner", tags=["planner"])

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


async def _load_platform_person(platform_session: AsyncSession, person_id: str | None) -> DimPerson | None:
    if not person_id:
        return None
    return await platform_session.get(DimPerson, person_id)


async def _resolve_actor(platform_session: AsyncSession, user: UserContext) -> PlannerActorPolicy:
    person = await _load_platform_person(platform_session, user.person_id_platform)
    return policy_for_role(resolve_planner_role(user, person))


def _actor_out(user: UserContext, actor: PlannerActorPolicy) -> PlannerActorOut:
    return PlannerActorOut(
        person_id_platform=user.person_id_platform,
        full_name=user.full_name,
        planner_role=actor.role,
        can_view_all=actor.can_view_all,
        can_create=actor.can_create,
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


async def _person_name_map(platform_session: AsyncSession, ids: set[str]) -> tuple[dict[str, str], dict[str, PlannerRoleCode]]:
    clean_ids = [value for value in ids if value]
    if not clean_ids:
        return {}, {}

    people = (await platform_session.execute(select(DimPerson).where(DimPerson.person_id.in_(clean_ids)))).scalars().all()
    names: dict[str, str] = {}
    roles: dict[str, PlannerRoleCode] = {}
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
        roles[person.person_id] = resolve_planner_role(temp_user, person)
    return names, roles


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


def _can_delete_row(actor: PlannerActorPolicy, row: SLProjectPlannerRow, person_id: str | None) -> bool:
    if actor.can_hard_delete:
        return True
    if actor.can_soft_delete:
        return row.group_leader_person_id == person_id or row.project_anchor_person_id == person_id
    return False


def _serialize_row(
    row: SLProjectPlannerRow,
    *,
    names: dict[str, str],
    requester_roles: dict[str, PlannerRoleCode],
    actor: PlannerActorPolicy,
    person_id: str | None,
) -> PlannerRowOut:
    requester_role = requester_roles.get(row.requested_by_person_id or "")
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
        can_edit=_can_edit_row(actor, row, person_id),
        can_delete=_can_delete_row(actor, row, person_id),
        can_approve=row.approval_status == "pending" and can_approve_requester(actor, requester_role),
        can_reject=row.approval_status == "pending" and can_approve_requester(actor, requester_role),
    )


def _summary(rows: list[SLProjectPlannerRow]) -> PlannerSummaryOut:
    return PlannerSummaryOut(
        total_rows=len(rows),
        pending_rows=sum(1 for row in rows if row.activity_status != "completed"),
        completed_rows=sum(1 for row in rows if row.activity_status == "completed"),
        pending_approvals=sum(1 for row in rows if row.approval_status == "pending"),
        live_rows=sum(1 for row in rows if row.plan_layer == "live_plan"),
        contract_rows=sum(1 for row in rows if row.plan_layer == "contract_baseline"),
        approved_change_rows=sum(1 for row in rows if row.plan_layer == "approved_change"),
        critical_rows=sum(1 for row in rows if row.is_critical == 1),
    )


def _allowed_update_fields(actor: PlannerActorPolicy) -> set[str]:
    if actor.can_hard_delete or actor.role in {"group_leader", "project_anchor", "senior_architect"}:
        return SCOPED_EDIT_FIELDS
    if actor.role == "architect":
        return ASSIGNED_EDIT_FIELDS | {"change_reason"}
    return set()


def _requires_approval(actor: PlannerActorPolicy, changed_fields: set[str], current_change_type: str | None, next_change_type: str | None) -> bool:
    if actor.role in {"super_admin", "group_leader", "project_anchor"}:
        return False
    if PROTECTED_PLANNING_FIELDS & changed_fields:
        return True
    return (next_change_type or current_change_type or "none") != "none"


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
    names, requester_roles = await _person_name_map(platform_session, related_ids)
    items = [_serialize_row(row, names=names, requester_roles=requester_roles, actor=actor, person_id=user.person_id_platform) for row in rows]

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

    return PlannerBoardOut(
        actor=_actor_out(user, actor),
        projects=[PlannerProjectOut(project_code=code, project_name=name) for code, name in seen_projects.items()],
        summary=PlannerSummaryOut(**_summary(rows).model_dump(), attached_documents=document_count),
        items=items,
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

    now = datetime.utcnow()
    requested_by = payload.requested_by_person_id
    approval_status = payload.approval_status
    approval_requested_at = None

    if actor.role == "group_leader" and not payload.group_leader_person_id and user.person_id_platform:
        payload.group_leader_person_id = user.person_id_platform
    if actor.role == "project_anchor" and not payload.project_anchor_person_id and user.person_id_platform:
        payload.project_anchor_person_id = user.person_id_platform
    if actor.role == "senior_architect" and not payload.senior_architect_person_id and user.person_id_platform:
        payload.senior_architect_person_id = user.person_id_platform
    if actor.role == "architect" and not payload.assigned_to_person_id and user.person_id_platform:
        payload.assigned_to_person_id = user.person_id_platform

    if _requires_approval(actor, set(payload.model_fields_set), payload.change_type, payload.change_type):
        if not payload.change_reason:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="change_reason is required for approval-routed changes")
        approval_status = "pending"
        requested_by = user.person_id_platform
        approval_requested_at = now

    row = SLProjectPlannerRow(
        **payload.model_dump(),
        approval_status=approval_status,
        requested_by_person_id=requested_by,
        approval_requested_at=approval_requested_at,
        created_by_person_id=user.person_id_platform,
        updated_by_person_id=user.person_id_platform,
    )
    session.add(row)
    await session.flush()

    request_row = None
    if approval_status == "pending":
        request_row = PlannerChangeRequest(
            planner_row_id=row.planner_row_id,
            project_code=row.project_code,
            request_type="scope",
            request_status="pending",
            requested_by_person_id=user.person_id_platform,
            requester_role=actor.role,
            request_reason=row.change_reason,
            proposed_json=dumps_json(planner_row_snapshot(row)),
        )
        session.add(request_row)
        await session.flush()

    await recalculate_project_schedule(session, row.project_code)
    await log_audit_event(
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
    await session.commit()
    await session.refresh(row)
    names, requester_roles = await _person_name_map(platform_session, _related_person_ids(row))
    return _serialize_row(row, names=names, requester_roles=requester_roles, actor=actor, person_id=user.person_id_platform)


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

    before_payload = planner_row_snapshot(row)
    current_change_type = row.change_type
    changed_fields = set(updates.keys())
    if _requires_approval(actor, changed_fields, current_change_type, updates.get("change_type")):
        if not (updates.get("change_reason") or row.change_reason):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="change_reason is required for approval-routed changes")
        request_row = PlannerChangeRequest(
            planner_row_id=row.planner_row_id,
            project_code=row.project_code,
            request_type="schedule" if PROTECTED_PLANNING_FIELDS & changed_fields else "status",
            request_status="pending",
            requested_by_person_id=user.person_id_platform,
            requester_role=actor.role,
            request_reason=updates.get("change_reason") or row.change_reason,
            before_json=dumps_json(before_payload),
            proposed_json=dumps_json(updates),
        )
        session.add(request_row)
        row.approval_status = "pending"
        row.requested_by_person_id = user.person_id_platform
        row.approval_requested_at = datetime.utcnow()
        row.approved_by_person_id = None
        row.approval_action_at = None
        row.approval_note = None
        row.updated_by_person_id = user.person_id_platform
        await session.flush()
        await log_audit_event(
            session,
            project_code=row.project_code,
            entity_type="change_request",
            entity_id=str(request_row.request_id),
            action_type="created",
            actor_person_id=user.person_id_platform,
            actor_role=actor.role,
            planner_row_id=row.planner_row_id,
            request_id=request_row.request_id,
            change_summary="Approval-routed update submitted",
            before_payload=before_payload,
            after_payload=updates,
        )
    else:
        for field, value in updates.items():
            setattr(row, field, value)
        row.updated_by_person_id = user.person_id_platform
        await recalculate_project_schedule(session, row.project_code)
        await log_audit_event(
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
    await session.commit()
    await session.refresh(row)
    names, requester_roles = await _person_name_map(platform_session, _related_person_ids(row))
    return _serialize_row(row, names=names, requester_roles=requester_roles, actor=actor, person_id=user.person_id_platform)


async def _decide_planner_row(
    *,
    planner_row_id: int,
    payload: PlannerDecisionIn,
    decision: str,
    session: AsyncSession,
    platform_session: AsyncSession,
    user: UserContext,
) -> PlannerRowOut:
    actor = await _resolve_actor(platform_session, user)
    row = await _load_visible_row(planner_row_id, session=session, actor=actor, person_id=user.person_id_platform)
    if row.approval_status != "pending":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only pending rows can be reviewed")

    _, requester_roles = await _person_name_map(platform_session, {row.requested_by_person_id} if row.requested_by_person_id else set())
    requester_role = requester_roles.get(row.requested_by_person_id or "")
    if not can_approve_requester(actor, requester_role):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")

    pending_request = (
        await session.execute(
            select(PlannerChangeRequest)
            .where(
                PlannerChangeRequest.planner_row_id == row.planner_row_id,
                PlannerChangeRequest.request_status == "pending",
            )
            .order_by(PlannerChangeRequest.created_at.desc(), PlannerChangeRequest.request_id.desc())
            .limit(1)
        )
    ).scalars().first()

    before_payload = planner_row_snapshot(row)
    if decision == "approved" and pending_request and pending_request.proposed_json:
        proposed_updates = json.loads(pending_request.proposed_json)
        for field, value in proposed_updates.items():
            if hasattr(row, field):
                setattr(row, field, value)
        await recalculate_project_schedule(session, row.project_code)

    row.approval_status = decision
    row.approved_by_person_id = user.person_id_platform
    row.approval_note = payload.approval_note
    row.approval_action_at = datetime.utcnow()
    row.updated_by_person_id = user.person_id_platform
    if pending_request:
        pending_request.request_status = "approved" if decision == "approved" else "rejected"
        pending_request.approver_person_id = user.person_id_platform
        pending_request.approver_role = actor.role
        pending_request.approval_note = payload.approval_note
        pending_request.decided_at = datetime.utcnow()
    await log_audit_event(
        session,
        project_code=row.project_code,
        entity_type="planner_row" if not pending_request else "change_request",
        entity_id=str(row.planner_row_id if not pending_request else pending_request.request_id),
        action_type=decision,
        actor_person_id=user.person_id_platform,
        actor_role=actor.role,
        planner_row_id=row.planner_row_id,
        request_id=pending_request.request_id if pending_request else None,
        change_summary=f"Planner row {decision}",
        before_payload=before_payload,
        after_payload=planner_row_snapshot(row),
    )
    await session.commit()
    await session.refresh(row)
    names, requester_roles = await _person_name_map(platform_session, _related_person_ids(row))
    return _serialize_row(row, names=names, requester_roles=requester_roles, actor=actor, person_id=user.person_id_platform)


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
        await log_audit_event(
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
        await log_audit_event(
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
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
