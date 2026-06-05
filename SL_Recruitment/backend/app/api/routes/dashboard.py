from __future__ import annotations

import json
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import case, false, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import StreamingResponse
import asyncio

from app.api import deps
from app.core.auth import require_roles
from app.core.config import settings
from app.core.roles import Role
from app.db.platform_session import PlatformSessionLocal
from app.models.candidate import RecCandidate
from app.models.candidate_offer import RecCandidateOffer
from app.models.candidate_sprint import RecCandidateSprint
from app.models.event import RecCandidateEvent
from app.models.interview import RecCandidateInterview
from app.models.opening import RecOpening
from app.models.platform_person import DimPerson
from app.models.screening import RecCandidateScreening
from app.models.stage import RecCandidateStage
from app.schemas.dashboard import AssignmentSummaryOut, AssignmentWorkloadOut, DashboardMetricsOut, StageCount
from app.schemas.event import CandidateEventOut
from app.schemas.user import UserContext
from app.services.event_bus import event_bus
from app.services.platform_identity import active_status_filter
from app.services.workflow_policy import INTERN_OPENING_CODES

router = APIRouter(prefix="/rec", tags=["dashboard"])

DEFAULT_HR_OWNER_EMAIL = "nishant.singh@studiolotus.in"
DEFAULT_HR_OWNER_NAME = "Nishant Singh"
CLOSED_CANDIDATE_STATUSES = ("hired", "rejected", "declined")


def _normalize_role_token(value: object) -> str:
    token = str(value or "").strip().lower()
    if not token:
        return ""
    return token.replace("-", "_").replace(" ", "_")


def _actor_role_ids(user: UserContext) -> set[int]:
    values: list[object] = []
    if user.platform_role_id is not None:
        values.append(user.platform_role_id)
    values.extend(user.platform_role_ids or [])
    role_ids: set[int] = set()
    for value in values:
        raw = str(value or "").strip()
        if not raw:
            continue
        try:
            role_ids.add(int(raw))
        except (TypeError, ValueError):
            continue
    return role_ids


def _is_role_5_or_6_actor(user: UserContext) -> bool:
    role_ids = _actor_role_ids(user)
    return 5 in role_ids or 6 in role_ids


def _build_assigned_candidate_subquery(interviewer_id: str, interviewer_email: str):
    interview_subq = None
    if interviewer_id:
        interview_subq = (
            select(RecCandidateInterview.candidate_id)
            .where(RecCandidateInterview.interviewer_person_id_platform == interviewer_id)
            .subquery()
        )
    owner_subq = None
    if interviewer_email:
        owner_subq = (
            select(RecCandidate.candidate_id)
            .where(func.lower(RecCandidate.l2_owner_email) == interviewer_email)
            .subquery()
        )
    if interview_subq is not None and owner_subq is not None:
        return (
            select(interview_subq.c.candidate_id)
            .union(select(owner_subq.c.candidate_id))
            .subquery()
        )
    if interview_subq is not None:
        return interview_subq
    if owner_subq is not None:
        return owner_subq
    return None


def _is_hr_actor(user: UserContext) -> bool:
    roles = set(user.roles or [])
    if Role.HR_ADMIN in roles or Role.HR_EXEC in roles:
        return True

    role_tokens = set()
    for value in (user.platform_role_codes or []):
        normalized = _normalize_role_token(value)
        if normalized:
            role_tokens.add(normalized)
    for value in (user.platform_role_names or []):
        normalized = _normalize_role_token(value)
        if normalized:
            role_tokens.add(normalized)
    for value in [user.platform_role_code, user.platform_role_name]:
        normalized = _normalize_role_token(value)
        if normalized:
            role_tokens.add(normalized)

    for token in role_tokens:
        compact = token.replace("_", "")
        if token == "hr" or token.startswith("hr_") or token.startswith("hr"):
            return True
        if "humanresource" in compact:
            return True
    return False


