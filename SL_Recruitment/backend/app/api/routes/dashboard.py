from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import StreamingResponse
import asyncio

from app.api import deps
from app.core.auth import require_roles
from app.core.config import settings
from app.core.roles import Role
from app.models.candidate import RecCandidate
from app.models.candidate_offer import RecCandidateOffer
from app.models.candidate_sprint import RecCandidateSprint
from app.models.event import RecCandidateEvent
from app.models.interview import RecCandidateInterview
from app.models.opening import RecOpening
from app.models.screening import RecCandidateScreening
from app.models.stage import RecCandidateStage
from app.schemas.dashboard import DashboardMetricsOut, StageCount
from app.schemas.event import CandidateEventOut
from app.schemas.user import UserContext
from app.services.event_bus import event_bus

router = APIRouter(prefix="/rec", tags=["dashboard"])


@router.get("/dashboard", response_model=DashboardMetricsOut)
async def get_dashboard_metrics(
    stuck_days: int = Query(default=5, ge=1, le=60),
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.HIRING_MANAGER, Role.INTERVIEWER, Role.VIEWER])),
):
    today = func.curdate()
    now = func.now()

    roles = set(user.roles or [])
    is_hr = Role.HR_ADMIN in roles or Role.HR_EXEC in roles
    is_superadmin = (user.platform_role_id or None) == 2
    is_interviewer = Role.INTERVIEWER in roles or Role.GROUP_LEAD in roles or Role.HIRING_MANAGER in roles
    is_role6 = (user.platform_role_id or None) == 6 or (user.platform_role_code or "").strip() == "6"
    interviewer_id = (user.person_id_platform or "").strip()
    interviewer_email = (user.email or "").strip().lower()
    limited = (is_interviewer or is_role6) and not is_hr and not is_superadmin and (interviewer_id or interviewer_email)

    assigned_ids = None
    if limited:
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
            assigned_ids = (
                select(interview_subq.c.candidate_id)
                .union(select(owner_subq.c.candidate_id))
                .subquery()
            )
        elif interview_subq is not None:
            assigned_ids = interview_subq
        elif owner_subq is not None:
            assigned_ids = owner_subq

    def _candidate_scope(query):
        if assigned_ids is None:
            return query
        return query.where(RecCandidate.candidate_id.in_(select(assigned_ids.c.candidate_id)))

    def _candidate_id_scope(query, column):
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
                .where(RecCandidate.caf_submitted_at.is_not(None), RecCandidate.caf_submitted_at >= today)
            )
        )
    ).scalar_one()

    openings_query = (
        select(func.count())
        .select_from(RecOpening)
        .where(or_(RecOpening.is_active == 1, RecOpening.is_active == True, RecOpening.is_active.is_(True)))
    )
    limit_openings = limited and interviewer_id and not is_role6
    if limit_openings:
        openings_query = openings_query.where(RecOpening.reporting_person_id_platform == interviewer_id)
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
                .where(
                    RecCandidateStage.stage_status == "pending",
                    RecCandidateStage.stage_name.in_(["hr_screening", "caf"]),
                    RecCandidate.caf_submitted_at.is_(None),
                    RecCandidate.caf_sent_at.is_not(None),
                    RecCandidate.caf_sent_at
                    <= func.date_sub(now, text(f"INTERVAL {settings.caf_reminder_days} DAY")),
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
    )


@router.get("/events", response_model=list[CandidateEventOut])
async def list_recent_events(
    limit: int = Query(default=15, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.HIRING_MANAGER, Role.INTERVIEWER, Role.VIEWER])),
):
    is_superadmin = (user.platform_role_id or None) == 2 or Role.HR_ADMIN in user.roles
    roles = set(user.roles or [])
    is_hr = Role.HR_ADMIN in roles or Role.HR_EXEC in roles
    is_interviewer = Role.INTERVIEWER in roles or Role.GROUP_LEAD in roles or Role.HIRING_MANAGER in roles
    is_role6 = (user.platform_role_id or None) == 6 or (user.platform_role_code or "").strip() == "6"
    interviewer_id = (user.person_id_platform or "").strip()
    interviewer_email = (user.email or "").strip().lower()
    limited = (is_interviewer or is_role6) and not is_hr and not is_superadmin and (interviewer_id or interviewer_email)
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
            assigned_ids = (
                select(interview_subq.c.candidate_id)
                .union(select(owner_subq.c.candidate_id))
                .subquery()
            )
        elif interview_subq is not None:
            assigned_ids = interview_subq
        elif owner_subq is not None:
            assigned_ids = owner_subq
        else:
            assigned_ids = None
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
                import json

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
    _session: AsyncSession = Depends(deps.get_db_session),
    _user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.HIRING_MANAGER, Role.INTERVIEWER, Role.VIEWER])),
):
    queue = await event_bus.subscribe()

    async def event_generator():
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    data = await asyncio.wait_for(queue.get(), timeout=15)
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
