from __future__ import annotations

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import HTMLResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.api.routes.candidates import transition_stage
from app.core.auth import require_roles, require_superadmin
from app.core.config import settings
from app.core.roles import Role
from app.db.platform_session import PlatformSessionLocal
from app.models.candidate import RecCandidate
from app.models.interview import RecCandidateInterview
from app.models.interview_slot import RecCandidateInterviewSlot
from app.models.opening import RecOpening
from app.models.platform_person import DimPerson
from app.models.platform_role import DimRole
from app.schemas.interview import InterviewCreate, InterviewOut, InterviewReschedule, InterviewUpdate
from app.schemas.interview_slots import InterviewSlotOut, InterviewSlotProposalIn
from app.schemas.stage import StageTransitionRequest
from app.schemas.user import UserContext
from app.services.calendar import create_calendar_event, delete_calendar_event, query_freebusy, update_calendar_event
from app.services.email import send_email
from app.services.events import log_event
from app.services.interview_slots import build_selection_token, filter_free_slots, generate_candidate_slots

router = APIRouter(prefix="/rec", tags=["interviews"])
public_router = APIRouter(prefix="/interview", tags=["interviews-public"])

IST = ZoneInfo("Asia/Kolkata")


def _clean_platform_person_id(raw: str | None) -> str | None:
    if raw is None:
        return None
    val = raw.strip()
    return val or None


def _platform_person_id_int(user: UserContext) -> int | None:
    raw = (user.person_id_platform or "").strip()
    if not raw:
        return None
    try:
        return int(raw)
    except Exception:
        return None


def _normalize_person_id_int(raw: int | str | None) -> int | None:
    if raw is None:
        return None
    try:
        return int(str(raw).strip())
    except Exception:
        return None


def _normalize_round(raw: str | None) -> str:
    return (raw or "").strip().lower()


def _round_to_transition(round_type: str, decision: str) -> str | None:
    round_norm = _normalize_round(round_type)
    if decision not in {"advance", "reject"}:
        return None
    if "l2" in round_norm:
        return "l2_feedback"
    if "l1" in round_norm:
        return "l1_feedback"
    return None


def _normalize_to_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=IST).astimezone(timezone.utc).replace(tzinfo=None)
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


def _format_slot_label(dt_utc: datetime, tz: ZoneInfo) -> str:
    local = dt_utc.replace(tzinfo=timezone.utc).astimezone(tz)
    return local.strftime("%d %b %Y, %I:%M %p %Z")


def _public_slot_link(base_url: str, token: str) -> str:
    return f"{base_url.rstrip('/')}/interview/slots/{token}"


def _valid_round_type(round_type: str) -> bool:
    norm = _normalize_round(round_type)
    return "l1" in norm or "l2" in norm


def _parse_rfc3339(value: str) -> datetime:
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    return datetime.fromisoformat(value)


async def _render_slot_conflict(
    session: AsyncSession,
    request: Request,
    slot: RecCandidateInterviewSlot,
    tz: ZoneInfo,
) -> HTMLResponse:
    now = datetime.utcnow()
    remaining = (
        (
            await session.execute(
                select(RecCandidateInterviewSlot)
                .where(
                    RecCandidateInterviewSlot.batch_id == slot.batch_id,
                    RecCandidateInterviewSlot.status == "proposed",
                    (
                        RecCandidateInterviewSlot.expires_at.is_(None)
                        | (RecCandidateInterviewSlot.expires_at > now)
                    ),
                )
                .order_by(RecCandidateInterviewSlot.slot_start_at.asc())
            )
        )
        .scalars()
        .all()
    )
    if not remaining:
        return HTMLResponse("<h2>Slot unavailable</h2><p>Please contact HR for a new invitation.</p>", status_code=409)

    interviewer_email = slot.interviewer_email or ""
    if not interviewer_email:
        return HTMLResponse("<h2>Slot unavailable</h2><p>Please contact HR for a new invitation.</p>", status_code=409)

    window_start = remaining[0].slot_start_at.replace(tzinfo=timezone.utc)
    window_end = remaining[-1].slot_end_at.replace(tzinfo=timezone.utc)
    busy = query_freebusy(
        calendar_ids=[interviewer_email],
        start_at=window_start,
        end_at=window_end,
        subject_email=interviewer_email,
    ).get(interviewer_email, [])

    def _overlaps_busy(slot_item: RecCandidateInterviewSlot) -> bool:
        slot_start = slot_item.slot_start_at.replace(tzinfo=timezone.utc)
        slot_end = slot_item.slot_end_at.replace(tzinfo=timezone.utc)
        for item in busy:
            start_raw = item.get("start")
            end_raw = item.get("end")
            if not start_raw or not end_raw:
                continue
            busy_start = _parse_rfc3339(start_raw).astimezone(timezone.utc)
            busy_end = _parse_rfc3339(end_raw).astimezone(timezone.utc)
            if slot_start < busy_end and slot_end > busy_start:
                return True
        return False

    available = [r for r in remaining if not _overlaps_busy(r)]
    if not available:
        return HTMLResponse("<h2>No slots left</h2><p>Please contact HR for a new invitation.</p>", status_code=409)

    base_url = str(request.base_url).rstrip("/")
    slots_html = "\n".join(
        f'<li><a href="{_public_slot_link(base_url, r.selection_token)}">{_format_slot_label(r.slot_start_at, tz)}</a></li>'
        for r in available
    )
    return HTMLResponse(
        f"<h2>Slot just got booked</h2><p>Please select another slot:</p><ul>{slots_html}</ul>",
        status_code=409,
    )


async def _fetch_platform_people(ids: set[str]) -> dict[str, dict]:
    ids = {pid for pid in ids if pid}
    if not ids:
        return {}
    try:
        async with PlatformSessionLocal() as platform_session:
            person_rows = (
                await platform_session.execute(
                    select(
                        DimPerson.person_id,
                        DimPerson.display_name,
                        DimPerson.full_name,
                        DimPerson.first_name,
                        DimPerson.last_name,
                        DimPerson.email,
                        DimPerson.role_id,
                    ).where(DimPerson.person_id.in_(list(ids)))
                )
            ).all()
            role_ids = {pr.role_id for pr in person_rows if pr.role_id}
            roles: dict[int, str | None] = {}
            if role_ids:
                role_rows = (
                    await platform_session.execute(
                        select(DimRole.role_id, DimRole.role_name).where(DimRole.role_id.in_(list(role_ids)))
                    )
                ).all()
                roles = {rr.role_id: rr.role_name for rr in role_rows}

            out: dict[str, dict] = {}
            for pr in person_rows:
                full_name = (pr.display_name or pr.full_name or f"{(pr.first_name or '').strip()} {(pr.last_name or '').strip()}").strip()
                out[_clean_platform_person_id(pr.person_id) or pr.person_id] = {
                    "name": full_name or pr.email or pr.person_id,
                    "email": pr.email,
                    "role_name": roles.get(pr.role_id),
                }
            return out
    except Exception:
        return {}


def _build_interview_out(
    interview: RecCandidateInterview,
    *,
    candidate: RecCandidate | None = None,
    opening: RecOpening | None = None,
    interviewer_meta: dict | None = None,
) -> InterviewOut:
    return InterviewOut(
        candidate_interview_id=interview.candidate_interview_id,
        candidate_id=interview.candidate_id,
        round_type=interview.round_type,
        interviewer_person_id_platform=interview.interviewer_person_id_platform,
        interviewer_name=(interviewer_meta or {}).get("name"),
        interviewer_email=(interviewer_meta or {}).get("email"),
        scheduled_start_at=interview.scheduled_start_at,
        scheduled_end_at=interview.scheduled_end_at,
        location=interview.location,
        meeting_link=interview.meeting_link,
        calendar_event_id=interview.calendar_event_id,
        feedback_submitted=bool(interview.feedback_submitted),
        rating_overall=interview.rating_overall,
        rating_technical=interview.rating_technical,
        rating_culture_fit=interview.rating_culture_fit,
        rating_communication=interview.rating_communication,
        decision=interview.decision,
        notes_internal=interview.notes_internal,
        notes_for_candidate=interview.notes_for_candidate,
        created_by_person_id_platform=interview.created_by_person_id_platform,
        created_at=interview.created_at,
        updated_at=interview.updated_at,
        candidate_name=candidate.full_name if candidate else None,
        candidate_code=candidate.candidate_code if candidate else None,
        opening_id=candidate.opening_id if candidate else None,
        opening_title=opening.title if opening else None,
    )


def _assert_interviewer_access(user: UserContext, interview: RecCandidateInterview) -> None:
    if Role.HR_ADMIN in user.roles or Role.HR_EXEC in user.roles or Role.HIRING_MANAGER in user.roles:
        return
    if Role.INTERVIEWER in user.roles:
        if user.person_id_platform and interview.interviewer_person_id_platform:
            if _clean_platform_person_id(user.person_id_platform) == _clean_platform_person_id(interview.interviewer_person_id_platform):
                return
        if settings.environment != "production" and not user.person_id_platform:
            return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")


