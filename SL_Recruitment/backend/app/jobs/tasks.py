from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import func, select, exists, and_, or_

from app.core.config import settings
from app.db.platform_session import PlatformSessionLocal
from app.db.session import SessionLocal
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
from app.services.public_links import build_public_link
from app.services.events import log_event
from app.services.operation_queue import process_due_operations
from app.services.platform_identity import active_status_filter
from app.services.sprint_brief import render_sprint_brief_html


def _caf_link(token: str) -> str:
    return build_public_link(f"/caf/{token}")


def _sprint_link(token: str) -> str:
    return build_public_link(f"/sprint/{token}")


def _offer_link(token: str) -> str:
    base = (settings.public_app_origin or "").rstrip("/")
    base_path = (settings.public_app_base_path or "").strip()
    if base_path and not base_path.startswith("/"):
        base_path = f"/{base_path}"
    base_path = base_path.rstrip("/")
    path = f"{base_path}/offer/{token}" if base_path else f"/offer/{token}"
    return f"{base}{path}" if base else path


async def _event_exists(
    session,
    *,
    candidate_id: int,
    action_type: str,
    related_entity_type: str,
    related_entity_id: int | None,
) -> bool:
    count = (
        await session.execute(
            select(func.count())
            .select_from(RecCandidateEvent)
            .where(
                RecCandidateEvent.candidate_id == candidate_id,
                RecCandidateEvent.action_type == action_type,
                RecCandidateEvent.related_entity_type == related_entity_type,
                RecCandidateEvent.related_entity_id == related_entity_id,
            )
        )
    ).scalar_one()
    return bool(count)


async def _email_event_exists(
    session,
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
                func.lower(RecCandidateEvent.meta_json).like(f'%\"email_type\":\"{email_type}\"%'),
            )
        )
    ).scalar_one()
    return bool(count)


async def _interviewer_email(interviewer_person_id_platform: str | None) -> str | None:
    if not interviewer_person_id_platform:
        return None
    async with PlatformSessionLocal() as platform_session:
        row = (
            await platform_session.execute(
                select(DimPerson.email).where(
                    DimPerson.person_id == interviewer_person_id_platform,
                    active_status_filter(),
                )
            )
        ).first()
        return row[0] if row else None


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


async def run_caf_reminders() -> None:
    cutoff = datetime.utcnow() - timedelta(days=settings.caf_reminder_days)
    async with SessionLocal() as session:
        rows = (
            await session.execute(
                select(RecCandidate)
                .join(RecCandidateStage, RecCandidateStage.candidate_id == RecCandidate.candidate_id)
                .where(
                    RecCandidateStage.stage_status == "pending",
                    RecCandidateStage.stage_name.in_(["hr_screening", "caf"]),
                    RecCandidate.caf_submitted_at.is_(None),
                    RecCandidate.caf_sent_at.is_not(None),
                    RecCandidate.caf_sent_at <= cutoff,
                )
            )
        ).scalars().all()
        for candidate in rows:
            if not candidate.email or not candidate.caf_token:
                continue
            if await _email_event_exists(
                session,
                candidate_id=candidate.candidate_id,
                related_entity_type="candidate",
                related_entity_id=candidate.candidate_id,
                email_type="caf_reminder",
            ):
                continue
            await send_email(
                session,
                candidate_id=candidate.candidate_id,
                to_emails=[candidate.email],
                subject="Reminder: complete your candidate application form",
                template_name="caf_reminder",
                context={
                    "candidate_name": candidate.full_name,
                    "caf_link": _caf_link(candidate.caf_token),
                },
                email_type="caf_reminder",
                related_entity_type="candidate",
                related_entity_id=candidate.candidate_id,
                meta_extra={"caf_token": candidate.caf_token},
            )
        await session.commit()