def _is_superadmin_actor(user: UserContext) -> bool:
    role_ids = _actor_role_ids(user)
    if 2 in role_ids:
        return True

    role_tokens = set()
    for value in (user.platform_role_codes or []):
        normalized = _normalize_role_token(value)
        if normalized:
            role_tokens.add(normalized)
    for value in (user.platform_role_names or []):
        normalized = _normalize_role_token(value)
        if normalized:
            role_tokens.add(normalized)
    for value in [user.platform_role_code, user.platform_role_name]:
        normalized = _normalize_role_token(value)
        if normalized:
            role_tokens.add(normalized)

    return bool({"2", "superadmin", "super_admin", "s_admin"} & role_tokens)


def _can_view_dashboard(user: UserContext) -> bool:
    if _is_superadmin_actor(user) or _is_hr_actor(user):
        return True
    roles = set(user.roles or [])
    return bool({Role.HIRING_MANAGER, Role.INTERVIEWER, Role.GROUP_LEAD, Role.VIEWER} & roles)


def _active_candidate_case():
    return case((RecCandidate.status.notin_(CLOSED_CANDIDATE_STATUSES), 1), else_=0)


async def _fetch_platform_people(ids: set[str]) -> dict[str, dict[str, str | None]]:
    person_ids = {str(pid or "").strip() for pid in ids if str(pid or "").strip()}
    if not person_ids:
        return {}
    try:
        async with PlatformSessionLocal() as platform_session:
            rows = (
                await platform_session.execute(
                    select(
                        DimPerson.person_id,
                        DimPerson.display_name,
                        DimPerson.full_name,
                        DimPerson.first_name,
                        DimPerson.last_name,
                        DimPerson.email,
                    ).where(DimPerson.person_id.in_(list(person_ids)), active_status_filter())
                )
            ).all()
    except Exception:
        return {}

    out: dict[str, dict[str, str | None]] = {}
    for row in rows:
        first_name = str(row.first_name or "").strip()
        last_name = str(row.last_name or "").strip()
        fallback_name = f"{first_name} {last_name}".strip()
        full_name = (row.display_name or row.full_name or fallback_name or row.email or row.person_id or "").strip()
        out[str(row.person_id).strip()] = {
            "name": full_name or str(row.person_id).strip(),
            "email": (str(row.email).strip().lower() if row.email else None),
        }
    return out


