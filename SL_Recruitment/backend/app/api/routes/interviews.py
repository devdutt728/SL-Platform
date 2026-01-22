from __future__ import annotations

from datetime import datetime, time, timedelta, timezone
import json
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import HTMLResponse
from sqlalchemy import delete, func, select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.api import deps
from app.api.routes.candidates import transition_stage
from app.core.auth import require_roles, require_superadmin
from app.core.config import settings
from app.core.roles import Role
from app.core.paths import resolve_repo_path
from app.db.platform_session import PlatformSessionLocal
from app.models.candidate import RecCandidate
from app.models.event import RecCandidateEvent
from app.models.interview import RecCandidateInterview
from app.models.interview_assessment import RecCandidateInterviewAssessment
from app.models.interview_slot import RecCandidateInterviewSlot
from app.models.opening import RecOpening
from app.models.platform_person import DimPerson
from app.models.platform_role import DimRole
from app.schemas.interview import InterviewCancel, InterviewCreate, InterviewOut, InterviewReschedule, InterviewUpdate
from app.schemas.interview_slots import InterviewSlotOut, InterviewSlotPreviewOut, InterviewSlotProposalIn
from app.schemas.stage import StageTransitionRequest
from app.schemas.user import UserContext
from app.services.platform_identity import active_status_filter
from app.services.calendar import create_calendar_event, delete_calendar_event, query_freebusy, update_calendar_event
from app.services.calendar import list_calendar_events, list_calendar_list_details, list_visible_calendar_ids, service_account_info
from app.services.email import render_template, send_email
from app.services.events import log_event
from app.services.interview_slots import (
    build_selection_token,
    build_signed_selection_token,
    filter_free_slots,
    verify_signed_selection_token,
)

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


def _round_to_feedback_stage(round_type: str) -> str:
    round_norm = _normalize_round(round_type)
    if "l2" in round_norm:
        return "l2_feedback"
    if "l1" in round_norm:
        return "l1_feedback"
    return "l2_feedback"


def _is_superadmin(user: UserContext) -> bool:
    if (user.platform_role_id or None) == 2:
        return True
    if user.platform_role_id is None and Role.HR_ADMIN in user.roles and settings.environment != "production":
        return True
    return False


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


def _unwrap_selection_token(raw: str) -> str | None:
    token = verify_signed_selection_token(raw)
    if token:
        return token
    if settings.environment != "production":
        return raw
    return None