async def run_interview_feedback_reminders() -> None:
    now = datetime.utcnow()
    primary_cutoff = now - timedelta(hours=settings.feedback_reminder_hours)
    escalation_cutoff = now - timedelta(hours=settings.feedback_escalation_hours)

    async with SessionLocal() as session:
        rows = (
            await session.execute(
                select(RecCandidateInterview, RecCandidate, RecOpening)
                .join(RecCandidate, RecCandidate.candidate_id == RecCandidateInterview.candidate_id)
                .outerjoin(RecOpening, RecOpening.opening_id == RecCandidate.opening_id)
                .where(
                    RecCandidateInterview.feedback_submitted.is_(False),
                    RecCandidateInterview.scheduled_end_at <= primary_cutoff,
                )
            )
        ).all()

        for interview, candidate, opening in rows:
            related_id = interview.candidate_interview_id
            if await _email_event_exists(
                session,
                candidate_id=candidate.candidate_id,
                related_entity_type="interview",
                related_entity_id=related_id,
                email_type="interview_feedback_reminder",
            ):
                continue
            interviewer_email = await _interviewer_email(interview.interviewer_person_id_platform)
            if not interviewer_email:
                continue
            cc = None
            escalation = interview.scheduled_end_at <= escalation_cutoff
            if escalation and settings.gmail_sender_email:
                cc = [settings.gmail_sender_email]
            await send_email(
                session,
                candidate_id=candidate.candidate_id,
                to_emails=[interviewer_email],
                cc_emails=cc,
                subject="Interview feedback reminder",
                template_name="interview_feedback_reminder",
                context={
                    "candidate_name": candidate.full_name,
                    "round_type": interview.round_type,
                    "opening_title": opening.title if opening else "",
                },
                email_type="interview_feedback_reminder",
                related_entity_type="interview",
                related_entity_id=related_id,
                meta_extra={
                    "interview_id": related_id,
                    "interviewer_email": interviewer_email,
                    "escalated": escalation,
                },
            )
        await session.commit()


async def run_interview_status_reminders() -> None:
    now = datetime.utcnow()
    cutoff = now - timedelta(minutes=settings.interview_status_reminder_minutes)

    async with SessionLocal() as session:
        status_event_exists = (
            select(RecCandidateEvent.candidate_event_id)
            .where(
                RecCandidateEvent.related_entity_type == "interview",
                RecCandidateEvent.related_entity_id == RecCandidateInterview.candidate_interview_id,
                RecCandidateEvent.action_type == "interview_status_marked",
            )
            .limit(1)
        )
        rows = (
            await session.execute(
                select(RecCandidateInterview, RecCandidate, RecOpening)
                .join(RecCandidate, RecCandidate.candidate_id == RecCandidateInterview.candidate_id)
                .outerjoin(RecOpening, RecOpening.opening_id == RecCandidate.opening_id)
                .where(
                    RecCandidateInterview.scheduled_end_at <= cutoff,
                    _active_interview_filter(),
                    ~exists(status_event_exists),
                )
            )
        ).all()

        for interview, candidate, opening in rows:
            related_id = interview.candidate_interview_id
            if await _email_event_exists(
                session,
                candidate_id=candidate.candidate_id,
                related_entity_type="interview",
                related_entity_id=related_id,
                email_type="interview_status_elapsed",
            ):
                continue
            interviewer_email = await _interviewer_email(interview.interviewer_person_id_platform)
            if not interviewer_email:
                continue
            await send_email(
                session,
                candidate_id=candidate.candidate_id,
                to_emails=[interviewer_email],
                subject="Interview status pending",
                template_name="interview_status_elapsed",
                context={
                    "candidate_name": candidate.full_name,
                    "round_type": interview.round_type,
                    "opening_title": opening.title if opening else "",
                },
                email_type="interview_status_elapsed",
                related_entity_type="interview",
                related_entity_id=related_id,
                meta_extra={
                    "interview_id": related_id,
                    "interviewer_email": interviewer_email,
                },
            )
        await session.commit()


async def run_sprint_reminders() -> None:
    now = datetime.utcnow()
    due_soon = now + timedelta(hours=settings.sprint_reminder_hours)
    overdue_cutoff = now - timedelta(days=settings.sprint_overdue_days)

    async with SessionLocal() as session:
        assigned_rows = (
            await session.execute(
                select(RecCandidateSprint, RecCandidate, RecSprintTemplate, RecOpening)
                .join(RecCandidate, RecCandidate.candidate_id == RecCandidateSprint.candidate_id)
                .join(RecSprintTemplate, RecSprintTemplate.sprint_template_id == RecCandidateSprint.sprint_template_id)
                .outerjoin(RecOpening, RecOpening.opening_id == RecCandidate.opening_id)
                .where(
                    RecCandidateSprint.status == "assigned",
                    RecCandidateSprint.due_at.is_not(None),
                    RecCandidateSprint.due_at <= due_soon,
                    RecCandidateSprint.due_at >= now,
                )
            )
        ).all()
        for sprint, candidate, template, opening in assigned_rows:
            if not candidate.email:
                continue
            if await _email_event_exists(
                session,
                candidate_id=candidate.candidate_id,
                related_entity_type="sprint",
                related_entity_id=sprint.candidate_sprint_id,
                email_type="sprint_reminder",
            ):
                continue
            await send_email(
                session,
                candidate_id=candidate.candidate_id,
                to_emails=[candidate.email],
                subject="Sprint assignment reminder",
                template_name="sprint_reminder",
                context={
                    "candidate_name": candidate.full_name,
                    "sprint_name": template.name,
                    "due_at": sprint.due_at,
                    "sprint_link": _sprint_link(sprint.public_token),
                    "opening_title": opening.title if opening else "",
                },
                email_type="sprint_reminder",
                related_entity_type="sprint",
                related_entity_id=sprint.candidate_sprint_id,
                meta_extra={"sprint_id": sprint.candidate_sprint_id},
            )

        overdue_rows = (
            await session.execute(
                select(RecCandidateSprint, RecCandidate, RecSprintTemplate, RecOpening)
                .join(RecCandidate, RecCandidate.candidate_id == RecCandidateSprint.candidate_id)
                .join(RecSprintTemplate, RecSprintTemplate.sprint_template_id == RecCandidateSprint.sprint_template_id)
                .outerjoin(RecOpening, RecOpening.opening_id == RecCandidate.opening_id)
                .where(
                    RecCandidateSprint.status == "assigned",
                    RecCandidateSprint.due_at.is_not(None),
                    RecCandidateSprint.due_at <= overdue_cutoff,
                )
            )
        ).all()
        for sprint, candidate, template, opening in overdue_rows:
            if not candidate.email:
                continue
            if await _email_event_exists(
                session,
                candidate_id=candidate.candidate_id,
                related_entity_type="sprint",
                related_entity_id=sprint.candidate_sprint_id,
                email_type="sprint_overdue",
            ):
                continue
            await send_email(
                session,
                candidate_id=candidate.candidate_id,
                to_emails=[candidate.email],
                subject="Sprint overdue follow-up",
                template_name="sprint_overdue",
                context={
                    "candidate_name": candidate.full_name,
                    "sprint_name": template.name,
                    "sprint_link": _sprint_link(sprint.public_token),
                    "opening_title": opening.title if opening else "",
                },
                email_type="sprint_overdue",
                related_entity_type="sprint",
                related_entity_id=sprint.candidate_sprint_id,
                meta_extra={"sprint_id": sprint.candidate_sprint_id},
            )
        await session.commit()


async def run_offer_followups() -> None:
    cutoff = datetime.utcnow() - timedelta(days=settings.offer_followup_days)
    async with SessionLocal() as session:
        rows = (
            await session.execute(
                select(RecCandidateOffer, RecCandidate, RecOpening)
                .join(RecCandidate, RecCandidate.candidate_id == RecCandidateOffer.candidate_id)
                .outerjoin(RecOpening, RecOpening.opening_id == RecCandidateOffer.opening_id)
                .where(
                    RecCandidateOffer.offer_status == "sent",
                    RecCandidateOffer.sent_at.is_not(None),
                    RecCandidateOffer.sent_at <= cutoff,
                )
            )
        ).all()
        for offer, candidate, opening in rows:
            if not candidate.email:
                continue
            if not offer.public_token:
                continue
            if await _email_event_exists(
                session,
                candidate_id=candidate.candidate_id,
                related_entity_type="offer",
                related_entity_id=offer.candidate_offer_id,
                email_type="offer_followup",
            ):
                continue
            await send_email(
                session,
                candidate_id=candidate.candidate_id,
                to_emails=[candidate.email],
                subject="Offer follow-up",
                template_name="offer_followup",
                context={
                    "candidate_name": candidate.full_name,
                    "offer_link": _offer_link(offer.public_token),
                    "opening_title": opening.title if opening else "",
                    "joining_date": offer.joining_date,
                },
                email_type="offer_followup",
                related_entity_type="offer",
                related_entity_id=offer.candidate_offer_id,
                meta_extra={"offer_id": offer.candidate_offer_id},
            )
        await session.commit()


async def run_stale_stage_sweep() -> None:
    cutoff = datetime.utcnow() - timedelta(days=settings.stale_stage_days)
    async with SessionLocal() as session:
        rows = (
            await session.execute(
                select(RecCandidateStage, RecCandidate)
                .join(RecCandidate, RecCandidate.candidate_id == RecCandidateStage.candidate_id)
                .where(
                    RecCandidateStage.stage_status == "pending",
                    RecCandidateStage.started_at <= cutoff,
                )
            )
        ).all()
        for stage, candidate in rows:
            action_type = "candidate_stale"
            if await _event_exists(
                session,
                candidate_id=candidate.candidate_id,
                action_type=action_type,
                related_entity_type="stage",
                related_entity_id=stage.stage_id,
            ):
                continue
            await log_event(
                session,
                candidate_id=candidate.candidate_id,
                action_type=action_type,
                related_entity_type="stage",
                related_entity_id=stage.stage_id,
                meta_json={"stage": stage.stage_name, "started_at": stage.started_at.isoformat()},
            )
        await session.commit()


async def run_operation_retries() -> None:
    async with SessionLocal() as session:
        await process_due_operations(session, limit=50)