@router.post("/candidates/{candidate_id}/interviews", response_model=InterviewOut, status_code=status.HTTP_201_CREATED)
async def create_interview(
    candidate_id: int,
    payload: InterviewCreate,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC])),
):
    start_at = _normalize_to_utc(payload.scheduled_start_at)
    end_at = _normalize_to_utc(payload.scheduled_end_at)
    if end_at <= start_at:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="scheduled_end_at must be after scheduled_start_at")

    candidate = await session.get(RecCandidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    interview = RecCandidateInterview(
        candidate_id=candidate_id,
        round_type=payload.round_type,
        interviewer_person_id_platform=_clean_platform_person_id(payload.interviewer_person_id_platform),
        scheduled_start_at=start_at,
        scheduled_end_at=end_at,
        location=payload.location,
        meeting_link=payload.meeting_link,
        feedback_submitted=False,
        created_by_person_id_platform=_clean_platform_person_id(user.person_id_platform),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    session.add(interview)
    await session.flush()

    opening = None
    if candidate.opening_id is not None:
        opening = (await session.execute(select(RecOpening).where(RecOpening.opening_id == candidate.opening_id))).scalars().first()

    interviewer_meta = (await _fetch_platform_people({payload.interviewer_person_id_platform})).get(
        payload.interviewer_person_id_platform, {}
    )
    interviewer_email = (interviewer_meta or {}).get("email")

    try:
        cal_resp = create_calendar_event(
            summary=f"Interview - {candidate.full_name} - {(opening.title if opening else '')}".strip(),
            description="Candidate interview",
            start_at=start_at,
            end_at=end_at,
            attendees=[email for email in [interviewer_email, candidate.email] if email],
            calendar_id=interviewer_email or settings.calendar_id or "primary",
            subject_email=interviewer_email,
        )
        if cal_resp.get("event_id"):
            interview.calendar_event_id = cal_resp.get("event_id")
            if cal_resp.get("meeting_link") and not interview.meeting_link:
                interview.meeting_link = cal_resp.get("meeting_link")
            await log_event(
                session,
                candidate_id=candidate_id,
                action_type="calendar_event_created",
                performed_by_person_id_platform=_platform_person_id_int(user),
                related_entity_type="interview",
                related_entity_id=interview.candidate_interview_id,
                meta_json={"calendar_event_id": cal_resp.get("event_id"), "meeting_link": cal_resp.get("meeting_link")},
            )
    except Exception as exc:  # noqa: BLE001
        await log_event(
            session,
            candidate_id=candidate_id,
            action_type="calendar_event_failed",
            performed_by_person_id_platform=_platform_person_id_int(user),
            related_entity_type="interview",
            related_entity_id=interview.candidate_interview_id,
            meta_json={"error": str(exc)},
        )

    await log_event(
        session,
        candidate_id=candidate_id,
        action_type="interview_scheduled",
        performed_by_person_id_platform=_platform_person_id_int(user),
        related_entity_type="interview",
        related_entity_id=interview.candidate_interview_id,
        meta_json={
            "round_type": payload.round_type,
            "interviewer_person_id_platform": payload.interviewer_person_id_platform,
            "scheduled_start_at": start_at.isoformat(),
            "scheduled_end_at": end_at.isoformat(),
            "location": payload.location,
            "meeting_link": payload.meeting_link,
        },
    )

    start_local = start_at.replace(tzinfo=timezone.utc).astimezone(IST)
    start_str = start_local.strftime("%d %b %Y, %I:%M %p %Z")
    meeting_link = interview.meeting_link or payload.meeting_link or ""

    await send_email(
        session,
        candidate_id=candidate_id,
        to_emails=[candidate.email],
        subject="Interview scheduled",
        template_name="interview_scheduled",
        context={
            "candidate_name": candidate.full_name,
            "round_type": payload.round_type,
            "opening_title": opening.title if opening else "",
            "scheduled_start": start_str,
            "meeting_link": meeting_link,
        },
        email_type="interview_scheduled",
        related_entity_type="interview",
        related_entity_id=interview.candidate_interview_id,
        meta_extra={"interview_id": interview.candidate_interview_id},
    )

    if interviewer_email:
        await send_email(
            session,
            candidate_id=candidate_id,
            to_emails=[interviewer_email],
            subject="Interview scheduled",
            template_name="interview_scheduled",
            context={
                "candidate_name": candidate.full_name,
                "round_type": payload.round_type,
                "opening_title": opening.title if opening else "",
                "scheduled_start": start_str,
                "meeting_link": meeting_link,
            },
            email_type="interview_scheduled",
            related_entity_type="interview",
            related_entity_id=interview.candidate_interview_id,
            meta_extra={"interview_id": interview.candidate_interview_id, "recipient": "interviewer"},
        )

    await session.commit()
    await session.refresh(interview)

    return _build_interview_out(interview, candidate=candidate, opening=opening, interviewer_meta=interviewer_meta)


@router.post("/candidates/{candidate_id}/interview-slots/propose", response_model=list[InterviewSlotOut])
async def propose_interview_slots(
    candidate_id: int,
    payload: InterviewSlotProposalIn,
    request: Request,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC])),
):
    if not _valid_round_type(payload.round_type):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only L1/L2 rounds are supported")

    candidate = await session.get(RecCandidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")
    if not candidate.email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Candidate email is required")

    interviewer_key = str(payload.interviewer_person_id_platform)
    interviewer_meta = (await _fetch_platform_people({interviewer_key})).get(
        interviewer_key, {}
    )
    interviewer_email = (interviewer_meta or {}).get("email")
    if not interviewer_email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Interviewer email is required")

    tz = ZoneInfo(settings.calendar_timezone or "Asia/Kolkata")
    slot_candidates = generate_candidate_slots(tz=tz)
    free_slots = filter_free_slots(interviewer_email=interviewer_email, slots=slot_candidates, tz=tz)
    if not free_slots:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="No free slots found for the next 3 business days")

    opening = None
    if candidate.opening_id is not None:
        opening = (await session.execute(select(RecOpening).where(RecOpening.opening_id == candidate.opening_id))).scalars().first()

    now_utc = datetime.utcnow()
    batch_id = build_selection_token()
    expires_at = (free_slots[-1].end_at.astimezone(timezone.utc)).replace(tzinfo=None)
    created_by = _platform_person_id_int(user)
    interviewer_pid = _normalize_person_id_int(payload.interviewer_person_id_platform)
    if interviewer_pid is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Interviewer id must be numeric")
    slots: list[RecCandidateInterviewSlot] = []
    for slot in free_slots:
        slot_start = slot.start_at.astimezone(timezone.utc).replace(tzinfo=None)
        slot_end = slot.end_at.astimezone(timezone.utc).replace(tzinfo=None)
        slots.append(
            RecCandidateInterviewSlot(
                candidate_id=candidate_id,
                round_type=payload.round_type,
                interviewer_person_id_platform=interviewer_pid,
                interviewer_email=interviewer_email,
                slot_start_at=slot_start,
                slot_end_at=slot_end,
                status="proposed",
                selection_token=build_selection_token(),
                batch_id=batch_id,
                expires_at=expires_at,
                created_by_person_id_platform=created_by,
                created_at=now_utc,
                updated_at=now_utc,
            )
        )
    session.add_all(slots)
    await session.flush()

    base_url = str(request.base_url).rstrip("/")
    slot_links = [
        {
            "label": _format_slot_label(slot.slot_start_at, tz),
            "link": _public_slot_link(base_url, slot.selection_token),
        }
        for slot in slots
    ]
    slot_rows = "\n".join(
        f'<tr><td style="padding:6px 0;">{item["label"]}</td><td style="padding:6px 0;"><a href="{item["link"]}" style="color:#2563eb;font-weight:600;">Select</a></td></tr>'
        for item in slot_links
    )

    await send_email(
        session,
        candidate_id=candidate_id,
        to_emails=[candidate.email],
        subject="Select your interview slot",
        template_name="interview_slot_options",
        context={
            "candidate_name": candidate.full_name,
            "round_type": payload.round_type,
            "opening_title": opening.title if opening else "",
            "interviewer_email": interviewer_email,
            "slots_table": slot_rows,
        },
        email_type="interview_slot_options",
        related_entity_type="interview_slot",
        related_entity_id=slots[0].candidate_interview_slot_id if slots else None,
        meta_extra={"batch_id": batch_id, "round_type": payload.round_type},
    )

    await session.commit()

    return [
        InterviewSlotOut(
            candidate_interview_slot_id=slot.candidate_interview_slot_id,
            slot_start_at=slot.slot_start_at,
            slot_end_at=slot.slot_end_at,
            selection_token=slot.selection_token,
            status=slot.status,
        )
        for slot in slots
    ]


@public_router.get("/slots/{token}", response_class=HTMLResponse)
async def select_interview_slot(
    token: str,
    request: Request,
    session: AsyncSession = Depends(deps.get_db_session),
):
    slot = (
        (
            await session.execute(
                select(RecCandidateInterviewSlot).where(RecCandidateInterviewSlot.selection_token == token)
            )
        )
        .scalars()
        .first()
    )
    if not slot:
        return HTMLResponse("<h2>Slot not found</h2><p>Please contact HR for a new invitation.</p>", status_code=404)

    if slot.status != "proposed":
        return HTMLResponse("<h2>Slot no longer available</h2><p>Please select a different slot.</p>", status_code=409)

    if slot.expires_at and slot.expires_at < datetime.utcnow():
        slot.status = "expired"
        await session.commit()
        return HTMLResponse("<h2>Slot invitation expired</h2><p>Please contact HR for a new invitation.</p>", status_code=410)

    candidate = await session.get(RecCandidate, slot.candidate_id)
    if not candidate:
        return HTMLResponse("<h2>Candidate not found</h2><p>Please contact HR.</p>", status_code=404)

    interviewer_email = slot.interviewer_email or ""
    if not interviewer_email:
        return HTMLResponse("<h2>Interviewer missing</h2><p>Please contact HR.</p>", status_code=400)

    tz = ZoneInfo(settings.calendar_timezone or "Asia/Kolkata")
    slot_start_utc = slot.slot_start_at.replace(tzinfo=timezone.utc)
    slot_end_utc = slot.slot_end_at.replace(tzinfo=timezone.utc)
    busy = query_freebusy(
        calendar_ids=[interviewer_email],
        start_at=slot_start_utc,
        end_at=slot_end_utc,
        subject_email=interviewer_email,
    ).get(interviewer_email, [])

    if busy:
        slot.status = "conflict"
        await session.commit()
        return await _render_slot_conflict(session, request, slot, tz)

    existing = (
        (
            await session.execute(
                select(RecCandidateInterview).where(
                    RecCandidateInterview.candidate_id == slot.candidate_id,
                    RecCandidateInterview.round_type == slot.round_type,
                )
            )
        )
        .scalars()
        .first()
    )
    if existing:
        return HTMLResponse("<h2>Interview already scheduled</h2><p>Please contact HR for changes.</p>", status_code=409)

    interview = RecCandidateInterview(
        candidate_id=slot.candidate_id,
        round_type=slot.round_type,
        interviewer_person_id_platform=str(slot.interviewer_person_id_platform) if slot.interviewer_person_id_platform is not None else None,
        scheduled_start_at=slot.slot_start_at,
        scheduled_end_at=slot.slot_end_at,
        feedback_submitted=False,
        created_by_person_id_platform=None,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    session.add(interview)
    await session.flush()

    opening = None
    if candidate.opening_id is not None:
        opening = (await session.execute(select(RecOpening).where(RecOpening.opening_id == candidate.opening_id))).scalars().first()

    try:
        cal_resp = create_calendar_event(
            summary=f"Interview - {candidate.full_name} - {(opening.title if opening else '')}".strip(),
            description="Candidate interview",
            start_at=slot.slot_start_at,
            end_at=slot.slot_end_at,
            attendees=[email for email in [interviewer_email, candidate.email] if email],
            calendar_id=interviewer_email or settings.calendar_id or "primary",
            subject_email=interviewer_email,
        )
        if cal_resp.get("event_id"):
            interview.calendar_event_id = cal_resp.get("event_id")
            if cal_resp.get("meeting_link") and not interview.meeting_link:
                interview.meeting_link = cal_resp.get("meeting_link")
            await log_event(
                session,
                candidate_id=slot.candidate_id,
                action_type="calendar_event_created",
                performed_by_person_id_platform=None,
                related_entity_type="interview",
                related_entity_id=interview.candidate_interview_id,
                meta_json={"calendar_event_id": cal_resp.get("event_id"), "meeting_link": cal_resp.get("meeting_link")},
            )
    except Exception as exc:  # noqa: BLE001
        await log_event(
            session,
            candidate_id=slot.candidate_id,
            action_type="calendar_event_failed",
            performed_by_person_id_platform=None,
            related_entity_type="interview",
            related_entity_id=interview.candidate_interview_id,
            meta_json={"error": str(exc)},
        )

    slot.status = "confirmed"
    slot.booked_interview_id = interview.candidate_interview_id
    slot.updated_at = datetime.utcnow()

    await session.execute(
        RecCandidateInterviewSlot.__table__.update()
        .where(RecCandidateInterviewSlot.batch_id == slot.batch_id, RecCandidateInterviewSlot.candidate_interview_slot_id != slot.candidate_interview_slot_id)
        .values(status="expired", updated_at=datetime.utcnow())
    )

    await log_event(
        session,
        candidate_id=slot.candidate_id,
        action_type="interview_scheduled",
        performed_by_person_id_platform=None,
        related_entity_type="interview",
        related_entity_id=interview.candidate_interview_id,
        meta_json={
            "round_type": slot.round_type,
            "interviewer_person_id_platform": slot.interviewer_person_id_platform,
            "scheduled_start_at": slot.slot_start_at.isoformat(),
            "scheduled_end_at": slot.slot_end_at.isoformat(),
            "source": "candidate_self_select",
        },
    )

    start_str = _format_slot_label(slot.slot_start_at, tz)
    meeting_link = interview.meeting_link or ""

    await send_email(
        session,
        candidate_id=slot.candidate_id,
        to_emails=[candidate.email],
        subject="Interview scheduled",
        template_name="interview_scheduled",
        context={
            "candidate_name": candidate.full_name,
            "round_type": slot.round_type,
            "opening_title": opening.title if opening else "",
            "scheduled_start": start_str,
            "meeting_link": meeting_link,
        },
        email_type="interview_scheduled",
        related_entity_type="interview",
        related_entity_id=interview.candidate_interview_id,
        meta_extra={"interview_id": interview.candidate_interview_id},
    )

    if interviewer_email:
        await send_email(
            session,
            candidate_id=slot.candidate_id,
            to_emails=[interviewer_email],
            subject="Interview scheduled",
            template_name="interview_scheduled",
            context={
                "candidate_name": candidate.full_name,
                "round_type": slot.round_type,
                "opening_title": opening.title if opening else "",
                "scheduled_start": start_str,
                "meeting_link": meeting_link,
            },
            email_type="interview_scheduled",
            related_entity_type="interview",
            related_entity_id=interview.candidate_interview_id,
            meta_extra={"interview_id": interview.candidate_interview_id, "recipient": "interviewer"},
        )

    await session.commit()

    return HTMLResponse(
        f"<h2>Interview confirmed</h2><p>Your interview is scheduled for {start_str}.</p><p>You will receive a confirmation email shortly.</p>",
        status_code=200,
    )


@router.post("/interviews/{candidate_interview_id}/cancel", response_class=HTMLResponse)
async def cancel_interview(
    candidate_interview_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    _user: UserContext = Depends(require_superadmin()),
):
    interview = await session.get(RecCandidateInterview, candidate_interview_id)
    if not interview:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found")
    interviewer_meta = (await _fetch_platform_people({interview.interviewer_person_id_platform or ""})).get(
        _clean_platform_person_id(interview.interviewer_person_id_platform) or "", {}
    )
    interviewer_email = (interviewer_meta or {}).get("email")
    if interview.calendar_event_id:
        try:
            delete_calendar_event(
                event_id=interview.calendar_event_id,
                calendar_id=interviewer_email or settings.calendar_id or "primary",
                subject_email=interviewer_email,
            )
        except Exception:
            pass
    interview.notes_internal = (interview.notes_internal or "") + "\nCancelled by Superadmin."
    interview.updated_at = datetime.utcnow()
    await session.commit()
    return HTMLResponse("<h2>Interview cancelled</h2>", status_code=200)


@router.post("/interviews/{candidate_interview_id}/reschedule", response_model=InterviewOut)
async def reschedule_interview(
    candidate_interview_id: int,
    payload: InterviewReschedule,
    session: AsyncSession = Depends(deps.get_db_session),
    _user: UserContext = Depends(require_superadmin()),
):
    interview = await session.get(RecCandidateInterview, candidate_interview_id)
    if not interview:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found")

    start_at = _normalize_to_utc(payload.scheduled_start_at)
    end_at = _normalize_to_utc(payload.scheduled_end_at)
    if end_at <= start_at:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="scheduled_end_at must be after scheduled_start_at")

    interviewer_meta = (await _fetch_platform_people({interview.interviewer_person_id_platform or ""})).get(
        _clean_platform_person_id(interview.interviewer_person_id_platform) or "", {}
    )
    interviewer_email = (interviewer_meta or {}).get("email")
    if interviewer_email:
        busy = query_freebusy(
            calendar_ids=[interviewer_email],
            start_at=start_at.replace(tzinfo=timezone.utc),
            end_at=end_at.replace(tzinfo=timezone.utc),
            subject_email=interviewer_email,
        ).get(interviewer_email, [])
        if busy:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Interviewer is busy in the selected slot")

    candidate = await session.get(RecCandidate, interview.candidate_id)
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")
    opening = None
    if candidate and candidate.opening_id is not None:
        opening = (await session.execute(select(RecOpening).where(RecOpening.opening_id == candidate.opening_id))).scalars().first()

    if interview.calendar_event_id:
        try:
            cal_resp = update_calendar_event(
                event_id=interview.calendar_event_id,
                summary=f"Interview - {candidate.full_name} - {(opening.title if opening else '')}".strip(),
                description="Candidate interview",
                start_at=start_at,
                end_at=end_at,
                attendees=[email for email in [interviewer_email, candidate.email if candidate else None] if email],
                calendar_id=interviewer_email or settings.calendar_id or "primary",
                subject_email=interviewer_email,
            )
            if cal_resp.get("meeting_link"):
                interview.meeting_link = cal_resp.get("meeting_link")
        except Exception:
            pass
    else:
        try:
            cal_resp = create_calendar_event(
                summary=f"Interview - {candidate.full_name} - {(opening.title if opening else '')}".strip(),
                description="Candidate interview",
                start_at=start_at,
                end_at=end_at,
                attendees=[email for email in [interviewer_email, candidate.email if candidate else None] if email],
                calendar_id=interviewer_email or settings.calendar_id or "primary",
                subject_email=interviewer_email,
            )
            if cal_resp.get("event_id"):
                interview.calendar_event_id = cal_resp.get("event_id")
            if cal_resp.get("meeting_link"):
                interview.meeting_link = cal_resp.get("meeting_link")
        except Exception:
            pass

    interview.scheduled_start_at = start_at
    interview.scheduled_end_at = end_at
    interview.updated_at = datetime.utcnow()
    await session.flush()

    tz = ZoneInfo(settings.calendar_timezone or "Asia/Kolkata")
    start_str = _format_slot_label(start_at, tz)
    meeting_link = interview.meeting_link or ""

    if candidate and candidate.email:
        await send_email(
            session,
            candidate_id=candidate.candidate_id,
            to_emails=[candidate.email],
            subject="Interview rescheduled",
            template_name="interview_scheduled",
            context={
                "candidate_name": candidate.full_name,
                "round_type": interview.round_type,
                "opening_title": opening.title if opening else "",
                "scheduled_start": start_str,
                "meeting_link": meeting_link,
            },
            email_type="interview_rescheduled",
            related_entity_type="interview",
            related_entity_id=interview.candidate_interview_id,
            meta_extra={"interview_id": interview.candidate_interview_id},
        )
    if interviewer_email:
        await send_email(
            session,
            candidate_id=candidate.candidate_id if candidate else 0,
            to_emails=[interviewer_email],
            subject="Interview rescheduled",
            template_name="interview_scheduled",
            context={
                "candidate_name": candidate.full_name if candidate else "Candidate",
                "round_type": interview.round_type,
                "opening_title": opening.title if opening else "",
                "scheduled_start": start_str,
                "meeting_link": meeting_link,
            },
            email_type="interview_rescheduled",
            related_entity_type="interview",
            related_entity_id=interview.candidate_interview_id,
            meta_extra={"interview_id": interview.candidate_interview_id, "recipient": "interviewer"},
        )

    await session.commit()
    return _build_interview_out(interview, candidate=candidate, opening=opening, interviewer_meta=interviewer_meta)


@router.get("/interviews", response_model=list[InterviewOut])
async def list_interviews(
    interviewer: str | None = Query(default=None),
    interviewer_person_id_platform: str | None = Query(default=None),
    candidate_id: int | None = Query(default=None),
    upcoming: bool | None = Query(default=None),
    pending_feedback: bool | None = Query(default=None),
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.HIRING_MANAGER, Role.INTERVIEWER, Role.VIEWER])),
):
    query = (
        select(RecCandidateInterview, RecCandidate, RecOpening)
        .join(RecCandidate, RecCandidate.candidate_id == RecCandidateInterview.candidate_id)
        .outerjoin(RecOpening, RecOpening.opening_id == RecCandidate.opening_id)
    )

    interviewer_filter = interviewer_person_id_platform
    if interviewer == "me":
        if user.person_id_platform:
            interviewer_filter = user.person_id_platform
        else:
            if settings.environment == "production":
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current user has no platform person id")

    if interviewer_filter:
        query = query.where(RecCandidateInterview.interviewer_person_id_platform == _clean_platform_person_id(interviewer_filter))

    if candidate_id is not None:
        query = query.where(RecCandidateInterview.candidate_id == candidate_id)

    now = datetime.utcnow()
    if upcoming is True:
        query = query.where(RecCandidateInterview.scheduled_start_at >= now)
    if upcoming is False:
        query = query.where(RecCandidateInterview.scheduled_start_at < now)
    if pending_feedback is True:
        query = query.where(RecCandidateInterview.feedback_submitted.is_(False), RecCandidateInterview.scheduled_end_at < now)

    if upcoming is True:
        query = query.order_by(RecCandidateInterview.scheduled_start_at.asc(), RecCandidateInterview.candidate_interview_id.asc())
    else:
        query = query.order_by(RecCandidateInterview.scheduled_start_at.desc(), RecCandidateInterview.candidate_interview_id.desc())

    rows = (await session.execute(query)).all()
    interviewer_ids = {row[0].interviewer_person_id_platform or "" for row in rows}
    interviewer_lookup = await _fetch_platform_people(interviewer_ids)

    out: list[InterviewOut] = []
    for interview, candidate, opening in rows:
        meta = interviewer_lookup.get(_clean_platform_person_id(interview.interviewer_person_id_platform) or "", {})
        out.append(_build_interview_out(interview, candidate=candidate, opening=opening, interviewer_meta=meta))
    return out


@router.get("/interviews/{candidate_interview_id}", response_model=InterviewOut)
async def get_interview(
    candidate_interview_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.HIRING_MANAGER, Role.INTERVIEWER, Role.VIEWER])),
):
    row = (
        await session.execute(
            select(RecCandidateInterview, RecCandidate, RecOpening)
            .join(RecCandidate, RecCandidate.candidate_id == RecCandidateInterview.candidate_id)
            .outerjoin(RecOpening, RecOpening.opening_id == RecCandidate.opening_id)
            .where(RecCandidateInterview.candidate_interview_id == candidate_interview_id)
        )
    ).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found")
    interview, candidate, opening = row
    _assert_interviewer_access(user, interview)
    interviewer_meta = (await _fetch_platform_people({interview.interviewer_person_id_platform or ""})).get(
        _clean_platform_person_id(interview.interviewer_person_id_platform) or "", {}
    )
    return _build_interview_out(interview, candidate=candidate, opening=opening, interviewer_meta=interviewer_meta)


@router.patch("/interviews/{candidate_interview_id}", response_model=InterviewOut)
async def update_interview(
    candidate_interview_id: int,
    payload: InterviewUpdate,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.HIRING_MANAGER, Role.INTERVIEWER])),
):
    interview = await session.get(RecCandidateInterview, candidate_interview_id)
    if not interview:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found")
    _assert_interviewer_access(user, interview)

    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nothing to update")

    for key, value in updates.items():
        setattr(interview, key, value)
    interview.updated_at = datetime.utcnow()

    await log_event(
        session,
        candidate_id=interview.candidate_id,
        action_type="interview_feedback_submitted",
        performed_by_person_id_platform=_platform_person_id_int(user),
        related_entity_type="interview",
        related_entity_id=interview.candidate_interview_id,
        meta_json={
            "round_type": interview.round_type,
            "decision": payload.decision,
            "feedback_submitted": payload.feedback_submitted,
            "rating_overall": payload.rating_overall,
            "rating_technical": payload.rating_technical,
            "rating_culture_fit": payload.rating_culture_fit,
            "rating_communication": payload.rating_communication,
        },
    )

    to_stage = None
    if payload.decision:
        to_stage = _round_to_transition(interview.round_type, payload.decision)

    if to_stage:
        await transition_stage(
            interview.candidate_id,
            StageTransitionRequest(to_stage=to_stage, decision=payload.decision, note="interview_feedback"),
            session,
            user,
        )
    else:
        await session.commit()

    await session.refresh(interview)
    candidate = await session.get(RecCandidate, interview.candidate_id)
    opening = None
    if candidate and candidate.opening_id is not None:
        opening = (await session.execute(select(RecOpening).where(RecOpening.opening_id == candidate.opening_id))).scalars().first()
    interviewer_meta = (await _fetch_platform_people({interview.interviewer_person_id_platform or ""})).get(
        _clean_platform_person_id(interview.interviewer_person_id_platform) or "", {}
    )
    return _build_interview_out(interview, candidate=candidate, opening=opening, interviewer_meta=interviewer_meta)