def _render_page(title: str, body_html: str, status_code: int) -> HTMLResponse:
    html = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
    <style>
      :root {{
        color-scheme: light;
      }}
      body {{
        margin: 0;
        font-family: "Manrope", "Segoe UI", "Helvetica Neue", Arial, sans-serif;
        background: radial-gradient(circle at 20% 20%, #e9f0ff 0%, #f8fbff 40%, #ffffff 100%);
        color: #0f172a;
      }}
      .wrap {{
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
      }}
      .card {{
        width: 100%;
        max-width: 720px;
        background: rgba(255, 255, 255, 0.9);
        border: 1px solid #e2e8f0;
        border-radius: 20px;
        padding: 28px;
        box-shadow: 0 25px 60px rgba(15, 23, 42, 0.08);
      }}
      h1 {{
        margin: 0 0 12px;
        font-size: 26px;
        letter-spacing: -0.01em;
      }}
      p {{
        margin: 0 0 12px;
        line-height: 1.6;
        color: #334155;
      }}
      .slot-list {{
        list-style: none;
        padding: 0;
        margin: 18px 0 0;
        display: grid;
        gap: 12px;
      }}
      .slot {{
        background: #0f172a;
        color: #f8fafc;
        border-radius: 12px;
        padding: 14px 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }}
      .slot a {{
        color: #f8fafc;
        text-decoration: none;
        font-weight: 600;
        padding: 6px 12px;
        border-radius: 999px;
        background: linear-gradient(120deg, #2563eb, #0ea5e9);
      }}
      .pill {{
        display: inline-block;
        padding: 6px 12px;
        border-radius: 999px;
        background: #e2e8f0;
        color: #0f172a;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }}
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <span class="pill">Interview Scheduling</span>
        <h1>{title}</h1>
        {body_html}
      </div>
    </div>
  </body>
</html>"""
    return HTMLResponse(html, status_code=status_code)


def _reservation_stale_cutoff(now: datetime) -> datetime:
    return now - timedelta(minutes=10)


async def _release_stale_reservations(session: AsyncSession, *, batch_id: str, now: datetime) -> None:
    await session.execute(
        RecCandidateInterviewSlot.__table__.update()
        .where(
            RecCandidateInterviewSlot.batch_id == batch_id,
            RecCandidateInterviewSlot.status == "reserved",
            RecCandidateInterviewSlot.updated_at < _reservation_stale_cutoff(now),
        )
        .values(status="proposed", updated_at=now)
    )


async def _render_slot_conflict(
    session: AsyncSession,
    request: Request,
    slot: RecCandidateInterviewSlot,
    tz: ZoneInfo,
) -> HTMLResponse:
    now = datetime.utcnow()
    latest_expiry = (
        await session.execute(
            select(func.max(RecCandidateInterviewSlot.expires_at)).where(
                RecCandidateInterviewSlot.batch_id == slot.batch_id,
            )
        )
    ).scalar_one_or_none()
    if latest_expiry and latest_expiry < now:
        return _render_page(
            "Slot invitation expired",
            "<p>Please contact HR for a new invitation.</p>",
            status_code=410,
        )
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
        return _render_page(
            "Slot unavailable",
            "<p>Please contact HR for a new invitation.</p>",
            status_code=200,
        )

    interviewer_email = slot.interviewer_email or ""
    if not interviewer_email:
        return _render_page(
            "Slot unavailable",
            "<p>Please contact HR for a new invitation.</p>",
            status_code=200,
        )

    base_url = str(request.base_url).rstrip("/")
    slots_html = "\n".join(
        f'<li class="slot"><span>{_format_slot_label(r.slot_start_at, tz)}</span>'
        f'<a href="{_public_slot_link(base_url, build_signed_selection_token(r.selection_token))}">Select</a></li>'
        for r in remaining
    )
    return _render_page(
        "Slot just got booked",
        f"<p>Please select another available slot:</p><ul class=\"slot-list\">{slots_html}</ul>",
        status_code=200,
    )


async def _fetch_platform_people(ids: set[str], *, include_inactive: bool = False) -> dict[str, dict]:
    ids = {pid for pid in ids if pid}
    if not ids:
        return {}
    try:
        async with PlatformSessionLocal() as platform_session:
            filters = [DimPerson.person_id.in_(list(ids))]
            if not include_inactive:
                filters.append(active_status_filter())
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
                    ).where(*filters)
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
    interview_status: str | None = None,
) -> InterviewOut:
    return InterviewOut(
        candidate_interview_id=interview.candidate_interview_id,
        candidate_id=interview.candidate_id,
        stage_name=interview.stage_name,
        round_type=interview.round_type,
        interview_status=interview_status,
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
    if Role.INTERVIEWER in user.roles or Role.GROUP_LEAD in user.roles:
        if user.person_id_platform and interview.interviewer_person_id_platform:
            if _clean_platform_person_id(user.person_id_platform) == _clean_platform_person_id(interview.interviewer_person_id_platform):
                return
        if settings.environment != "production" and not user.person_id_platform:
            return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")


def _active_interview_filter():
    cancelled_values = ("cancelled", "canceled")
    decision_normalized = func.lower(func.coalesce(RecCandidateInterview.decision, ""))
    notes_normalized = func.lower(func.coalesce(RecCandidateInterview.notes_internal, ""))
    cancelled_marker = or_(
        decision_normalized.in_(cancelled_values),
        notes_normalized.like("%cancelled%"),
        notes_normalized.like("%canceled%"),
    )
    return ~cancelled_marker


async def _load_interview_statuses(
    session: AsyncSession,
    *,
    interview_ids: list[int],
) -> dict[int, str]:
    if not interview_ids:
        return {}
    rows = (
        await session.execute(
            select(
                RecCandidateEvent.related_entity_id,
                RecCandidateEvent.meta_json,
                RecCandidateEvent.created_at,
                RecCandidateEvent.candidate_event_id,
            )
            .where(
                RecCandidateEvent.related_entity_type == "interview",
                RecCandidateEvent.action_type == "interview_status_marked",
                RecCandidateEvent.related_entity_id.in_(interview_ids),
            )
            .order_by(
                RecCandidateEvent.related_entity_id.asc(),
                RecCandidateEvent.created_at.desc(),
                RecCandidateEvent.candidate_event_id.desc(),
            )
        )
    ).all()
    latest: dict[int, str] = {}
    for related_id, meta_json, _created_at, _event_id in rows:
        if related_id is None or related_id in latest:
            continue
        try:
            meta = json.loads(meta_json) if meta_json else {}
        except Exception:
            meta = {}
        status_value = meta.get("status") if isinstance(meta, dict) else None
        if isinstance(status_value, str) and status_value.strip():
            latest[int(related_id)] = status_value.strip()
    return latest


class InterviewStatusPayload(BaseModel):
    status: str


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
    candidate_code = candidate.candidate_code or f"SLR-{candidate.candidate_id:04d}"

    existing_query = select(RecCandidateInterview).where(
        RecCandidateInterview.candidate_id == candidate_id,
        RecCandidateInterview.round_type == payload.round_type,
    )
    existing_query = existing_query.where(_active_interview_filter())
    existing = (await session.execute(existing_query)).scalars().first()
    if existing:
        is_superadmin = _is_superadmin(user)
        detail = "Interview already scheduled. Only Superadmin can schedule again." if not is_superadmin else "Interview already scheduled."
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)

    interview = RecCandidateInterview(
        candidate_id=candidate_id,
        stage_name=_normalize_round(payload.round_type),
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

    interviewer_meta = (await _fetch_platform_people({payload.interviewer_person_id_platform}, include_inactive=_is_superadmin(user))).get(
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
    candidate_code = candidate.candidate_code or f"SLR-{candidate.candidate_id:04d}"
    interviewer_name = (interviewer_meta or {}).get("name") or (interviewer_email.split("@")[0] if interviewer_email else "there")

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
            subject=f"Interview scheduled for {(opening.title if opening else 'Role')} - {candidate.full_name}",
            template_name="interview_scheduled_interviewer",
            context={
                "interviewer_name": interviewer_name,
                "candidate_name": candidate.full_name,
                "candidate_code": candidate_code,
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

    interviewer_email = (payload.interviewer_email or "").strip() or None
    interviewer_pid = _clean_platform_person_id(payload.interviewer_person_id_platform)
    interviewer_meta = {}
    if not interviewer_email and interviewer_pid:
        interviewer_meta = (await _fetch_platform_people({interviewer_pid}, include_inactive=_is_superadmin(user))).get(
            interviewer_pid, {}
        )
        interviewer_email = (interviewer_meta or {}).get("email")
    if not interviewer_email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Interviewer email is required")

    existing_query = select(RecCandidateInterview).where(
        RecCandidateInterview.candidate_id == candidate_id,
        RecCandidateInterview.round_type == payload.round_type,
    )
    existing_query = existing_query.where(_active_interview_filter())
    existing = (await session.execute(existing_query)).scalars().first()
    if existing:
        is_superadmin = _is_superadmin(user)
        detail = "Interview already scheduled. Only Superadmin can schedule again." if not is_superadmin else "Interview already scheduled."
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)

    tz = ZoneInfo(settings.calendar_timezone or "Asia/Kolkata")
    start_day = payload.start_date or datetime.now(tz).date()
    free_slots = filter_free_slots(interviewer_email=interviewer_email, start_day=start_day, tz=tz)
    if not free_slots:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="No free slots found for the next 3 business days")

    opening = None
    if candidate.opening_id is not None:
        opening = (await session.execute(select(RecOpening).where(RecOpening.opening_id == candidate.opening_id))).scalars().first()

    now_utc = datetime.utcnow()
    batch_id = build_selection_token()
    last_slot_end = (free_slots[-1].end_at.astimezone(timezone.utc)).replace(tzinfo=None)
    ttl_floor = datetime.utcnow() + timedelta(hours=settings.public_link_ttl_hours)
    expires_at = max(last_slot_end, ttl_floor)
    created_by = _platform_person_id_int(user)
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
            "link": _public_slot_link(base_url, build_signed_selection_token(slot.selection_token)),
        }
        for slot in slots
    ]
    slot_rows = "\n".join(
        "<tr>"
        f'<td style="padding:12px 0; color:#0f172a; font-weight:600; font-size:15px;">{item["label"]}</td>'
        f'<td style="padding:12px 0; text-align:right;">'
        f'<a href="{item["link"]}" '
        'style="display:inline-block; padding:10px 18px; border-radius:999px; '
        'background:linear-gradient(120deg,#0ea5e9,#22c55e); color:#ffffff; text-decoration:none; '
        'font-weight:700; font-size:13px; letter-spacing:0.02em;">Select slot</a>'
        "</td>"
        "</tr>"
        for item in slot_links
    )

    candidate_code = candidate.candidate_code or f"SLR-{candidate.candidate_id:04d}"
    await send_email(
        session,
        candidate_id=candidate_id,
        to_emails=[candidate.email],
        subject=f"Interview slot selection - {candidate.full_name} ({candidate_code})",
        template_name="interview_slot_options",
        context={
            "candidate_name": candidate.full_name,
            "candidate_code": candidate_code,
            "round_type": payload.round_type,
            "opening_title": opening.title if opening else "",
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
            selection_token=build_signed_selection_token(slot.selection_token),
            status=slot.status,
        )
        for slot in slots
    ]


@router.get("/interview-slots/preview", response_model=list[InterviewSlotPreviewOut])
async def preview_interview_slots(
    interviewer_person_id_platform: str | None = Query(default=None, min_length=1, max_length=64),
    interviewer_email: str | None = Query(default=None),
    start_date: str | None = Query(default=None),
    _user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC])),
):
    tz = ZoneInfo(settings.calendar_timezone or "Asia/Kolkata")
    parsed_start = None
    if start_date:
        try:
            parsed_start = datetime.fromisoformat(start_date).date()
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid start_date format")

    email = (interviewer_email or "").strip() or None
    interviewer_key = _clean_platform_person_id(interviewer_person_id_platform) if interviewer_person_id_platform else None
    interviewer_meta = {}
    if not email and interviewer_key:
        interviewer_meta = (await _fetch_platform_people({interviewer_key}, include_inactive=_is_superadmin(_user))).get(
            interviewer_key, {}
        )
        email = (interviewer_meta or {}).get("email")
    if not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Interviewer email is required")

    start_day = parsed_start or datetime.now(tz).date()
    free_slots = filter_free_slots(interviewer_email=email, start_day=start_day, tz=tz)
    return [
        InterviewSlotPreviewOut(
            slot_start_at=slot.start_at.astimezone(timezone.utc).replace(tzinfo=None),
            slot_end_at=slot.end_at.astimezone(timezone.utc).replace(tzinfo=None),
            label=_format_slot_label(slot.start_at.astimezone(timezone.utc).replace(tzinfo=None), tz),
        )
        for slot in free_slots
    ]


@router.get("/interviews/email-preview")
async def preview_interview_email(
    candidate_id: int = Query(ge=1),
    round_type: str = Query(min_length=1, max_length=50),
    scheduled_start_at: str = Query(min_length=1),
    meeting_link: str | None = Query(default=None),
    session: AsyncSession = Depends(deps.get_db_session),
    _user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.HIRING_MANAGER])),
):
    candidate = await session.get(RecCandidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")
    opening = None
    if candidate.opening_id is not None:
        opening = (await session.execute(select(RecOpening).where(RecOpening.opening_id == candidate.opening_id))).scalars().first()

    try:
        parsed = datetime.fromisoformat(scheduled_start_at)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid scheduled_start_at format")
    start_at = _normalize_to_utc(parsed)
    tz = ZoneInfo(settings.calendar_timezone or "Asia/Kolkata")
    start_str = _format_slot_label(start_at, tz)
    html = render_template(
        "interview_scheduled",
        {
            "candidate_name": candidate.full_name,
            "round_type": round_type,
            "opening_title": opening.title if opening else "",
            "scheduled_start": start_str,
            "meeting_link": meeting_link or "",
        },
    )
    return Response(content=html, media_type="text/html")


@router.get("/interview-slots/email-preview")
async def preview_interview_slot_email(
    candidate_id: int = Query(ge=1),
    round_type: str = Query(min_length=1, max_length=50),
    interviewer_email: str = Query(min_length=3, max_length=255),
    start_date: str | None = Query(default=None),
    session: AsyncSession = Depends(deps.get_db_session),
    _user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.HIRING_MANAGER])),
):
    candidate = await session.get(RecCandidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")
    opening = None
    if candidate.opening_id is not None:
        opening = (await session.execute(select(RecOpening).where(RecOpening.opening_id == candidate.opening_id))).scalars().first()

    parsed_start = None
    if start_date:
        try:
            parsed_start = datetime.fromisoformat(start_date).date()
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid start_date format")

    tz = ZoneInfo(settings.calendar_timezone or "Asia/Kolkata")
    start_day = parsed_start or datetime.now(tz).date()
    free_slots = filter_free_slots(interviewer_email=interviewer_email, start_day=start_day, tz=tz)

    slot_links = [
        {"label": _format_slot_label(slot.start_at.astimezone(timezone.utc).replace(tzinfo=None), tz), "link": "#"}
        for slot in free_slots
    ]
    if slot_links:
        slot_rows = "\n".join(
            "<tr>"
            f'<td style="padding:12px 0; color:#0f172a; font-weight:600; font-size:15px;">{item["label"]}</td>'
            f'<td style="padding:12px 0; text-align:right;">'
            f'<a href="{item["link"]}" '
            'style="display:inline-block; padding:10px 18px; border-radius:999px; '
            'background:linear-gradient(120deg,#0ea5e9,#22c55e); color:#ffffff; text-decoration:none; '
            'font-weight:700; font-size:13px; letter-spacing:0.02em;">Select slot</a>'
            "</td>"
            "</tr>"
            for item in slot_links
        )
    else:
        slot_rows = (
            "<tr>"
            "<td style=\"padding:14px 0; color:#64748b; font-size:14px;\">"
            "No available slots in the selected window."
            "</td>"
            "</tr>"
        )

    html = render_template(
        "interview_slot_options",
        {
            "candidate_name": candidate.full_name,
            "candidate_code": candidate_code,
            "round_type": round_type,
            "opening_title": opening.title if opening else "",
            "slots_table": slot_rows,
        },
    )
    return Response(content=html, media_type="text/html")


@router.get("/interview-slots/debug")
async def debug_interview_slot_lookup(
    interviewer_email: str = Query(min_length=3, max_length=255),
    start_date: str = Query(min_length=1),
    session: AsyncSession = Depends(deps.get_db_session),
    _user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC])),
):
    tz = ZoneInfo(settings.calendar_timezone or "Asia/Kolkata")
    try:
        parsed_start = datetime.fromisoformat(start_date).date()
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid start_date format")

    day_start = datetime.combine(parsed_start, time(0, 0), tzinfo=tz)
    day_end = datetime.combine(parsed_start, time(23, 59), tzinfo=tz)

    calendar_ids = [interviewer_email]

    busy_map = query_freebusy(
        calendar_ids=calendar_ids,
        start_at=day_start,
        end_at=day_end,
        subject_email=interviewer_email,
    )
    busy_flat: list[dict[str, str]] = []
    for cid in calendar_ids:
        busy_flat.extend(busy_map.get(cid, []))

    events: list[dict[str, str]] = []
    for cid in calendar_ids:
        items = list_calendar_events(
            calendar_id=cid,
            start_at=day_start,
            end_at=day_end,
            subject_email=interviewer_email,
        )
        for event in items:
            if (event.get("status") or "").lower() == "cancelled":
                continue
            start_info = event.get("start") or {}
            end_info = event.get("end") or {}
            start_raw = start_info.get("dateTime")
            end_raw = end_info.get("dateTime")
            if not start_raw or not end_raw:
                continue
            events.append(
                {
                    "calendar_id": cid,
                    "summary": (event.get("summary") or "")[:80],
                    "start": start_raw,
                    "end": end_raw,
                }
            )

    try:
        calendar_list = list_calendar_list_details(subject_email=interviewer_email)
    except Exception:
        calendar_list = []

    return {
        "settings": {
            "enable_calendar": settings.enable_calendar,
            "calendar_id": settings.calendar_id,
            "calendar_timezone": settings.calendar_timezone,
            "google_application_credentials": settings.google_application_credentials,
        },
        "service_account": service_account_info(),
        "calendar_list": calendar_list,
        "calendar_ids": calendar_ids,
        "busy_ranges": busy_flat,
        "events": events,
    }


@router.get("/email/debug")
async def debug_email_settings(
    _user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC])),
):
    credentials_path = settings.google_application_credentials or ""
    resolved_path = str(resolve_repo_path(credentials_path)) if credentials_path else ""
    return {
        "settings": {
            "enable_gmail": settings.enable_gmail,
            "gmail_sender_email": settings.gmail_sender_email,
            "gmail_sender_name": settings.gmail_sender_name,
            "google_application_credentials": settings.google_application_credentials,
        },
        "credentials": {
            "resolved_path": resolved_path,
            "file_exists": bool(resolved_path) and resolve_repo_path(credentials_path).exists(),
        },
    }


@public_router.get("/slots/{token}", response_class=HTMLResponse)
async def select_interview_slot(
    token: str,
    request: Request,
    session: AsyncSession = Depends(deps.get_db_session),
):
    raw_token = _unwrap_selection_token(token)
    if not raw_token:
        return _render_page(
            "Slot not found",
            "<p>Please contact HR for a new invitation.</p>",
            status_code=404,
        )

    async with session.begin():
        slot = (
            (
                await session.execute(
                    select(RecCandidateInterviewSlot)
                    .where(RecCandidateInterviewSlot.selection_token == raw_token)
                    .with_for_update()
                )
            )
            .scalars()
            .first()
        )
        if not slot:
            return _render_page(
                "Slot not found",
                "<p>Please contact HR for a new invitation.</p>",
                status_code=404,
            )

        await _release_stale_reservations(session, batch_id=slot.batch_id, now=datetime.utcnow())

        if slot.status != "proposed":
            if slot.status in {"reserved", "conflict", "expired"}:
                return await _render_slot_conflict(session, request, slot, tz=ZoneInfo(settings.calendar_timezone or "Asia/Kolkata"))
            title = "Slot already selected" if slot.status in {"reserved", "confirmed"} else "Slot no longer available"
            message = (
                "<p>This slot has already been selected. Please contact HR for changes.</p>"
                if slot.status in {"reserved", "confirmed"}
                else "<p>Please select a different slot.</p>"
            )
            return _render_page(title, message, status_code=200)

        if slot.expires_at and slot.expires_at < datetime.utcnow():
            slot.status = "expired"
            return _render_page(
                "Slot invitation expired",
                "<p>Please contact HR for a new invitation.</p>",
                status_code=410,
            )

        slot.status = "reserved"
        slot.updated_at = datetime.utcnow()

    candidate = await session.get(RecCandidate, slot.candidate_id)
    if not candidate:
        slot.status = "proposed"
        await session.commit()
        return _render_page(
            "Candidate not found",
            "<p>Please contact HR.</p>",
            status_code=404,
        )

    interviewer_email = slot.interviewer_email or ""
    if not interviewer_email:
        slot.status = "proposed"
        await session.commit()
        return _render_page(
            "Interviewer missing",
            "<p>Please contact HR.</p>",
            status_code=400,
        )

    tz = ZoneInfo(settings.calendar_timezone or "Asia/Kolkata")
    slot_start_utc = slot.slot_start_at.replace(tzinfo=timezone.utc)
    slot_end_utc = slot.slot_end_at.replace(tzinfo=timezone.utc)
    # Allow selection for pre-proposed slots even if the calendar changed after the invite was sent.

    existing = (
        (
            await session.execute(
                select(RecCandidateInterview).where(
                    RecCandidateInterview.candidate_id == slot.candidate_id,
                    RecCandidateInterview.round_type == slot.round_type,
                    _active_interview_filter(),
                )
            )
        )
        .scalars()
        .first()
    )
    if existing:
        slot.status = "conflict"
        slot.updated_at = datetime.utcnow()
        await session.commit()
        return _render_page(
            "Slot already selected",
            "<p>An interview is already scheduled for this round. Please contact HR for changes.</p>",
            status_code=200,
        )

    interview = RecCandidateInterview(
        candidate_id=slot.candidate_id,
        stage_name=_normalize_round(slot.round_type),
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
        .where(
            RecCandidateInterviewSlot.candidate_id == slot.candidate_id,
            RecCandidateInterviewSlot.round_type == slot.round_type,
            RecCandidateInterviewSlot.candidate_interview_slot_id != slot.candidate_interview_slot_id,
            RecCandidateInterviewSlot.status.in_(["proposed", "reserved"]),
        )
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
    candidate_code = candidate.candidate_code or f"SLR-{candidate.candidate_id:04d}"
    interviewer_meta = (await _fetch_platform_people({slot.interviewer_person_id_platform or ""})).get(
        _clean_platform_person_id(slot.interviewer_person_id_platform) or "", {}
    )
    interviewer_name = (interviewer_meta or {}).get("name") or (interviewer_email.split("@")[0] if interviewer_email else "there")

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
            subject=f"Interview scheduled for {(opening.title if opening else 'Role')} - {candidate.full_name}",
            template_name="interview_scheduled_interviewer",
            context={
                "interviewer_name": interviewer_name,
                "candidate_name": candidate.full_name,
                "candidate_code": candidate_code,
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

    return _render_page(
        "Interview confirmed",
        f"<p>Your interview is scheduled for {start_str}.</p><p>You will receive a confirmation email shortly.</p>",
        status_code=200,
    )


@router.post("/interviews/{candidate_interview_id}/cancel", response_class=HTMLResponse)
async def cancel_interview(
    candidate_interview_id: int,
    payload: InterviewCancel | None = None,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC])),
):
    interview = await session.get(RecCandidateInterview, candidate_interview_id)
    if not interview:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found")
    if interview.feedback_submitted:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Interview feedback already submitted; cannot cancel.")
    interviewer_meta = (await _fetch_platform_people({interview.interviewer_person_id_platform or ""}, include_inactive=_is_superadmin(user))).get(
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
    await session.execute(
        delete(RecCandidateInterviewSlot).where(
            RecCandidateInterviewSlot.candidate_id == interview.candidate_id,
            RecCandidateInterviewSlot.round_type == interview.round_type,
        )
    )
    candidate = await session.get(RecCandidate, interview.candidate_id)
    opening = await session.get(RecOpening, candidate.opening_id) if candidate and candidate.opening_id else None
    tz = ZoneInfo(settings.calendar_timezone or "Asia/Kolkata")
    start_str = _format_slot_label(interview.scheduled_start_at, tz)
    reason = (payload.reason or "").strip() if payload else ""
    reason_value = reason or "Not specified"

    await log_event(
        session,
        candidate_id=interview.candidate_id,
        action_type="interview_cancelled",
        performed_by_person_id_platform=_platform_person_id_int(user),
        related_entity_type="interview",
        related_entity_id=interview.candidate_interview_id,
        meta_json={
            "round_type": interview.round_type,
            "scheduled_start_at": interview.scheduled_start_at.isoformat(),
            "scheduled_end_at": interview.scheduled_end_at.isoformat(),
            "reason": reason_value,
        },
    )

    if candidate and candidate.email:
        await send_email(
            session,
            candidate_id=candidate.candidate_id,
            to_emails=[candidate.email],
            subject="Interview cancelled",
            template_name="interview_cancelled",
            context={
                "candidate_name": candidate.full_name,
                "round_type": interview.round_type,
                "opening_title": opening.title if opening else "",
                "scheduled_start": start_str,
                "reason": reason_value,
            },
            email_type="interview_cancelled",
            related_entity_type="interview",
            related_entity_id=interview.candidate_interview_id,
            meta_extra={"interview_id": interview.candidate_interview_id},
        )
    if interviewer_email:
        await send_email(
            session,
            candidate_id=interview.candidate_id,
            to_emails=[interviewer_email],
            subject=f"Interview cancelled for {(opening.title if opening else 'Role')} - {candidate.full_name if candidate else 'Candidate'}",
            template_name="interview_cancelled_interviewer",
            context={
                "interviewer_name": (interviewer_meta or {}).get("name") or (interviewer_email.split("@")[0] if interviewer_email else "there"),
                "candidate_name": candidate.full_name if candidate else "Candidate",
                "candidate_code": candidate.candidate_code if candidate else "",
                "round_type": interview.round_type,
                "opening_title": opening.title if opening else "",
                "scheduled_start": start_str,
                "reason": reason_value,
            },
            email_type="interview_cancelled",
            related_entity_type="interview",
            related_entity_id=interview.candidate_interview_id,
            meta_extra={"interview_id": interview.candidate_interview_id, "recipient": "interviewer"},
        )
    await session.delete(interview)
    await session.commit()
    return HTMLResponse("<h2>Interview cancelled</h2>", status_code=200)


@router.post("/interviews/{candidate_interview_id}/reschedule", response_model=InterviewOut)
async def reschedule_interview(
    candidate_interview_id: int,
    payload: InterviewReschedule,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC])),
):
    interview = await session.get(RecCandidateInterview, candidate_interview_id)
    if not interview:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found")
    if interview.feedback_submitted:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Interview feedback already submitted; cannot reschedule.")

    start_at = _normalize_to_utc(payload.scheduled_start_at)
    end_at = _normalize_to_utc(payload.scheduled_end_at)
    if end_at <= start_at:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="scheduled_end_at must be after scheduled_start_at")

    interviewer_meta = (await _fetch_platform_people({interview.interviewer_person_id_platform or ""}, include_inactive=_is_superadmin(user))).get(
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
    candidate_code = candidate.candidate_code or f"SLR-{candidate.candidate_id:04d}"
    interviewer_name = (interviewer_meta or {}).get("name") or (interviewer_email.split("@")[0] if interviewer_email else "there")

    reason_value = (payload.reason or "").strip() or "Not specified"

    await log_event(
        session,
        candidate_id=interview.candidate_id,
        action_type="interview_rescheduled",
        performed_by_person_id_platform=_platform_person_id_int(user),
        related_entity_type="interview",
        related_entity_id=interview.candidate_interview_id,
        meta_json={
            "round_type": interview.round_type,
            "scheduled_start_at": start_at.isoformat(),
            "scheduled_end_at": end_at.isoformat(),
            "reason": reason_value,
        },
    )

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
                "reason": reason_value,
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
            subject=f"Interview rescheduled for {(opening.title if opening else 'Role')} - {candidate.full_name if candidate else 'Candidate'}",
            template_name="interview_scheduled_interviewer",
            context={
                "interviewer_name": interviewer_name,
                "candidate_name": candidate.full_name if candidate else "Candidate",
                "candidate_code": candidate_code,
                "round_type": interview.round_type,
                "opening_title": opening.title if opening else "",
                "scheduled_start": start_str,
                "meeting_link": meeting_link,
                "reason": reason_value,
            },
            email_type="interview_rescheduled",
            related_entity_type="interview",
            related_entity_id=interview.candidate_interview_id,
            meta_extra={"interview_id": interview.candidate_interview_id, "recipient": "interviewer"},
        )

    await session.commit()
    status_lookup = await _load_interview_statuses(session, interview_ids=[interview.candidate_interview_id])
    return _build_interview_out(
        interview,
        candidate=candidate,
        opening=opening,
        interviewer_meta=interviewer_meta,
        interview_status=status_lookup.get(interview.candidate_interview_id),
    )


@router.get("/interviews", response_model=list[InterviewOut])
async def list_interviews(
    interviewer: str | None = Query(default=None),
    interviewer_person_id_platform: str | None = Query(default=None),
    candidate_id: int | None = Query(default=None),
    upcoming: bool | None = Query(default=None),
    pending_feedback: bool | None = Query(default=None),
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.HIRING_MANAGER, Role.INTERVIEWER, Role.GROUP_LEAD, Role.VIEWER])),
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
    elif (Role.INTERVIEWER in user.roles or Role.GROUP_LEAD in user.roles) and not (
        Role.HR_ADMIN in user.roles or Role.HR_EXEC in user.roles or Role.HIRING_MANAGER in user.roles
    ):
        if user.person_id_platform:
            interviewer_filter = user.person_id_platform
        elif settings.environment == "production":
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
    interviewer_lookup = await _fetch_platform_people(interviewer_ids, include_inactive=_is_superadmin(user))

    interview_ids = [row[0].candidate_interview_id for row in rows]
    status_lookup = await _load_interview_statuses(session, interview_ids=interview_ids)
    out: list[InterviewOut] = []
    for interview, candidate, opening in rows:
        meta = interviewer_lookup.get(_clean_platform_person_id(interview.interviewer_person_id_platform) or "", {})
        out.append(
            _build_interview_out(
                interview,
                candidate=candidate,
                opening=opening,
                interviewer_meta=meta,
                interview_status=status_lookup.get(interview.candidate_interview_id),
            )
        )
    return out


@router.get("/interviews/{candidate_interview_id}", response_model=InterviewOut)
async def get_interview(
    candidate_interview_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.HIRING_MANAGER, Role.INTERVIEWER, Role.GROUP_LEAD, Role.VIEWER])),
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
    interviewer_meta = (await _fetch_platform_people({interview.interviewer_person_id_platform or ""}, include_inactive=_is_superadmin(user))).get(
        _clean_platform_person_id(interview.interviewer_person_id_platform) or "", {}
    )
    status_lookup = await _load_interview_statuses(session, interview_ids=[candidate_interview_id])
    return _build_interview_out(
        interview,
        candidate=candidate,
        opening=opening,
        interviewer_meta=interviewer_meta,
        interview_status=status_lookup.get(candidate_interview_id),
    )


@router.patch("/interviews/{candidate_interview_id}", response_model=InterviewOut)
async def update_interview(
    candidate_interview_id: int,
    payload: InterviewUpdate,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.HIRING_MANAGER, Role.INTERVIEWER, Role.GROUP_LEAD])),
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
    interviewer_meta = (await _fetch_platform_people({interview.interviewer_person_id_platform or ""}, include_inactive=_is_superadmin(user))).get(
        _clean_platform_person_id(interview.interviewer_person_id_platform) or "", {}
    )
    status_lookup = await _load_interview_statuses(session, interview_ids=[candidate_interview_id])
    return _build_interview_out(
        interview,
        candidate=candidate,
        opening=opening,
        interviewer_meta=interviewer_meta,
        interview_status=status_lookup.get(candidate_interview_id),
    )


@router.post("/interviews/{candidate_interview_id}/status")
async def mark_interview_status(
    candidate_interview_id: int,
    payload: InterviewStatusPayload,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.HIRING_MANAGER, Role.INTERVIEWER, Role.GROUP_LEAD])),
):
    interview = await session.get(RecCandidateInterview, candidate_interview_id)
    if not interview:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found")
    _assert_interviewer_access(user, interview)

    status_value = (payload.status or "").strip().lower()
    if status_value not in {"taken", "not_taken"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Status must be 'taken' or 'not_taken'")

    already_marked = (
        await session.execute(
            select(func.count())
            .select_from(RecCandidateEvent)
            .where(
                RecCandidateEvent.candidate_id == interview.candidate_id,
                RecCandidateEvent.action_type == "interview_status_marked",
                RecCandidateEvent.related_entity_type == "interview",
                RecCandidateEvent.related_entity_id == candidate_interview_id,
            )
        )
    ).scalar_one_or_none()
    if already_marked:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Interview status already set")

    await log_event(
        session,
        candidate_id=interview.candidate_id,
        action_type="interview_status_marked",
        performed_by_person_id_platform=_platform_person_id_int(user),
        related_entity_type="interview",
        related_entity_id=candidate_interview_id,
        meta_json={
            "status": status_value,
            "round_type": interview.round_type,
            "performed_by_email": user.email,
        },
    )

    if status_value == "taken":
        to_stage = _round_to_feedback_stage(interview.round_type or "")
        candidate = await session.get(RecCandidate, interview.candidate_id)
        if not candidate:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")
        current_stage = await _get_current_stage_name(session, candidate_id=interview.candidate_id)
        if current_stage != to_stage:
            await transition_stage(
                interview.candidate_id,
                StageTransitionRequest(to_stage=to_stage, decision="taken", note="interview_taken"),
                session,
                user,
            )
        else:
            await session.commit()
    else:
        await session.execute(
            delete(RecCandidateInterviewAssessment).where(
                RecCandidateInterviewAssessment.candidate_interview_id == candidate_interview_id,
                RecCandidateInterviewAssessment.status == "draft",
            )
        )
        await session.commit()

    return {"candidate_interview_id": candidate_interview_id, "status": status_value}
