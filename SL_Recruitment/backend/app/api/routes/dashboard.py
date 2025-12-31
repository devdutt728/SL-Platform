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
    _user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.HIRING_MANAGER, Role.INTERVIEWER, Role.VIEWER])),
):
    today = func.curdate()
    now = func.now()

    total_applications_received = (
        await session.execute(select(func.count()).select_from(RecCandidate))
    ).scalar_one()

    total_active_candidates = (
        await session.execute(
            select(func.count())
            .select_from(RecCandidate)
            .where(RecCandidate.status.notin_(["hired", "rejected"]))
        )
    ).scalar_one()

    new_candidates_last_7_days = (
        await session.execute(
            select(func.count())
            .select_from(RecCandidate)
            .where(RecCandidate.created_at >= func.date_sub(now, text("INTERVAL 7 DAY")))
        )
    ).scalar_one()

    new_applications_today = (
        await session.execute(
            select(func.count())
            .select_from(RecCandidate)
            .where(RecCandidate.created_at >= today)
        )
    ).scalar_one()

    caf_submitted_today = (
        await session.execute(
            select(func.count())
            .select_from(RecCandidate)
            .where(RecCandidate.caf_submitted_at.is_not(None), RecCandidate.caf_submitted_at >= today)
        )
    ).scalar_one()

    openings_count = (
        await session.execute(
            select(func.count())
            .select_from(RecOpening)
            .where(RecOpening.is_active == 1)
        )
    ).scalar_one()

    needs_review_amber = (
        await session.execute(
            select(func.count())
            .select_from(RecCandidate)
            .outerjoin(RecCandidateScreening, RecCandidateScreening.candidate_id == RecCandidate.candidate_id)
            .where(RecCandidateScreening.screening_result == "amber")
        )
    ).scalar_one()

    # Current pending stage counts.
    pending_stage = (
        select(RecCandidateStage.candidate_id, func.max(RecCandidateStage.started_at).label("started_at"))
        .where(RecCandidateStage.stage_status == "pending")
        .group_by(RecCandidateStage.candidate_id)
        .subquery()
    )
    pending_stage_rows = (
        await session.execute(
            select(RecCandidateStage.stage_name, func.count().label("count"))
            .select_from(RecCandidateStage)
            .join(
                pending_stage,
                (pending_stage.c.candidate_id == RecCandidateStage.candidate_id)
                & (pending_stage.c.started_at == RecCandidateStage.started_at),
            )
            .group_by(RecCandidateStage.stage_name)
            .order_by(func.count().desc())
        )
    ).all()

    candidates_per_stage = [StageCount(stage=row.stage_name, count=int(row.count or 0)) for row in pending_stage_rows]

    stuck_in_stage_over_days = (
        await session.execute(
            select(func.count())
            .select_from(RecCandidateStage)
            .where(
                RecCandidateStage.stage_status == "pending",
                func.datediff(today, RecCandidateStage.started_at) > stuck_days,
            )
        )
    ).scalar_one()

    caf_pending_overdue = (
        await session.execute(
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
    ).scalar_one()

    feedback_pending = (
        await session.execute(
            select(func.count())
            .select_from(RecCandidateInterview)
            .where(
                RecCandidateInterview.feedback_submitted.is_(False),
                RecCandidateInterview.scheduled_end_at
                <= func.date_sub(now, text(f"INTERVAL {settings.feedback_reminder_hours} HOUR")),
            )
        )
    ).scalar_one()

    sprints_overdue = (
        await session.execute(
            select(func.count())
            .select_from(RecCandidateSprint)
            .where(
                RecCandidateSprint.status == "assigned",
                RecCandidateSprint.due_at.is_not(None),
                RecCandidateSprint.due_at
                <= func.date_sub(now, text(f"INTERVAL {settings.sprint_overdue_days} DAY")),
            )
        )
    ).scalar_one()

    offers_awaiting_response = (
        await session.execute(
            select(func.count())
            .select_from(RecCandidateOffer)
            .where(RecCandidateOffer.offer_status == "sent")
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