@router.get("/dashboard", response_model=DashboardMetricsOut)
async def get_dashboard_metrics(
    stuck_days: int = Query(default=5, ge=1, le=60),
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(deps.get_user),
):
    if not _can_view_dashboard(user):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    today = func.curdate()
    now = func.now()

    roles = set(user.roles or [])
    is_hr = _is_hr_actor(user)
    is_superadmin = _is_superadmin_actor(user)
    is_interviewer = Role.INTERVIEWER in roles or Role.GROUP_LEAD in roles or Role.HIRING_MANAGER in roles
    force_assigned_scope = _is_role_5_or_6_actor(user)
    interviewer_id = (user.person_id_platform or "").strip()
    interviewer_email = (user.email or "").strip().lower()
    limited = force_assigned_scope or (is_interviewer and not is_hr and not is_superadmin and (interviewer_id or interviewer_email))
    scope_to_none = limited and not (interviewer_id or interviewer_email)

    assigned_ids = None
    if limited and not scope_to_none:
        assigned_ids = _build_assigned_candidate_subquery(interviewer_id, interviewer_email)

    def _candidate_scope(query):
        if scope_to_none:
            return query.where(false())
        if assigned_ids is None:
            return query
        return query.where(RecCandidate.candidate_id.in_(select(assigned_ids.c.candidate_id)))

    def _candidate_id_scope(query, column):
        if scope_to_none:
            return query.where(false())
        if assigned_ids is None:
            return query
        return query.where(column.in_(select(assigned_ids.c.candidate_id)))

    total_applications_received = (
        await session.execute(_candidate_scope(select(func.count()).select_from(RecCandidate)))
    ).scalar_one()

    total_active_candidates = (
        await session.execute(
            _candidate_scope(
                select(func.count())
                .select_from(RecCandidate)
                .where(RecCandidate.status.notin_(["hired", "rejected", "declined"]))
            )
        )
    ).scalar_one()

    new_candidates_last_7_days = (
        await session.execute(
            _candidate_scope(
                select(func.count())
                .select_from(RecCandidate)
                .where(RecCandidate.created_at >= func.date_sub(now, text("INTERVAL 7 DAY")))
            )
        )
    ).scalar_one()

    new_applications_today = (
        await session.execute(
            _candidate_scope(
                select(func.count())
                .select_from(RecCandidate)
                .where(RecCandidate.created_at >= today)
            )
        )
    ).scalar_one()

    caf_submitted_today = (
        await session.execute(
            _candidate_scope(
                select(func.count())
                .select_from(RecCandidate)
                .where(
                    RecCandidate.basic_details_form_submitted_at.is_not(None),
                    RecCandidate.basic_details_form_submitted_at >= today,
                )
            )
        )
    ).scalar_one()

    openings_query = (
        select(func.count())
        .select_from(RecOpening)
        .where(or_(RecOpening.is_active == 1, RecOpening.is_active == True, RecOpening.is_active.is_(True)))
    )
    is_restricted_opening_view = (Role.INTERVIEWER in roles or Role.GROUP_LEAD in roles) and not force_assigned_scope
    if is_restricted_opening_view and not is_hr and not is_superadmin:
        if interviewer_id:
            openings_query = openings_query.where(RecOpening.reporting_person_id_platform == interviewer_id)
        else:
            openings_query = openings_query.where(false())
    openings_count = (await session.execute(openings_query)).scalar_one()

    needs_review_amber = (
        await session.execute(
            _candidate_scope(
                select(func.count())
                .select_from(RecCandidate)
                .outerjoin(RecCandidateScreening, RecCandidateScreening.candidate_id == RecCandidate.candidate_id)
                .where(RecCandidateScreening.screening_result == "amber")
            )
        )
    ).scalar_one()

    # Current pending stage counts.
    latest_stage = (
        select(RecCandidateStage.candidate_id, func.max(RecCandidateStage.stage_id).label("stage_id"))
        .where(RecCandidateStage.stage_status == "pending")
        .group_by(RecCandidateStage.candidate_id)
        .subquery()
    )
    pending_stage_query = (
        select(RecCandidateStage.stage_name, func.count().label("count"))
        .select_from(RecCandidateStage)
        .join(latest_stage, latest_stage.c.stage_id == RecCandidateStage.stage_id)
    )
    if assigned_ids is not None:
        pending_stage_query = pending_stage_query.where(RecCandidateStage.candidate_id.in_(select(assigned_ids.c.candidate_id)))
    pending_stage_rows = (
        await session.execute(
            pending_stage_query.group_by(RecCandidateStage.stage_name).order_by(func.count().desc())
        )
    ).all()

    candidates_per_stage = [StageCount(stage=row.stage_name, count=int(row.count or 0)) for row in pending_stage_rows]

    stuck_in_stage_over_days = (
        await session.execute(
            _candidate_id_scope(
                select(func.count())
                .select_from(RecCandidateStage)
                .where(
                    RecCandidateStage.stage_status == "pending",
                    func.datediff(today, RecCandidateStage.started_at) > stuck_days,
                ),
                RecCandidateStage.candidate_id,
            )
        )
    ).scalar_one()

    caf_pending_overdue = (
        await session.execute(
            _candidate_scope(
                select(func.count())
                .select_from(RecCandidate)
                .join(RecCandidateStage, RecCandidateStage.candidate_id == RecCandidate.candidate_id)
                .outerjoin(RecOpening, RecOpening.opening_id == RecCandidate.opening_id)
                .where(
                    RecCandidateStage.stage_status == "pending",
                    RecCandidateStage.stage_name.in_(["hr_screening", "caf"]),
                    RecCandidate.basic_details_form_submitted_at.is_(None),
                    RecCandidate.basic_details_form_sent_at.is_not(None),
                    RecCandidate.basic_details_form_sent_at
                    <= func.date_sub(now, text(f"INTERVAL {settings.caf_reminder_days} DAY")),
                    or_(RecOpening.opening_code.is_(None), ~RecOpening.opening_code.in_(tuple(INTERN_OPENING_CODES))),
                )
            )
        )
    ).scalar_one()

    feedback_query = (
        select(func.count())
        .select_from(RecCandidateInterview)
        .where(
            RecCandidateInterview.feedback_submitted.is_(False),
            RecCandidateInterview.scheduled_end_at
            <= func.date_sub(now, text(f"INTERVAL {settings.feedback_reminder_hours} HOUR")),
        )
    )
    if assigned_ids is not None:
        feedback_query = feedback_query.where(
            RecCandidateInterview.candidate_id.in_(select(assigned_ids.c.candidate_id))
        )
    feedback_pending = (await session.execute(feedback_query)).scalar_one()

    sprints_overdue = (
        await session.execute(
            _candidate_id_scope(
                select(func.count())
                .select_from(RecCandidateSprint)
                .where(
                    RecCandidateSprint.status == "assigned",
                    RecCandidateSprint.due_at.is_not(None),
                    RecCandidateSprint.due_at
                    <= func.date_sub(now, text(f"INTERVAL {settings.sprint_overdue_days} DAY")),
                ),
                RecCandidateSprint.candidate_id,
            )
        )
    ).scalar_one()

    offers_awaiting_response = (
        await session.execute(
            _candidate_id_scope(
                select(func.count())
                .select_from(RecCandidateOffer)
                .where(RecCandidateOffer.offer_status == "sent"),
                RecCandidateOffer.candidate_id,
            )
        )
    ).scalar_one()

    scoped_candidate_ids = _candidate_scope(
        select(RecCandidate.candidate_id.label("candidate_id")).select_from(RecCandidate)
    ).subquery()
    active_candidate_case = _active_candidate_case()
    trimmed_hr_owner_email = func.trim(func.coalesce(RecCandidate.hr_owner_email, ""))
    normalized_hr_owner_email = func.lower(
        func.coalesce(func.nullif(trimmed_hr_owner_email, ""), DEFAULT_HR_OWNER_EMAIL)
    )
    normalized_hr_owner_name = func.coalesce(
        func.nullif(func.trim(RecCandidate.hr_owner_name), ""),
        DEFAULT_HR_OWNER_NAME,
    )
    trimmed_l2_owner_email = func.trim(func.coalesce(RecCandidate.l2_owner_email, ""))
    normalized_l2_owner_email = func.lower(trimmed_l2_owner_email)
    normalized_l2_owner_name = func.coalesce(
        func.nullif(func.trim(RecCandidate.l2_owner_name), ""),
        normalized_l2_owner_email,
    )

    hr_assigned_count = (
        await session.execute(
            select(func.count())
            .select_from(RecCandidate)
            .where(
                RecCandidate.candidate_id.in_(select(scoped_candidate_ids.c.candidate_id)),
                normalized_hr_owner_email != "",
            )
        )
    ).scalar_one()

    hr_workload_rows = (
        await session.execute(
            select(
                normalized_hr_owner_email.label("assignee_key"),
                func.min(normalized_hr_owner_name).label("assignee_name"),
                normalized_hr_owner_email.label("assignee_email"),
                func.count().label("assigned_count"),
                func.sum(active_candidate_case).label("active_count"),
            )
            .select_from(RecCandidate)
            .where(
                RecCandidate.candidate_id.in_(select(scoped_candidate_ids.c.candidate_id)),
                normalized_hr_owner_email != "",
            )
            .group_by(normalized_hr_owner_email)
            .order_by(func.count().desc(), func.min(normalized_hr_owner_name).asc())
        )
    ).all()
    hr_workloads = [
        AssignmentWorkloadOut(
            assignee_key=row.assignee_key or row.assignee_email or DEFAULT_HR_OWNER_EMAIL,
            assignee_name=row.assignee_name or DEFAULT_HR_OWNER_NAME,
            assignee_email=row.assignee_email or DEFAULT_HR_OWNER_EMAIL,
            assigned_count=int(row.assigned_count or 0),
            active_count=int(row.active_count or 0),
        )
        for row in hr_workload_rows
    ]

    l2_assigned_count = (
        await session.execute(
            select(func.count())
            .select_from(RecCandidate)
            .where(
                RecCandidate.candidate_id.in_(select(scoped_candidate_ids.c.candidate_id)),
                trimmed_l2_owner_email != "",
            )
        )
    ).scalar_one()

    l2_workload_rows = (
        await session.execute(
            select(
                normalized_l2_owner_email.label("assignee_key"),
                func.min(normalized_l2_owner_name).label("assignee_name"),
                normalized_l2_owner_email.label("assignee_email"),
                func.count().label("assigned_count"),
                func.sum(active_candidate_case).label("active_count"),
            )
            .select_from(RecCandidate)
            .where(
                RecCandidate.candidate_id.in_(select(scoped_candidate_ids.c.candidate_id)),
                trimmed_l2_owner_email != "",
            )
            .group_by(normalized_l2_owner_email)
            .order_by(func.count().desc(), func.min(normalized_l2_owner_name).asc())
        )
    ).all()
    l2_workloads = [
        AssignmentWorkloadOut(
            assignee_key=row.assignee_key or row.assignee_email or "unassigned",
            assignee_name=row.assignee_name or row.assignee_email or "Unassigned",
            assignee_email=row.assignee_email,
            assigned_count=int(row.assigned_count or 0),
            active_count=int(row.active_count or 0),
        )
        for row in l2_workload_rows
    ]

    interviewer_pid_trimmed = func.trim(func.coalesce(RecCandidateInterview.interviewer_person_id_platform, ""))
    interviewer_assignments = (
        select(
            RecCandidateInterview.candidate_id.label("candidate_id"),
            interviewer_pid_trimmed.label("assignee_key"),
        )
        .where(
            RecCandidateInterview.candidate_id.in_(select(scoped_candidate_ids.c.candidate_id)),
            interviewer_pid_trimmed != "",
        )
        .distinct()
        .subquery()
    )

    interviewer_assigned_count = (
        await session.execute(
            select(func.count())
            .select_from(
                select(interviewer_assignments.c.candidate_id)
                .distinct()
                .subquery()
            )
        )
    ).scalar_one()

    interviewer_workload_rows = (
        await session.execute(
            select(
                interviewer_assignments.c.assignee_key,
                func.count().label("assigned_count"),
                func.sum(active_candidate_case).label("active_count"),
            )
            .select_from(interviewer_assignments)
            .join(RecCandidate, RecCandidate.candidate_id == interviewer_assignments.c.candidate_id)
            .group_by(
                interviewer_assignments.c.assignee_key,
            )
            .order_by(func.count().desc(), interviewer_assignments.c.assignee_key.asc())
        )
    ).all()
    interviewer_meta = await _fetch_platform_people(
        {str(row.assignee_key or "").strip() for row in interviewer_workload_rows}
    )
    interviewer_workloads = [
        AssignmentWorkloadOut(
            assignee_key=str(row.assignee_key or "").strip() or "interviewer",
            assignee_name=(
                interviewer_meta.get(str(row.assignee_key or "").strip(), {}).get("name")
                or f"Interviewer {str(row.assignee_key or '').strip()}"
            ),
            assignee_email=interviewer_meta.get(str(row.assignee_key or "").strip(), {}).get("email"),
            assigned_count=int(row.assigned_count or 0),
            active_count=int(row.active_count or 0),
        )
        for row in interviewer_workload_rows
    ]

    fully_unassigned_count = (
        await session.execute(
            select(func.count())
            .select_from(RecCandidate)
            .where(
                RecCandidate.candidate_id.in_(select(scoped_candidate_ids.c.candidate_id)),
                trimmed_l2_owner_email == "",
                ~RecCandidate.candidate_id.in_(select(interviewer_assignments.c.candidate_id)),
            )
        )
    ).scalar_one()

    assignment_summary = AssignmentSummaryOut(
        default_hr_owner=AssignmentWorkloadOut(
            assignee_key=DEFAULT_HR_OWNER_EMAIL,
            assignee_name=DEFAULT_HR_OWNER_NAME,
            assignee_email=DEFAULT_HR_OWNER_EMAIL,
            assigned_count=int(total_applications_received or 0),
            active_count=int(total_active_candidates or 0),
        ),
        hr_assigned_count=int(hr_assigned_count or 0),
        hr_unassigned_count=max(0, int(total_applications_received or 0) - int(hr_assigned_count or 0)),
        l2_assigned_count=int(l2_assigned_count or 0),
        l2_unassigned_count=max(0, int(total_applications_received or 0) - int(l2_assigned_count or 0)),
        interviewer_assigned_count=int(interviewer_assigned_count or 0),
        interviewer_unassigned_count=max(0, int(total_applications_received or 0) - int(interviewer_assigned_count or 0)),
        fully_unassigned_count=int(fully_unassigned_count or 0),
        hr_workloads=hr_workloads,
        l2_workloads=l2_workloads,
        interviewer_workloads=interviewer_workloads,
    )

    return DashboardMetricsOut(
        total_applications_received=int(total_applications_received or 0),
        total_active_candidates=int(total_active_candidates or 0),
        new_candidates_last_7_days=int(new_candidates_last_7_days or 0),
        new_applications_today=int(new_applications_today or 0),
        caf_submitted_today=int(caf_submitted_today or 0),
        openings_count=int(openings_count or 0),
        needs_review_amber=int(needs_review_amber or 0),
        stuck_in_stage_over_days=int(stuck_in_stage_over_days or 0),
        caf_pending_overdue=int(caf_pending_overdue or 0),
        feedback_pending=int(feedback_pending or 0),
        sprints_overdue=int(sprints_overdue or 0),
        offers_awaiting_response=int(offers_awaiting_response or 0),
        candidates_per_stage=candidates_per_stage,
        assignment_summary=assignment_summary,
    )


