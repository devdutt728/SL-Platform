from __future__ import annotations

from datetime import datetime
import html
from typing import Iterable

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.stage_machine import normalize_stage_name
from app.db.platform_session import PlatformSessionLocal
from app.models.candidate import RecCandidate
from app.models.candidate_offer import RecCandidateOffer
from app.models.candidate_sprint import RecCandidateSprint
from app.models.event import RecCandidateEvent
from app.models.interview import RecCandidateInterview
from app.models.opening import RecOpening
from app.models.platform_person import DimPerson
from app.models.sprint_template import RecSprintTemplate
from app.models.stage import RecCandidateStage
from app.services.email import send_email
from app.services.platform_identity import active_status_filter

_INTERNAL_STAGE_OWNERS = {
    "hr_screening": "HR team",
    "l2_shortlist": "L2 owner",
    "l2_interview": "L2 owner",
    "l2_feedback": "L2 owner",
    "sprint": "L2 reviewer",
    "l1_shortlist": "HR team",
    "l1_interview": "HR team",
    "l1_feedback": "HR team",
    "offer": "HR team",
    "joining_documents": "HR team",
}


def _normalize_email(value: str | None) -> str | None:
    email_value = (value or "").strip().lower()
    return email_value or None


def _unique_emails(*groups: Iterable[str | None]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for group in groups:
        for raw in group:
            email_value = _normalize_email(raw)
            if not email_value or email_value in seen:
                continue
            seen.add(email_value)
            out.append(email_value)
    return out


def _hr_recipients() -> list[str]:
    return _unique_emails([settings.gmail_sender_email or "hr@studiolotus.in"])


def _display_stage(stage_name: str | None) -> str:
    normalized = normalize_stage_name(stage_name)
    if not normalized:
        return "-"
    parts = normalized.split("_")
    rendered: list[str] = []
    for part in parts:
        token = part.upper() if part in {"l1", "l2", "hr"} else part.capitalize()
        rendered.append(token)
    return " ".join(rendered)


def _format_datetime(value: datetime | None) -> str:
    if not value:
        return "-"
    return value.strftime("%d %b %Y, %I:%M %p")


def _format_date_value(value: object | None) -> str:
    if value is None:
        return "-"
    if hasattr(value, "strftime"):
        try:
            return value.strftime("%d %b %Y")
        except Exception:
            return str(value)
    return str(value)


def _format_age_days(value: datetime | None) -> str:
    if not value:
        return "-"
    delta = datetime.utcnow() - value
    days = max(delta.days, 0)
    if days == 0:
        return "Today"
    return f"{days} day" if days == 1 else f"{days} days"


def _slugify_token(value: str | None) -> str:
    normalized = (value or "").strip().lower().replace(" ", "_").replace("-", "_")
    return normalized or "internal"


def _safe(value: object | None) -> str:
    text = "" if value is None else str(value)
    return html.escape(text, quote=True)


def _render_rows(rows: list[tuple[str, str]]) -> str:
    pieces: list[str] = []
    for index, (label, value) in enumerate(rows):
        if not label and not value:
            continue
        border_style = "" if index == 0 else "border-top:1px solid #e2e8f0;"
        pieces.append(
            "<tr>"
            f'<td style="padding:12px 16px;font-size:13px;color:#475569;{border_style}">{_safe(label)}</td>'
            f'<td style="padding:12px 16px;font-size:14px;font-weight:600;color:#0f172a;{border_style}">{_safe(value)}</td>'
            "</tr>"
        )
    return "".join(pieces)


def _render_paragraphs(lines: list[str]) -> str:
    clean_lines = [line for line in lines if (line or "").strip()]
    if not clean_lines:
        return ""
    return "".join(
        f'<p style="margin:0 0 10px 0;font-size:13px;line-height:1.6;color:#64748b;">{_safe(line)}</p>'
        for line in clean_lines
    )


async def _opening_title(session: AsyncSession, opening_id: int | None) -> str:
    if not opening_id:
        return "-"
    opening = await session.get(RecOpening, opening_id)
    return opening.title if opening and opening.title else "-"


async def _email_event_exists(
    session: AsyncSession,
    *,
    candidate_id: int,
    related_entity_type: str,
    related_entity_id: int | None,
    email_type: str,
) -> bool:
    count = (
        await session.execute(
            select(func.count())
            .select_from(RecCandidateEvent)
            .where(
                RecCandidateEvent.candidate_id == candidate_id,
                RecCandidateEvent.action_type == "email_sent",
                RecCandidateEvent.related_entity_type == related_entity_type,
                RecCandidateEvent.related_entity_id == related_entity_id,
                func.lower(func.coalesce(RecCandidateEvent.meta_json, "")).like(f'%\"email_type\":\"{email_type}\"%'),
            )
        )
    ).scalar_one()
    return bool(count)


async def _resolve_platform_person_email(person_id_platform: str | None) -> str | None:
    person_id = (person_id_platform or "").strip()
    if not person_id:
        return None
    try:
        async with PlatformSessionLocal() as platform_session:
            row = (
                await platform_session.execute(
                    select(DimPerson.email).where(
                        DimPerson.person_id == person_id,
                        active_status_filter(),
                    )
                )
            ).first()
            return _normalize_email(row[0] if row else None)
    except Exception:
        return None


async def _send_internal_email(
    session: AsyncSession,
    *,
    candidate: RecCandidate,
    to_emails: list[str],
    subject: str,
    email_type: str,
    related_entity_type: str = "candidate",
    related_entity_id: int | None = None,
    headline: str,
    intro: str,
    rows: list[tuple[str, str]],
    notes: list[str] | None = None,
    cc_emails: list[str] | None = None,
) -> dict[str, object]:
    return await send_email(
        session,
        candidate_id=candidate.candidate_id,
        to_emails=to_emails,
        cc_emails=cc_emails,
        subject=subject,
        template_name="internal_notification",
        context={
            "preheader": "Recruitment Workflow Update",
            "headline": _safe(headline),
            "intro": _safe(intro),
            "details_rows_html": _render_rows(rows),
            "notes_html": _render_paragraphs(notes or []),
        },
        email_type=email_type,
        related_entity_type=related_entity_type,
        related_entity_id=related_entity_id,
        meta_extra={"internal_notification": True},
    )


async def notify_candidate_ready_for_review(
    session: AsyncSession,
    *,
    candidate: RecCandidate,
    trigger_label: str,
    detail_note: str | None = None,
) -> None:
    opening_title = await _opening_title(session, candidate.opening_id)
    current_stage = await _current_stage_name(session, candidate_id=candidate.candidate_id)
    rows = [
        ("Candidate", candidate.full_name or candidate.email or f"Candidate {candidate.candidate_id}"),
        ("Candidate Code", candidate.candidate_code or f"SLR-{candidate.candidate_id:04d}"),
        ("Opening", opening_title),
        ("Current Stage", _display_stage(current_stage)),
        ("L2 Owner", candidate.l2_owner_email or "Not assigned"),
        ("Triggered By", trigger_label),
    ]
    hr_notes = [
        detail_note or "The candidate is ready for review in the recruitment portal.",
        "Please review the profile and proceed with the next action.",
    ]
    hr_recipients = _hr_recipients()
    if hr_recipients:
        await _send_internal_email(
            session,
            candidate=candidate,
            to_emails=hr_recipients,
            subject="Candidate ready for review",
            email_type=f"candidate_ready_hr_{_slugify_token(trigger_label)}",
            headline="Candidate ready for review",
            intro="A candidate has completed a required step and is ready for internal review.",
            rows=rows,
            notes=hr_notes,
        )

    l2_recipients = _unique_emails([candidate.l2_owner_email])
    if l2_recipients:
        await _send_internal_email(
            session,
            candidate=candidate,
            to_emails=l2_recipients,
            subject="Candidate ready for your review",
            email_type=f"candidate_ready_l2_{_slugify_token(trigger_label)}",
            headline="Candidate ready for your review",
            intro="A candidate assigned to you has completed the required step and is ready for review.",
            rows=rows,
            notes=[
                detail_note or "Please review the candidate profile in the recruitment portal.",
            ],
        )


async def notify_l2_owner_assigned(
    session: AsyncSession,
    *,
    candidate: RecCandidate,
    previous_owner_email: str | None,
    assigned_by_email: str | None,
) -> None:
    new_owner_email = _normalize_email(candidate.l2_owner_email)
    previous_owner_email = _normalize_email(previous_owner_email)
    if not new_owner_email or new_owner_email == previous_owner_email:
        return
    opening_title = await _opening_title(session, candidate.opening_id)
    rows = [
        ("Candidate", candidate.full_name or candidate.email or f"Candidate {candidate.candidate_id}"),
        ("Candidate Code", candidate.candidate_code or f"SLR-{candidate.candidate_id:04d}"),
        ("Opening", opening_title),
        ("Assigned L2 Owner", new_owner_email),
        ("Previous L2 Owner", previous_owner_email or "-"),
        ("Assigned By", assigned_by_email or "Recruitment team"),
    ]
    await _send_internal_email(
        session,
        candidate=candidate,
        to_emails=[new_owner_email],
        cc_emails=_hr_recipients(),
        subject="Candidate assigned to you for L2 review",
        email_type="l2_owner_assigned",
        headline="Candidate assigned for L2 review",
        intro="You have been assigned as the L2 owner for the candidate below.",
        rows=rows,
        notes=[
            "Please review the candidate in the recruitment portal and coordinate the next step.",
        ],
    )


async def notify_stage_handoff(
    session: AsyncSession,
    *,
    candidate: RecCandidate,
    from_stage: str | None,
    to_stage: str | None,
) -> None:
    normalized_to_stage = normalize_stage_name(to_stage)
    if normalized_to_stage not in {"l2_shortlist", "sprint", "l1_shortlist", "offer", "joining_documents"}:
        return

    opening_title = await _opening_title(session, candidate.opening_id)
    owner_label = _INTERNAL_STAGE_OWNERS.get(normalized_to_stage, "Assigned owner")
    rows = [
        ("Candidate", candidate.full_name or candidate.email or f"Candidate {candidate.candidate_id}"),
        ("Candidate Code", candidate.candidate_code or f"SLR-{candidate.candidate_id:04d}"),
        ("Opening", opening_title),
        ("Previous Stage", _display_stage(from_stage)),
        ("Current Stage", _display_stage(normalized_to_stage)),
        ("Next Owner", owner_label),
    ]

    to_emails = _hr_recipients()
    if normalized_to_stage in {"l2_shortlist", "sprint"}:
        to_emails = _unique_emails(_hr_recipients(), [candidate.l2_owner_email])
    if not to_emails:
        return

    notes_map = {
        "l2_shortlist": "The candidate has moved into the L2 shortlist stage. Please initiate the next review step.",
        "sprint": "The candidate has moved into the sprint stage. Please assign or review the sprint as required.",
        "l1_shortlist": "The candidate has moved into the L1 shortlist stage and is ready for the next internal step.",
        "offer": "The candidate is ready for offer-stage processing.",
        "joining_documents": "The candidate has moved to joining documents and is ready for document follow-up.",
    }
    await _send_internal_email(
        session,
        candidate=candidate,
        to_emails=to_emails,
        subject=f"Candidate moved to {_display_stage(normalized_to_stage)}",
        email_type=f"stage_handoff_{normalized_to_stage}",
        headline=f"Candidate moved to {_display_stage(normalized_to_stage)}",
        intro="A recruitment stage handoff has been completed in the portal.",
        rows=rows,
        notes=[notes_map.get(normalized_to_stage, "Please review the candidate in the recruitment portal.")],
    )


async def notify_interview_feedback_submitted(
    session: AsyncSession,
    *,
    candidate: RecCandidate,
    interview: RecCandidateInterview,
    decision: str | None,
    next_stage: str | None,
    submitted_by_email: str | None,
) -> None:
    if await _email_event_exists(
        session,
        candidate_id=candidate.candidate_id,
        related_entity_type="interview",
        related_entity_id=interview.candidate_interview_id,
        email_type="interview_feedback_internal",
    ):
        return
    opening_title = await _opening_title(session, candidate.opening_id)
    recipients = _unique_emails(_hr_recipients(), [candidate.l2_owner_email])
    if not recipients:
        return
    rows = [
        ("Candidate", candidate.full_name or candidate.email or f"Candidate {candidate.candidate_id}"),
        ("Candidate Code", candidate.candidate_code or f"SLR-{candidate.candidate_id:04d}"),
        ("Opening", opening_title),
        ("Interview Round", interview.round_type or "-"),
        ("Decision", (decision or "-").replace("_", " ").title()),
        ("Next Stage", _display_stage(next_stage)),
    ]
    notes = [
        f"Feedback was submitted by {submitted_by_email or 'the interviewer'}.",
        "Please review the recommendation and proceed with the next action in the recruitment portal.",
    ]
    if interview.notes_internal:
        notes.insert(1, f"Internal notes: {interview.notes_internal}")
    await _send_internal_email(
        session,
        candidate=candidate,
        to_emails=recipients,
        subject="Interview feedback submitted",
        email_type="interview_feedback_internal",
        related_entity_type="interview",
        related_entity_id=interview.candidate_interview_id,
        headline="Interview feedback submitted",
        intro="Interview feedback has been recorded for the candidate below.",
        rows=rows,
        notes=notes,
    )


async def notify_sprint_submission_received(
    session: AsyncSession,
    *,
    candidate: RecCandidate,
    sprint: RecCandidateSprint,
    template: RecSprintTemplate,
) -> None:
    if await _email_event_exists(
        session,
        candidate_id=candidate.candidate_id,
        related_entity_type="sprint",
        related_entity_id=sprint.candidate_sprint_id,
        email_type="sprint_submission_internal",
    ):
        return
    opening_title = await _opening_title(session, candidate.opening_id)
    reviewer_email = await _resolve_platform_person_email(sprint.reviewed_by_person_id_platform)
    recipients = _unique_emails([reviewer_email], [candidate.l2_owner_email], _hr_recipients())
    if not recipients:
        return
    rows = [
        ("Candidate", candidate.full_name or candidate.email or f"Candidate {candidate.candidate_id}"),
        ("Candidate Code", candidate.candidate_code or f"SLR-{candidate.candidate_id:04d}"),
        ("Opening", opening_title),
        ("Sprint", template.name or f"Sprint {sprint.candidate_sprint_id}"),
        ("Submitted At", _format_datetime(sprint.submitted_at)),
        ("Reviewer", reviewer_email or candidate.l2_owner_email or "Not assigned"),
    ]
    await _send_internal_email(
        session,
        candidate=candidate,
        to_emails=recipients,
        subject="Sprint submission received",
        email_type="sprint_submission_internal",
        related_entity_type="sprint",
        related_entity_id=sprint.candidate_sprint_id,
        headline="Sprint submission received",
        intro="A candidate has submitted the assigned sprint in the recruitment portal.",
        rows=rows,
        notes=[
            "Please review the submission and record the outcome in the portal.",
        ],
    )


async def notify_sprint_reviewed(
    session: AsyncSession,
    *,
    candidate: RecCandidate,
    sprint: RecCandidateSprint,
    template: RecSprintTemplate | None,
    reviewed_by_email: str | None,
    next_stage: str | None,
) -> None:
    if await _email_event_exists(
        session,
        candidate_id=candidate.candidate_id,
        related_entity_type="sprint",
        related_entity_id=sprint.candidate_sprint_id,
        email_type="sprint_review_internal",
    ):
        return
    opening_title = await _opening_title(session, candidate.opening_id)
    recipients = _unique_emails(_hr_recipients(), [candidate.l2_owner_email])
    if not recipients:
        return
    rows = [
        ("Candidate", candidate.full_name or candidate.email or f"Candidate {candidate.candidate_id}"),
        ("Candidate Code", candidate.candidate_code or f"SLR-{candidate.candidate_id:04d}"),
        ("Opening", opening_title),
        ("Sprint", (template.name if template else None) or f"Sprint {sprint.candidate_sprint_id}"),
        ("Decision", (sprint.decision or sprint.status or "-").replace("_", " ").title()),
        ("Next Stage", _display_stage(next_stage)),
    ]
    notes = [
        f"Sprint review was completed by {reviewed_by_email or 'the assigned reviewer'}.",
        "Please review the outcome and proceed with the next step in the portal.",
    ]
    if sprint.comments_internal:
        notes.insert(1, f"Internal comments: {sprint.comments_internal}")
    await _send_internal_email(
        session,
        candidate=candidate,
        to_emails=recipients,
        subject="Sprint review completed",
        email_type="sprint_review_internal",
        related_entity_type="sprint",
        related_entity_id=sprint.candidate_sprint_id,
        headline="Sprint review completed",
        intro="Sprint review has been recorded for the candidate below.",
        rows=rows,
        notes=notes,
    )


async def notify_offer_response_internal(
    session: AsyncSession,
    *,
    candidate: RecCandidate | None,
    offer: RecCandidateOffer,
    decision: str,
    reason: str | None,
) -> None:
    if not candidate:
        return
    opening_title = await _opening_title(session, candidate.opening_id or offer.opening_id)
    recipients = _unique_emails(_hr_recipients(), [candidate.l2_owner_email])
    if not recipients:
        return
    normalized_decision = (decision or "").strip().lower()
    decision_label = "Accepted" if normalized_decision == "accept" else "Declined"
    rows = [
        ("Candidate", candidate.full_name or candidate.email or f"Candidate {candidate.candidate_id}"),
        ("Candidate Code", candidate.candidate_code or f"SLR-{candidate.candidate_id:04d}"),
        ("Opening", opening_title),
        ("Decision", decision_label),
        ("Designation", offer.designation_title or "-"),
        ("Joining Date", _format_date_value(offer.joining_date)),
    ]
    notes = [
        "A candidate response has been recorded against the offer.",
        "Please review the offer record and continue the next step in the recruitment portal.",
    ]
    if reason:
        notes.insert(1, f"Candidate note: {reason}")
    await _send_internal_email(
        session,
        candidate=candidate,
        to_emails=recipients,
        subject=f"Offer {decision_label.lower()} by candidate",
        email_type=f"offer_response_{normalized_decision}",
        related_entity_type="offer",
        related_entity_id=offer.candidate_offer_id,
        headline=f"Offer {decision_label.lower()} by candidate",
        intro="A candidate has responded to the offer.",
        rows=rows,
        notes=notes,
    )


async def notify_stale_stage_internal(
    session: AsyncSession,
    *,
    candidate: RecCandidate,
    stage: RecCandidateStage,
) -> None:
    normalized_stage = normalize_stage_name(stage.stage_name)
    recipients: list[str]
    if normalized_stage in {"hr_screening", "l1_shortlist", "l1_interview", "l1_feedback", "offer", "joining_documents"}:
        recipients = _hr_recipients()
    elif normalized_stage in {"l2_shortlist", "l2_interview", "l2_feedback", "sprint"}:
        recipients = _unique_emails([candidate.l2_owner_email], _hr_recipients())
    else:
        recipients = _hr_recipients()
    if not recipients:
        return
    if await _email_event_exists(
        session,
        candidate_id=candidate.candidate_id,
        related_entity_type="stage",
        related_entity_id=stage.stage_id,
        email_type="stage_stale_internal",
    ):
        return
    opening_title = await _opening_title(session, candidate.opening_id)
    rows = [
        ("Candidate", candidate.full_name or candidate.email or f"Candidate {candidate.candidate_id}"),
        ("Candidate Code", candidate.candidate_code or f"SLR-{candidate.candidate_id:04d}"),
        ("Opening", opening_title),
        ("Pending Stage", _display_stage(stage.stage_name)),
        ("Started On", _format_datetime(stage.started_at)),
        ("Age", _format_age_days(stage.started_at)),
    ]
    owner_note = _INTERNAL_STAGE_OWNERS.get(normalized_stage, "Assigned owner")
    await _send_internal_email(
        session,
        candidate=candidate,
        to_emails=recipients,
        subject=f"Candidate pending in {_display_stage(stage.stage_name)}",
        email_type="stage_stale_internal",
        related_entity_type="stage",
        related_entity_id=stage.stage_id,
        headline=f"Candidate pending in {_display_stage(stage.stage_name)}",
        intro="A candidate has remained in the same stage beyond the configured SLA window.",
        rows=rows,
        notes=[
            f"Please review this case with the {owner_note.lower()} and update the next action in the portal.",
        ],
    )


async def _current_stage_name(session: AsyncSession, *, candidate_id: int) -> str | None:
    row = (
        await session.execute(
            select(RecCandidateStage.stage_name)
            .where(
                RecCandidateStage.candidate_id == candidate_id,
                RecCandidateStage.stage_status == "pending",
            )
            .order_by(RecCandidateStage.started_at.desc(), RecCandidateStage.stage_id.desc())
            .limit(1)
        )
    ).first()
    return row[0] if row else None
