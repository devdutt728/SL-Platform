from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.platform_session import PlatformSessionLocal
from app.models.candidate import RecCandidate
from app.models.candidate_offer import RecCandidateOffer
from app.models.opening import RecOpening
from app.models.platform_person import DimPerson
from app.models.stage import RecCandidateStage
from app.schemas.user import UserContext
from app.services.drive import move_candidate_folder
from app.services.events import log_event


def _platform_person_id(user: UserContext) -> int | None:
    raw = (user.person_id_platform or "").strip()
    if not raw:
        return None
    try:
        return int(raw)
    except Exception:
        return None


def _event_meta(user: UserContext, extra: dict[str, Any] | None = None) -> dict[str, Any]:
    meta = {
        "performed_by_email": user.email,
        "performed_by_name": user.full_name,
    }
    if extra:
        meta.update(extra)
    return meta


async def _transition_stage(session: AsyncSession, *, candidate_id: int, to_stage: str, user: UserContext | None = None) -> None:
    now = datetime.utcnow()
    current = (
        await session.execute(
            select(RecCandidateStage)
            .where(RecCandidateStage.candidate_id == candidate_id, RecCandidateStage.stage_status == "pending")
            .order_by(RecCandidateStage.started_at.desc(), RecCandidateStage.stage_id.desc())
            .limit(1)
        )
    ).scalars().first()
    from_stage = None
    if current:
        from_stage = current.stage_name
        current.stage_status = "completed"
        current.ended_at = now
    session.add(
        RecCandidateStage(
            candidate_id=candidate_id,
            stage_name=to_stage,
            stage_status="pending",
            started_at=now,
            created_at=now,
        )
    )
    await log_event(
        session,
        candidate_id=candidate_id,
        action_type="stage_change",
        performed_by_person_id_platform=_platform_person_id(user) if user else None,
        related_entity_type="candidate",
        related_entity_id=candidate_id,
        from_status=from_stage,
        to_status=to_stage,
        meta_json={"from_stage": from_stage, "to_stage": to_stage, "reason": "offer_flow"},
    )


async def create_offer(session: AsyncSession, *, candidate: RecCandidate, opening: RecOpening | None, payload: dict[str, Any], user: UserContext) -> RecCandidateOffer:
    now = datetime.utcnow()
    offer = RecCandidateOffer(
        candidate_id=candidate.candidate_id,
        opening_id=candidate.opening_id,
        offer_template_code=payload["offer_template_code"],
        offer_version=1,
        gross_ctc_annual=payload.get("gross_ctc_annual"),
        fixed_ctc_annual=payload.get("fixed_ctc_annual"),
        variable_ctc_annual=payload.get("variable_ctc_annual"),
        currency=payload.get("currency") or "INR",
        designation_title=payload.get("designation_title") or (opening.title if opening else None),
        grade_id_platform=payload.get("grade_id_platform"),
        joining_date=payload.get("joining_date"),
        probation_months=payload.get("probation_months"),
        offer_valid_until=payload.get("offer_valid_until"),
        offer_status="draft",
        public_token=uuid4().hex,
        generated_by_person_id_platform=_platform_person_id(user),
        generated_at=now,
        notes_internal=payload.get("notes_internal"),
        created_at=now,
        updated_at=now,
    )
    session.add(offer)
    await session.flush()
    await log_event(
        session,
        candidate_id=candidate.candidate_id,
        action_type="offer_draft_created",
        performed_by_person_id_platform=_platform_person_id(user),
        related_entity_type="offer",
        related_entity_id=offer.candidate_offer_id,
        meta_json=_event_meta(user, {"offer_id": offer.candidate_offer_id, "template_code": offer.offer_template_code}),
    )
    return offer


async def update_offer_details(session: AsyncSession, *, offer: RecCandidateOffer, payload: dict[str, Any], user: UserContext) -> RecCandidateOffer:
    if offer.offer_status != "draft":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only draft offers can be edited.")
    for key, value in payload.items():
        if hasattr(offer, key) and value is not None:
            setattr(offer, key, value)
    offer.updated_at = datetime.utcnow()
    await log_event(
        session,
        candidate_id=offer.candidate_id,
        action_type="offer_updated",
        performed_by_person_id_platform=_platform_person_id(user),
        related_entity_type="offer",
        related_entity_id=offer.candidate_offer_id,
        meta_json=_event_meta(user, {"offer_id": offer.candidate_offer_id}),
    )
    return offer


async def submit_for_approval(session: AsyncSession, *, offer: RecCandidateOffer, user: UserContext) -> RecCandidateOffer:
    if offer.offer_status != "draft":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only draft offers can be submitted.")
    offer.offer_status = "pending_approval"
    offer.updated_at = datetime.utcnow()
    await log_event(
        session,
        candidate_id=offer.candidate_id,
        action_type="offer_submitted_for_approval",
        performed_by_person_id_platform=_platform_person_id(user),
        related_entity_type="offer",
        related_entity_id=offer.candidate_offer_id,
        meta_json=_event_meta(user, {"offer_id": offer.candidate_offer_id}),
    )
    return offer


async def approve_offer(session: AsyncSession, *, offer: RecCandidateOffer, user: UserContext) -> RecCandidateOffer:
    if offer.offer_status != "pending_approval":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Offer is not pending approval.")
    now = datetime.utcnow()
    offer.offer_status = "approved"
    offer.approved_by_person_id_platform = _platform_person_id(user)
    offer.approved_at = now
    offer.updated_at = now
    await log_event(
        session,
        candidate_id=offer.candidate_id,
        action_type="offer_approved",
        performed_by_person_id_platform=_platform_person_id(user),
        related_entity_type="offer",
        related_entity_id=offer.candidate_offer_id,
        meta_json=_event_meta(user, {"offer_id": offer.candidate_offer_id}),
    )
    return offer


async def reject_offer(session: AsyncSession, *, offer: RecCandidateOffer, user: UserContext, reason: str | None = None) -> RecCandidateOffer:
    if offer.offer_status not in {"pending_approval", "approved"}:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Offer is not pending approval.")
    offer.offer_status = "draft"
    offer.updated_at = datetime.utcnow()
    await log_event(
        session,
        candidate_id=offer.candidate_id,
        action_type="offer_rejected",
        performed_by_person_id_platform=_platform_person_id(user),
        related_entity_type="offer",
        related_entity_id=offer.candidate_offer_id,
        meta_json=_event_meta(user, {"offer_id": offer.candidate_offer_id, "reason": reason}),
    )
    return offer


async def send_offer(session: AsyncSession, *, offer: RecCandidateOffer, user: UserContext) -> RecCandidateOffer:
    if offer.offer_status != "approved":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Offer is not approved yet.")
    now = datetime.utcnow()
    if not offer.public_token:
        offer.public_token = uuid4().hex
    offer.offer_status = "sent"
    offer.sent_at = now
    offer.updated_at = now
    await log_event(
        session,
        candidate_id=offer.candidate_id,
        action_type="offer_sent",
        performed_by_person_id_platform=_platform_person_id(user),
        related_entity_type="offer",
        related_entity_id=offer.candidate_offer_id,
        meta_json=_event_meta(user, {"offer_id": offer.candidate_offer_id, "public_token": offer.public_token}),
    )
    return offer


async def record_candidate_response(session: AsyncSession, *, offer: RecCandidateOffer, decision: str, reason: str | None = None) -> RecCandidateOffer:
    now = datetime.utcnow()
    if offer.offer_status not in {"sent", "viewed"}:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Offer is not awaiting candidate response.")
    normalized = decision.strip().lower()
    if normalized not in {"accept", "decline"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Decision must be accept or decline.")
    if normalized == "accept":
        offer.offer_status = "accepted"
        offer.accepted_at = now
        action = "offer_accepted"
    else:
        offer.offer_status = "declined"
        offer.declined_at = now
        action = "offer_declined"
    offer.updated_at = now
    await log_event(
        session,
        candidate_id=offer.candidate_id,
        action_type=action,
        performed_by_person_id_platform=None,
        related_entity_type="offer",
        related_entity_id=offer.candidate_offer_id,
        meta_json={"offer_id": offer.candidate_offer_id, "reason": reason},
    )
    return offer


async def convert_candidate_to_employee(session: AsyncSession, *, candidate: RecCandidate, offer: RecCandidateOffer, user: UserContext) -> RecCandidate:
    if offer.offer_status != "accepted":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Offer must be accepted before conversion.")
    if candidate.joining_docs_status != "complete":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Joining documents are not complete.")

    person_id = f"REC_{candidate.candidate_id}"
    async with PlatformSessionLocal() as platform_session:
        existing = await platform_session.get(DimPerson, person_id)
        if not existing:
            person = DimPerson(
                person_id=person_id,
                person_code=candidate.candidate_code,
                email=candidate.email,
                first_name=candidate.first_name,
                last_name=candidate.last_name,
                full_name=candidate.full_name,
                display_name=candidate.full_name,
                role_id=offer.grade_id_platform,
                mobile_number=candidate.phone,
                status="working",
                is_deleted=0,
            )
            platform_session.add(person)
            await platform_session.commit()

    candidate.hired_person_id_platform = int("".join(filter(str.isdigit, person_id)) or candidate.candidate_id)
    candidate.final_decision = "hired"
    candidate.status = "hired"
    candidate.updated_at = datetime.utcnow()

    await _transition_stage(session, candidate_id=candidate.candidate_id, to_stage="hired", user=user)

    if candidate.drive_folder_id:
        try:
            move_candidate_folder(candidate.drive_folder_id, "Appointed")
            await log_event(
                session,
                candidate_id=candidate.candidate_id,
                action_type="drive_folder_moved",
                performed_by_person_id_platform=_platform_person_id(user),
                related_entity_type="candidate",
                related_entity_id=candidate.candidate_id,
                meta_json=_event_meta(user, {"bucket": "Appointed"}),
            )
        except Exception:
            # Best-effort move
            pass

    await log_event(
        session,
        candidate_id=candidate.candidate_id,
        action_type="candidate_converted_to_employee",
        performed_by_person_id_platform=_platform_person_id(user),
        related_entity_type="candidate",
        related_entity_id=candidate.candidate_id,
        meta_json=_event_meta(user, {"person_id_platform": person_id}),
    )
    return candidate