@router.get("/events", response_model=list[CandidateEventOut])
async def list_recent_events(
    limit: int = Query(default=15, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(deps.get_user),
):
    if not _can_view_dashboard(user):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    is_superadmin = _is_superadmin_actor(user) or Role.HR_ADMIN in user.roles
    roles = set(user.roles or [])
    is_hr = _is_hr_actor(user)
    is_interviewer = Role.INTERVIEWER in roles or Role.GROUP_LEAD in roles or Role.HIRING_MANAGER in roles
    force_assigned_scope = _is_role_5_or_6_actor(user)
    interviewer_id = (user.person_id_platform or "").strip()
    interviewer_email = (user.email or "").strip().lower()
    limited = force_assigned_scope or (is_interviewer and not is_hr and not is_superadmin and (interviewer_id or interviewer_email))
    scope_to_none = limited and not (interviewer_id or interviewer_email)
    performer_id: int | None = None
    performer_email = (user.email or "").strip().lower()
    if not is_superadmin:
        raw = (user.person_id_platform or "").strip()
        if raw:
            try:
                performer_id = int(raw)
            except Exception:
                performer_id = None
        if performer_id is None and not performer_email:
            return []

    query = (
        select(
            RecCandidateEvent,
            RecCandidate.full_name.label("candidate_name"),
            RecCandidate.candidate_code.label("candidate_code"),
        )
        .select_from(RecCandidateEvent)
        .outerjoin(RecCandidate, RecCandidate.candidate_id == RecCandidateEvent.candidate_id)
        .order_by(RecCandidateEvent.created_at.desc(), RecCandidateEvent.candidate_event_id.desc())
        .limit(limit)
        .offset(offset)
    )
    if performer_id is not None:
        query = query.where(
            or_(
                RecCandidateEvent.performed_by_person_id_platform.is_(None),
                RecCandidateEvent.performed_by_person_id_platform == performer_id,
            )
        )
    elif performer_email:
        query = query.where(
            or_(
                RecCandidateEvent.performed_by_person_id_platform.is_(None),
                func.lower(RecCandidateEvent.meta_json).like(f'%\"performed_by_email\":\"{performer_email}\"%'),
            )
        )

    if limited:
        if scope_to_none:
            return []
        assigned_ids = _build_assigned_candidate_subquery(interviewer_id, interviewer_email)
        if assigned_ids is not None:
            query = query.where(RecCandidateEvent.candidate_id.in_(select(assigned_ids.c.candidate_id)))

    rows = (await session.execute(query)).all()

    out: list[CandidateEventOut] = []
    for row in rows:
        event = row[0]
        candidate_name = row[1]
        candidate_code = row[2]
        meta: dict = {}
        if event.meta_json:
            try:
                meta = json.loads(event.meta_json) if isinstance(event.meta_json, str) else {}
            except Exception:
                meta = {}
        performed_by_name = meta.get("performed_by_name") if isinstance(meta, dict) else None
        performed_by_email = meta.get("performed_by_email") if isinstance(meta, dict) else None
        out.append(
            CandidateEventOut(
                event_id=event.candidate_event_id,
                candidate_id=event.candidate_id,
                candidate_name=candidate_name,
                candidate_code=candidate_code,
                action_type=event.action_type,
                performed_by_person_id_platform=event.performed_by_person_id_platform,
                performed_by_name=performed_by_name,
                performed_by_email=performed_by_email,
                meta_json=meta,
                created_at=event.created_at,
            )
        )
    return out


@router.get("/events/stream")
async def stream_events(
    request: Request,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.HIRING_MANAGER, Role.INTERVIEWER, Role.GROUP_LEAD, Role.VIEWER])),
):
    role_5_or_6_scope = _is_role_5_or_6_actor(user)
    allowed_candidate_ids: set[int] | None = None
    if role_5_or_6_scope:
        interviewer_id = (user.person_id_platform or "").strip()
        interviewer_email = (user.email or "").strip().lower()
        if not (interviewer_id or interviewer_email):
            allowed_candidate_ids = set()
        else:
            assigned_ids = _build_assigned_candidate_subquery(interviewer_id, interviewer_email)
            if assigned_ids is None:
                allowed_candidate_ids = set()
            else:
                rows = (await session.execute(select(assigned_ids.c.candidate_id))).all()
                allowed_candidate_ids = {int(row[0]) for row in rows if row and row[0] is not None}

    queue = await event_bus.subscribe()

    async def event_generator():
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    data = await asyncio.wait_for(queue.get(), timeout=15)
                    if allowed_candidate_ids is not None:
                        try:
                            payload = json.loads(data)
                        except Exception:
                            continue
                        candidate_id = payload.get("candidate_id")
                        try:
                            candidate_id_int = int(candidate_id)
                        except (TypeError, ValueError):
                            continue
                        if candidate_id_int not in allowed_candidate_ids:
                            continue
                    yield f"data: {data}\n\n"
                except asyncio.TimeoutError:
                    yield "event: ping\ndata: {}\n\n"
        finally:
            await event_bus.unsubscribe(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )
