from __future__ import annotations

from datetime import datetime, timedelta
from uuid import uuid4
import json
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from pydantic import BaseModel
from urllib.parse import urlparse, parse_qs
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core.auth import require_roles, require_superadmin
from app.core.config import settings
from app.core.roles import Role
from app.models.candidate import RecCandidate
from app.models.event import RecCandidateEvent
from app.models.candidate_offer import RecCandidateOffer
from app.models.opening import RecOpening
from app.schemas.offer import (
    OfferApprovalDecisionIn,
    OfferApprovalPublicOut,
    OfferCreateIn,
    OfferDecisionIn,
    OfferOut,
    OfferPublicOut,
    OfferUpdateIn,
)
from app.schemas.user import UserContext
from app.services.offers import (
    approve_offer,
    convert_candidate_to_employee,
    create_offer,
    create_offer_revision,
    is_principal_approver_email,
    normalize_principal_email,
    offer_approval_public_link,
    principal_decide_offer,
    record_candidate_response,
    reject_offer,
    _resolve_candidate_address,
    _resolve_reporting_to,
    _ensure_offer_pdf,
    _offer_public_link,
    _offer_public_pdf_link,
    offer_pdf_signed_url,
    joining_public_signed_url,
    submit_for_approval_with_principal,
    verify_offer_pdf_signature,
    verify_offer_view_signature,
    render_offer_letter,
    _render_offer_pdf_bytes,
    send_offer,
    update_offer_details,
)
from app.services.events import log_event
from app.services.drive import delete_drive_item, download_drive_file, upload_offer_doc
from app.services.email import render_template, send_email
from app.services.internal_notifications import notify_offer_response_internal
from app.services.operation_queue import OP_DRIVE_DELETE_ITEM, enqueue_operation

router = APIRouter(prefix="/rec/offers", tags=["offers"])
public_router = APIRouter(prefix="/offer", tags=["offers-public"])
approval_public_router = APIRouter(prefix="/offer-approval", tags=["offers-public"])


async def _ensure_public_token(session: AsyncSession, offer: RecCandidateOffer) -> None:
    if offer.public_token:
        return
    offer.public_token = uuid4().hex
    offer.updated_at = datetime.utcnow()
    await session.flush()


def _extract_drive_file_id(raw_url: str | None) -> str | None:
    if not raw_url:
        return None
    try:
        parsed = urlparse(raw_url)
        if parsed.query:
            query = parse_qs(parsed.query)
            if "id" in query and query["id"]:
                return query["id"][0]
        parts = parsed.path.split("/")
        if "d" in parts:
            idx = parts.index("d")
            if idx + 1 < len(parts):
                return parts[idx + 1]
    except Exception:
        return None
    return None


def _decode_letter_overrides(raw: str | None) -> dict[str, str] | None:
    if not raw:
        return None
    try:
        data = json.loads(raw)
    except Exception:
        return None
    if not isinstance(data, dict):
        return None
    cleaned: dict[str, str] = {}
    for key, value in data.items():
        if not isinstance(key, str):
            continue
        if value is None:
            continue
        cleaned[key] = str(value)
    return cleaned or None


def _safe_person_id(raw: str | None) -> int | None:
    if not raw:
        return None
    try:
        return int(raw)
    except Exception:
        return None


class OfferRevisionIn(BaseModel):
    reason: str | None = None


class OfferJoiningLinkResendOut(BaseModel):
    candidate_offer_id: int
    candidate_id: int
    public_token: str
    joining_link: str
    email_status: str
    email_error: str | None = None


def _request_ip(request: Request) -> str | None:
    forwarded = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    if forwarded:
        return forwarded
    real_ip = (request.headers.get("x-real-ip") or "").strip()
    if real_ip:
        return real_ip
    return request.client.host if request.client else None


def _hr_notification_recipients() -> list[str]:
    hr_email = normalize_principal_email(settings.gmail_sender_email) or "hr@studiolotus.in"
    return [hr_email]


def _system_offer_user() -> UserContext:
    hr_email = normalize_principal_email(settings.gmail_sender_email) or "hr@studiolotus.in"
    return UserContext(
        user_id="system_offer_flow",
        email=hr_email,
        roles=[Role.HR_ADMIN],
        full_name="Studio Lotus Recruitment System",
    )


def _offer_base_payload(offer: RecCandidateOffer) -> dict:
    data = OfferOut.model_validate(offer).model_dump()
    data.pop("candidate_name", None)
    data.pop("candidate_code", None)
    data.pop("opening_title", None)
    data.pop("letter_overrides", None)
    data.pop("pdf_download_url", None)
    return data


def _joining_public_link(token: str) -> str:
    return joining_public_signed_url(token)


def _format_human_date(value) -> str:
    if not value:
        return "-"
    try:
        return value.strftime("%d %b %Y")
    except Exception:
        return str(value)


def _joining_docs_due_date(offer: RecCandidateOffer) -> str:
    # Keep a practical default while still honoring joining date when it is sufficiently in the future.
    base_due = datetime.utcnow().date() + timedelta(days=3)
    joining_date = offer.joining_date
    if joining_date:
        target_due = joining_date - timedelta(days=3)
        if target_due > base_due:
            return _format_human_date(target_due)
    return _format_human_date(base_due)


async def _joining_docs_email_already_sent(session: AsyncSession, *, offer: RecCandidateOffer) -> bool:
    count = (
        await session.execute(
            select(func.count())
            .select_from(RecCandidateEvent)
            .where(
                RecCandidateEvent.candidate_id == offer.candidate_id,
                RecCandidateEvent.action_type == "email_sent",
                RecCandidateEvent.related_entity_type == "offer",
                RecCandidateEvent.related_entity_id == offer.candidate_offer_id,
                func.lower(func.coalesce(RecCandidateEvent.meta_json, "")).like('%"email_type":"joining_documents_request"%'),
            )
        )
    ).scalar_one()
    return bool(count)


async def _send_joining_documents_request_email(
    session: AsyncSession,
    *,
    offer: RecCandidateOffer,
    candidate: RecCandidate | None,
    opening: RecOpening | None,
    force_resend: bool = False,
) -> dict[str, object]:
    if not candidate or not candidate.email:
        return {"status": "skipped", "reason": "missing_recipient"}
    if not force_resend and await _joining_docs_email_already_sent(session, offer=offer):
        return {"status": "skipped", "reason": "already_sent"}

    joining_link = _joining_public_link(offer.public_token)
    subject = "Updated joining documents link" if force_resend else "Joining documents required"
    email_type = "joining_documents_request_resend" if force_resend else "joining_documents_request"
    email_meta = await send_email(
        session,
        candidate_id=candidate.candidate_id,
        to_emails=[candidate.email],
        subject=subject,
        template_name="joining_documents_request",
        context={
            "candidate_name": candidate.full_name or candidate.first_name or "",
            "opening_title": opening.title if opening else (offer.designation_title or ""),
            "designation_title": offer.designation_title or (opening.title if opening else ""),
            "joining_date": _format_human_date(offer.joining_date),
            "due_date": _joining_docs_due_date(offer),
            "joining_link": joining_link,
            "sender_name": "Studio Lotus Recruitment Team",
        },
        email_type=email_type,
        related_entity_type="offer",
        related_entity_id=offer.candidate_offer_id,
        meta_extra={
            "offer_id": offer.candidate_offer_id,
            "joining_link": joining_link,
            "force_resend": force_resend,
        },
    )
    return {
        "status": email_meta.get("status") or "unknown",
        "error": email_meta.get("error"),
        "joining_link": joining_link,
    }


async def _send_offer_decline_revision_email_to_hr(
    session: AsyncSession,
    *,
    source_offer: RecCandidateOffer,
    revised_offer: RecCandidateOffer,
    candidate: RecCandidate | None,
    opening: RecOpening | None,
    decision_reason: str | None = None,
) -> None:
    await send_email(
        session,
        candidate_id=source_offer.candidate_id,
        to_emails=_hr_notification_recipients(),
        subject=f"Offer declined: revision v{revised_offer.offer_version} created for {candidate.full_name if candidate else 'Candidate'}",
        template_name="offer_decline_revision_hr",
        context={
            "candidate_name": candidate.full_name if candidate else "",
            "candidate_code": candidate.candidate_code if candidate else "",
            "opening_title": opening.title if opening else "",
            "designation_title": source_offer.designation_title or "",
            "declined_offer_version": source_offer.offer_version,
            "revised_offer_version": revised_offer.offer_version,
            "decision_reason": (decision_reason or "").strip() or "-",
            "offer_link": _offer_public_link(revised_offer.public_token),
            "offer_file_url": offer_pdf_signed_url(revised_offer.public_token),
            "sender_name": "Studio Lotus Recruitment Team",
        },
        email_type="offer_decline_revision_hr",
        related_entity_type="offer",
        related_entity_id=revised_offer.candidate_offer_id,
        meta_extra={
            "offer_id": revised_offer.candidate_offer_id,
            "source_offer_id": source_offer.candidate_offer_id,
            "source_offer_version": source_offer.offer_version,
            "revised_offer_version": revised_offer.offer_version,
        },
    )


async def _auto_recreate_offer_on_decline(
    session: AsyncSession,
    *,
    source_offer: RecCandidateOffer,
    acting_user: UserContext | None,
    decision_reason: str | None = None,
    source: str = "offer_decision",
) -> RecCandidateOffer | None:
    candidate = await session.get(RecCandidate, source_offer.candidate_id)
    if not candidate:
        return None
    opening = await session.get(RecOpening, source_offer.opening_id) if source_offer.opening_id else None
    revision_user = acting_user or _system_offer_user()
    try:
        revised = await create_offer_revision(
            session,
            source_offer=source_offer,
            candidate=candidate,
            opening=opening,
            user=revision_user,
            revision_reason=(decision_reason or "").strip() or "Candidate declined the offer.",
        )
    except Exception as exc:  # noqa: BLE001
        await log_event(
            session,
            candidate_id=source_offer.candidate_id,
            action_type="offer_decline_revision_create_failed",
            performed_by_person_id_platform=_safe_person_id((acting_user.person_id_platform if acting_user else None)),
            related_entity_type="offer",
            related_entity_id=source_offer.candidate_offer_id,
            meta_json={
                "source": source,
                "source_offer_id": source_offer.candidate_offer_id,
                "error": str(exc),
            },
        )
        return None
    try:
        await _send_offer_decline_revision_email_to_hr(
            session,
            source_offer=source_offer,
            revised_offer=revised,
            candidate=candidate,
            opening=opening,
            decision_reason=decision_reason,
        )
    except Exception as exc:  # noqa: BLE001
        await log_event(
            session,
            candidate_id=source_offer.candidate_id,
            action_type="offer_decline_revision_email_failed",
            performed_by_person_id_platform=None,
            related_entity_type="offer",
            related_entity_id=revised.candidate_offer_id,
            meta_json={
                "source": source,
                "source_offer_id": source_offer.candidate_offer_id,
                "revised_offer_id": revised.candidate_offer_id,
                "error": str(exc),
            },
        )
    return revised


@router.get("", response_model=list[OfferOut])
async def list_offers(
    status_filter: list[str] | None = Query(default=None, alias="status"),
    session: AsyncSession = Depends(deps.get_db_session),
    _user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC])),
):
    query = (
        select(
            RecCandidateOffer,
            RecCandidate.full_name.label("candidate_name"),
            RecCandidate.candidate_code.label("candidate_code"),
            RecOpening.title.label("opening_title"),
        )
        .select_from(RecCandidateOffer)
        .outerjoin(RecCandidate, RecCandidate.candidate_id == RecCandidateOffer.candidate_id)
        .outerjoin(RecOpening, RecOpening.opening_id == RecCandidateOffer.opening_id)
        .order_by(RecCandidateOffer.updated_at.desc(), RecCandidateOffer.candidate_offer_id.desc())
    )
    if status_filter:
        normalized_statuses: set[str] = set()
        for raw in status_filter:
            for piece in str(raw or "").split(","):
                cleaned = piece.strip().lower()
                if not cleaned:
                    continue
                if cleaned == "awaiting_response":
                    normalized_statuses.update({"sent", "viewed"})
                    continue
                normalized_statuses.add(cleaned)
        if normalized_statuses:
            query = query.where(RecCandidateOffer.offer_status.in_(sorted(normalized_statuses)))
    rows = (await session.execute(query)).all()
    out: list[OfferOut] = []
    updated = False
    for row in rows:
        offer = row[0]
        if not offer.public_token:
            await _ensure_public_token(session, offer)
            updated = True
        out.append(
            OfferOut(
                **_offer_base_payload(offer),
                candidate_name=row[1],
                candidate_code=row[2],
                opening_title=row[3],
                pdf_download_url=offer_pdf_signed_url(offer.public_token),
                letter_overrides=_decode_letter_overrides(offer.offer_letter_overrides),
            )
        )
    if updated:
        await session.commit()
    return out


@router.get("/{offer_id}", response_model=OfferOut)
async def get_offer(
    offer_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    _user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC])),
):
    row = (
        await session.execute(
            select(
                RecCandidateOffer,
                RecCandidate.full_name.label("candidate_name"),
                RecCandidate.candidate_code.label("candidate_code"),
                RecOpening.title.label("opening_title"),
            )
            .select_from(RecCandidateOffer)
            .outerjoin(RecCandidate, RecCandidate.candidate_id == RecCandidateOffer.candidate_id)
            .outerjoin(RecOpening, RecOpening.opening_id == RecCandidateOffer.opening_id)
            .where(RecCandidateOffer.candidate_offer_id == offer_id)
        )
    ).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found")
    offer = row[0]
    if not offer.public_token:
        await _ensure_public_token(session, offer)
        await session.commit()
    return OfferOut(
        **_offer_base_payload(offer),
        candidate_name=row[1],
        candidate_code=row[2],
        opening_title=row[3],
        pdf_download_url=offer_pdf_signed_url(offer.public_token),
        letter_overrides=_decode_letter_overrides(offer.offer_letter_overrides),
    )


@router.patch("/{offer_id}", response_model=OfferOut)
async def update_offer(
    offer_id: int,
    payload: OfferUpdateIn,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC])),
):
    offer = await session.get(RecCandidateOffer, offer_id)
    if not offer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found")
    updates = payload.model_dump(exclude_none=True)
    submit = updates.pop("submit_for_approval", None)
    approval_principal_email = updates.pop("approval_principal_email", None)
    if updates:
        await update_offer_details(session, offer=offer, payload=updates, user=user)
    if submit:
        if not approval_principal_email:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Select a principal approver email.")
        await submit_for_approval_with_principal(
            session,
            offer=offer,
            user=user,
            approval_principal_email=approval_principal_email,
        )
        candidate = await session.get(RecCandidate, offer.candidate_id)
        opening = await session.get(RecOpening, offer.opening_id) if offer.opening_id else None
        principal_email = normalize_principal_email(offer.approval_principal_email)
        approval_link = offer_approval_public_link(offer.approval_request_token or "")
        await send_email(
            session,
            candidate_id=offer.candidate_id,
            to_emails=[principal_email] if principal_email else [],
            subject=f"Offer approval request for {candidate.full_name if candidate else 'Candidate'}",
            template_name="offer_approval_request_principal",
            context={
                "principal_email": principal_email or "",
                "candidate_name": candidate.full_name if candidate else "",
                "candidate_code": candidate.candidate_code if candidate else "",
                "opening_title": opening.title if opening else "",
                "designation_title": offer.designation_title or "",
                "joining_date": offer.joining_date or "",
                "offer_valid_until": offer.offer_valid_until or "",
                "offer_ctc": offer.gross_ctc_annual or "",
                "offer_currency": offer.currency or "INR",
                "approval_link": approval_link,
                "offer_file_url": offer_pdf_signed_url(offer.public_token),
                "sender_name": "Studio Lotus Recruitment Team",
            },
            email_type="offer_approval_request_principal",
            related_entity_type="offer",
            related_entity_id=offer.candidate_offer_id,
            meta_extra={
                "offer_id": offer.candidate_offer_id,
                "approval_principal_email": principal_email,
            },
        )
    await session.commit()
    await session.refresh(offer)
    return OfferOut(
        **_offer_base_payload(offer),
        letter_overrides=_decode_letter_overrides(offer.offer_letter_overrides),
    )


@router.delete("/{offer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_offer(
    offer_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_superadmin()),
):
    offer = await session.get(RecCandidateOffer, offer_id)
    if not offer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found")
    if offer.offer_status != "draft":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only draft offers can be deleted")
    file_id = _extract_drive_file_id(offer.pdf_url)
    if file_id:
        try:
            deleted = delete_drive_item(file_id)
            if not deleted:
                raise RuntimeError("delete_drive_item returned false")
        except Exception as exc:  # noqa: BLE001
            await log_event(
                session,
                candidate_id=offer.candidate_id,
                action_type="drive_file_delete_failed",
                performed_by_person_id_platform=_safe_person_id(user.person_id_platform),
                related_entity_type="offer",
                related_entity_id=offer.candidate_offer_id,
                meta_json={
                    "file_id": file_id,
                    "error": str(exc),
                },
            )
            await enqueue_operation(
                session,
                operation_type=OP_DRIVE_DELETE_ITEM,
                payload={"item_id": file_id},
                candidate_id=offer.candidate_id,
                related_entity_type="offer",
                related_entity_id=offer.candidate_offer_id,
                idempotency_key=f"drive_delete_offer_pdf:{offer.candidate_offer_id}:{file_id}",
            )
    await log_event(
        session,
        candidate_id=offer.candidate_id,
        action_type="offer_draft_deleted",
        performed_by_person_id_platform=_safe_person_id(user.person_id_platform),
        related_entity_type="offer",
        related_entity_id=offer.candidate_offer_id,
        meta_json={"offer_id": offer.candidate_offer_id},
    )
    await session.delete(offer)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{offer_id}/approve", response_model=OfferOut)
async def approve_offer_route(
    offer_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_superadmin()),
):
    offer = await session.get(RecCandidateOffer, offer_id)
    if not offer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found")
    await approve_offer(session, offer=offer, user=user)
    await session.commit()
    await session.refresh(offer)
    return OfferOut(
        **_offer_base_payload(offer),
        letter_overrides=_decode_letter_overrides(offer.offer_letter_overrides),
    )


@router.post("/{offer_id}/reject", response_model=OfferOut)
async def reject_offer_route(
    offer_id: int,
    payload: OfferDecisionIn | None = None,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_superadmin()),
):
    offer = await session.get(RecCandidateOffer, offer_id)
    if not offer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found")
    reason = payload.reason if payload else None
    await reject_offer(session, offer=offer, user=user, reason=reason)
    await session.commit()
    await session.refresh(offer)
    return OfferOut(
        **_offer_base_payload(offer),
        letter_overrides=_decode_letter_overrides(offer.offer_letter_overrides),
    )


@router.post("/{offer_id}/decision", response_model=OfferOut)
async def admin_offer_decision(
    offer_id: int,
    payload: OfferDecisionIn,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_superadmin()),
):
    offer = await session.get(RecCandidateOffer, offer_id)
    if not offer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found")
    if offer.offer_status not in {"approved", "sent", "viewed"}:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Offer is not ready for acceptance/decline.")
    await record_candidate_response(
        session,
        offer=offer,
        decision=payload.decision,
        reason=payload.reason,
        allow_override=True,
    )
    decision_normalized = payload.decision.strip().lower()
    if decision_normalized == "accept":
        candidate = await session.get(RecCandidate, offer.candidate_id)
        opening = await session.get(RecOpening, offer.opening_id) if offer.opening_id else None
        try:
            await _send_joining_documents_request_email(
                session,
                offer=offer,
                candidate=candidate,
                opening=opening,
            )
        except Exception as exc:  # noqa: BLE001
            await log_event(
                session,
                candidate_id=offer.candidate_id,
                action_type="joining_docs_request_email_failed",
                performed_by_person_id_platform=_safe_person_id(user.person_id_platform),
                related_entity_type="offer",
                related_entity_id=offer.candidate_offer_id,
                meta_json={"offer_id": offer.candidate_offer_id, "error": str(exc)},
            )
    elif decision_normalized == "decline":
        await _auto_recreate_offer_on_decline(
            session,
            source_offer=offer,
            acting_user=user,
            decision_reason=payload.reason,
            source="admin_offer_decision",
        )
    candidate = await session.get(RecCandidate, offer.candidate_id)
    await notify_offer_response_internal(
        session,
        candidate=candidate,
        offer=offer,
        decision=decision_normalized,
        reason=payload.reason,
    )
    await session.commit()
    await session.refresh(offer)
    return OfferOut(
        **_offer_base_payload(offer),
        letter_overrides=_decode_letter_overrides(offer.offer_letter_overrides),
    )


@router.post("/{offer_id}/revise", response_model=OfferOut, status_code=status.HTTP_201_CREATED)
async def revise_offer_route(
    offer_id: int,
    payload: OfferRevisionIn | None = None,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC])),
):
    source_offer = await session.get(RecCandidateOffer, offer_id)
    if not source_offer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found")
    candidate = await session.get(RecCandidate, source_offer.candidate_id)
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")
    opening = await session.get(RecOpening, source_offer.opening_id) if source_offer.opening_id else None
    revised = await create_offer_revision(
        session,
        source_offer=source_offer,
        candidate=candidate,
        opening=opening,
        user=user,
        revision_reason=(payload.reason if payload else None),
    )
    await session.commit()
    await session.refresh(revised)
    return OfferOut(
        **_offer_base_payload(revised),
        letter_overrides=_decode_letter_overrides(revised.offer_letter_overrides),
    )


@router.post("/{offer_id}/send", response_model=OfferOut)
async def send_offer_route(
    offer_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC])),
):
    offer = await session.get(RecCandidateOffer, offer_id)
    if not offer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found")
    candidate = await session.get(RecCandidate, offer.candidate_id)
    opening = await session.get(RecOpening, offer.opening_id) if offer.opening_id else None
    await send_offer(session, offer=offer, user=user)

    if candidate and candidate.email:
        offer_link = _offer_public_link(offer.public_token)
        await send_email(
            session,
            candidate_id=candidate.candidate_id,
            to_emails=[candidate.email],
            subject="Your offer letter is ready",
            template_name="offer_sent",
            context={
                "candidate_name": candidate.full_name,
                "opening_title": opening.title if opening else "",
                "offer_link": offer_link,
                "offer_accept_link": f"{offer_link}?decision=accept",
                "offer_decline_link": f"{offer_link}?decision=decline",
                "joining_date": offer.joining_date,
                "offer_file_url": offer_pdf_signed_url(offer.public_token),
                "sender_name": "Studio Lotus Team",
            },
            email_type="offer_sent",
            related_entity_type="offer",
            related_entity_id=offer.candidate_offer_id,
            meta_extra={"offer_id": offer.candidate_offer_id},
        )
    await session.commit()
    await session.refresh(offer)
    return OfferOut(
        **_offer_base_payload(offer),
        letter_overrides=_decode_letter_overrides(offer.offer_letter_overrides),
    )


@router.post("/{offer_id}/resend-joining-link", response_model=OfferJoiningLinkResendOut)
async def resend_joining_link_route(
    offer_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_superadmin()),
):
    offer = await session.get(RecCandidateOffer, offer_id)
    if not offer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found")
    if offer.offer_status != "accepted":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Joining link can only be resent for accepted offers.")

    candidate = await session.get(RecCandidate, offer.candidate_id)
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")
    opening = await session.get(RecOpening, offer.opening_id) if offer.opening_id else None

    previous_token = offer.public_token
    offer.public_token = uuid4().hex
    offer.updated_at = datetime.utcnow()
    await session.flush()

    email_meta = await _send_joining_documents_request_email(
        session,
        offer=offer,
        candidate=candidate,
        opening=opening,
        force_resend=True,
    )
    joining_link = str(email_meta.get("joining_link") or _joining_public_link(offer.public_token))
    email_status = str(email_meta.get("status") or "unknown")
    email_error = str(email_meta.get("error") or "").strip() or None

    await log_event(
        session,
        candidate_id=offer.candidate_id,
        action_type="joining_link_resent",
        performed_by_person_id_platform=_safe_person_id(user.person_id_platform),
        related_entity_type="offer",
        related_entity_id=offer.candidate_offer_id,
        meta_json={
            "offer_id": offer.candidate_offer_id,
            "old_public_token": previous_token,
            "public_token": offer.public_token,
            "joining_link": joining_link,
            "email_status": email_status,
            "email_error": email_error,
        },
    )
    await session.commit()
    await session.refresh(offer)
    return OfferJoiningLinkResendOut(
        candidate_offer_id=offer.candidate_offer_id,
        candidate_id=offer.candidate_id,
        public_token=offer.public_token,
        joining_link=joining_link,
        email_status=email_status,
        email_error=email_error,
    )


@router.get("/{offer_id}/preview")
async def preview_offer_letter(
    offer_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC])),
):
    offer = await session.get(RecCandidateOffer, offer_id)
    if not offer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found")
    candidate = await session.get(RecCandidate, offer.candidate_id)
    opening = await session.get(RecOpening, offer.opening_id) if offer.opening_id else None
    sender_name = "Studio Lotus Team"
    reporting_to = await _resolve_reporting_to(opening)
    candidate_address = await _resolve_candidate_address(session, candidate, opening)
    unit_name = opening.title if opening and opening.title else "Studio Lotus"
    html = render_offer_letter(
        offer=offer,
        candidate=candidate,
        opening=opening,
        sender_name=sender_name,
        candidate_address=candidate_address,
        reporting_to=reporting_to,
        unit_name=unit_name,
    )
    return Response(content=html, media_type="text/html")


@router.get("/{offer_id}/email-preview")
async def preview_offer_email(
    offer_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC])),
):
    offer = await session.get(RecCandidateOffer, offer_id)
    if not offer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found")
    candidate = await session.get(RecCandidate, offer.candidate_id)
    opening = await session.get(RecOpening, offer.opening_id) if offer.opening_id else None
    offer_link = _offer_public_link(offer.public_token)
    offer_pdf_link = offer_pdf_signed_url(offer.public_token)
    html = render_template(
        "offer_sent",
        {
            "candidate_name": candidate.full_name if candidate else "",
            "opening_title": opening.title if opening else "",
            "offer_link": offer_link,
            "offer_accept_link": f"{offer_link}?decision=accept",
            "offer_decline_link": f"{offer_link}?decision=decline",
            "joining_date": offer.joining_date or "",
            "offer_file_url": offer_pdf_link,
            "sender_name": "Studio Lotus Team",
        },
    )
    return Response(content=html, media_type="text/html")


@router.get("/candidates/{candidate_id}", response_model=list[OfferOut])
async def list_candidate_offers(
    candidate_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    _user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC])),
):
    rows = (
        await session.execute(
            select(RecCandidateOffer)
            .where(RecCandidateOffer.candidate_id == candidate_id)
            .order_by(RecCandidateOffer.created_at.desc(), RecCandidateOffer.candidate_offer_id.desc())
        )
    ).scalars().all()
    updated = False
    for row in rows:
        if not row.public_token:
            await _ensure_public_token(session, row)
            updated = True
    if updated:
        await session.commit()
    return [
        OfferOut(
            **_offer_base_payload(row),
            pdf_download_url=offer_pdf_signed_url(row.public_token),
            letter_overrides=_decode_letter_overrides(row.offer_letter_overrides),
        )
        for row in rows
    ]


@router.post("/candidates/{candidate_id}", response_model=OfferOut, status_code=status.HTTP_201_CREATED)
async def create_candidate_offer(
    candidate_id: int,
    payload: OfferCreateIn,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC])),
):
    candidate = await session.get(RecCandidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")
    opening = None
    if candidate.opening_id:
        opening = await session.get(RecOpening, candidate.opening_id)
    offer = await create_offer(session, candidate=candidate, opening=opening, payload=payload.model_dump(exclude_none=True), user=user)
    try:
        await _ensure_offer_pdf(
            session=session,
            offer=offer,
            candidate=candidate,
            opening=opening,
            sender_name=user.full_name or "Studio Lotus Team",
            candidate_address=await _resolve_candidate_address(session, candidate, opening),
            reporting_to=await _resolve_reporting_to(opening),
            unit_name=opening.title if opening and opening.title else "Studio Lotus",
        )
    except Exception:
        pass
    await session.commit()
    await session.refresh(offer)
    return OfferOut(
        **_offer_base_payload(offer),
        letter_overrides=_decode_letter_overrides(offer.offer_letter_overrides),
    )


@public_router.get("/{token}", response_model=OfferPublicOut)
async def get_public_offer(
    token: str,
    request: Request,
    session: AsyncSession = Depends(deps.get_db_session),
):
    exp = request.query_params.get("exp")
    sig = request.query_params.get("sig")
    # Unlike the PDF endpoint (whose links only ever go out in candidate emails), this
    # view page is also linked from the internal HR activity feed as a plain, unsigned
    # `/offer/{token}` path for staff browsing their own authenticated session — so the
    # signature is required only for requests with no valid internal session, not
    # unconditionally in production.
    has_internal_cookie = bool(request.cookies.get("slr_token"))
    if not has_internal_cookie and not verify_offer_view_signature(token, exp, sig):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid or expired link")
    offer = (
        await session.execute(select(RecCandidateOffer).where(RecCandidateOffer.public_token == token))
    ).scalars().first()
    if not offer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found")
    candidate = await session.get(RecCandidate, offer.candidate_id)
    opening = await session.get(RecOpening, offer.opening_id) if offer.opening_id else None
    if offer.offer_status in {"withdrawn"}:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Offer withdrawn")
    if offer.offer_status == "sent" and offer.viewed_at is None:
        offer.viewed_at = datetime.utcnow()
        await session.commit()
    return OfferPublicOut(
        candidate_name=candidate.full_name if candidate else None,
        candidate_code=candidate.candidate_code if candidate else None,
        opening_title=opening.title if opening else None,
        designation_title=offer.designation_title,
        gross_ctc_annual=offer.gross_ctc_annual,
        fixed_ctc_annual=offer.fixed_ctc_annual,
        variable_ctc_annual=offer.variable_ctc_annual,
        currency=offer.currency,
        joining_date=offer.joining_date,
        probation_months=offer.probation_months,
        offer_valid_until=offer.offer_valid_until,
        offer_status=offer.offer_status,
        acceptance_typed_name=offer.acceptance_typed_name,
        pdf_url=offer.pdf_url,
        pdf_download_url=offer_pdf_signed_url(offer.public_token),
        joining_upload_url=_joining_public_link(offer.public_token) if offer.offer_status == "accepted" else None,
    )


@public_router.get("/{token}/pdf")
async def get_public_offer_pdf(
    token: str,
    request: Request,
    session: AsyncSession = Depends(deps.get_db_session),
):
    exp = request.query_params.get("exp")
    sig = request.query_params.get("sig")
    has_internal_cookie = bool(request.cookies.get("slr_token"))
    if settings.environment == "production" or not has_internal_cookie:
        valid = verify_offer_pdf_signature(token, exp, sig)
        if not valid:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid or expired link")
    download_flag = request.query_params.get("download", "1")
    offer = (
        await session.execute(select(RecCandidateOffer).where(RecCandidateOffer.public_token == token))
    ).scalars().first()
    if not offer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found")
    file_id = _extract_drive_file_id(offer.pdf_url)
    candidate = await session.get(RecCandidate, offer.candidate_id)
    opening = await session.get(RecOpening, offer.opening_id) if offer.opening_id else None
    sender_name = "Studio Lotus Team"
    reporting_to = await _resolve_reporting_to(opening)
    candidate_address = await _resolve_candidate_address(session, candidate, opening)
    unit_name = opening.title if opening and opening.title else "Studio Lotus"
    if file_id:
        try:
            data, content_type, file_name = download_drive_file(file_id)
            filename = file_name or f"{candidate.candidate_code if candidate else token}-offer-letter.pdf"
            disposition = "attachment" if download_flag == "1" else "inline"
            headers = {"Content-Disposition": f'{disposition}; filename="{filename}"'}
            return Response(content=data, media_type=content_type or "application/pdf", headers=headers)
        except Exception:
            file_id = None
    try:
        html = render_offer_letter(
            offer=offer,
            candidate=candidate,
            opening=opening,
            sender_name=sender_name,
            candidate_address=candidate_address,
            reporting_to=reporting_to,
            unit_name=unit_name,
        )
        pdf_bytes = _render_offer_pdf_bytes(html)
    except Exception:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Offer PDF generator unavailable")
    filename = f"{candidate.candidate_code if candidate else token}-offer-letter.pdf"
    if candidate and candidate.drive_folder_id:
        _, file_url = upload_offer_doc(
            candidate.drive_folder_id,
            filename=filename,
            content_type="application/pdf",
            data=pdf_bytes,
        )
        offer.pdf_url = file_url
        await session.flush()
    disposition = "attachment" if download_flag == "1" else "inline"
    headers = {"Content-Disposition": f'{disposition}; filename="{filename}"'}
    return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)


@public_router.post("/{token}/decision", response_model=OfferPublicOut)
async def decide_public_offer(
    token: str,
    payload: OfferDecisionIn,
    request: Request,
    session: AsyncSession = Depends(deps.get_db_session),
):
    exp = request.query_params.get("exp")
    sig = request.query_params.get("sig")
    has_internal_cookie = bool(request.cookies.get("slr_token"))
    if not has_internal_cookie and not verify_offer_view_signature(token, exp, sig):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid or expired link")
    offer = (
        await session.execute(select(RecCandidateOffer).where(RecCandidateOffer.public_token == token))
    ).scalars().first()
    if not offer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found")
    await record_candidate_response(
        session,
        offer=offer,
        decision=payload.decision,
        reason=payload.reason,
        typed_name=payload.typed_name,
        actor_ip=_request_ip(request),
        actor_user_agent=request.headers.get("user-agent"),
    )

    candidate = await session.get(RecCandidate, offer.candidate_id)
    opening = await session.get(RecOpening, offer.opening_id) if offer.opening_id else None
    decision_normalized = payload.decision.strip().lower()
    if decision_normalized == "accept":
        try:
            await _send_joining_documents_request_email(
                session,
                offer=offer,
                candidate=candidate,
                opening=opening,
            )
        except Exception as exc:  # noqa: BLE001
            await log_event(
                session,
                candidate_id=offer.candidate_id,
                action_type="joining_docs_request_email_failed",
                performed_by_person_id_platform=None,
                related_entity_type="offer",
                related_entity_id=offer.candidate_offer_id,
                meta_json={"offer_id": offer.candidate_offer_id, "error": str(exc)},
            )
    elif decision_normalized == "decline":
        await _auto_recreate_offer_on_decline(
            session,
            source_offer=offer,
            acting_user=None,
            decision_reason=payload.reason,
            source="public_offer_decision",
        )
    await notify_offer_response_internal(
        session,
        candidate=candidate,
        offer=offer,
        decision=decision_normalized,
        reason=payload.reason,
    )
    await session.commit()
    return OfferPublicOut(
        candidate_name=candidate.full_name if candidate else None,
        candidate_code=candidate.candidate_code if candidate else None,
        opening_title=opening.title if opening else None,
        designation_title=offer.designation_title,
        gross_ctc_annual=offer.gross_ctc_annual,
        fixed_ctc_annual=offer.fixed_ctc_annual,
        variable_ctc_annual=offer.variable_ctc_annual,
        currency=offer.currency,
        joining_date=offer.joining_date,
        probation_months=offer.probation_months,
        offer_valid_until=offer.offer_valid_until,
        offer_status=offer.offer_status,
        acceptance_typed_name=offer.acceptance_typed_name,
        pdf_url=offer.pdf_url,
        pdf_download_url=offer_pdf_signed_url(offer.public_token),
        joining_upload_url=_joining_public_link(offer.public_token) if offer.offer_status == "accepted" else None,
    )


@approval_public_router.get("/{token}", response_model=OfferApprovalPublicOut)
async def get_public_offer_approval(
    token: str,
    session: AsyncSession = Depends(deps.get_db_session),
):
    offer = (
        await session.execute(select(RecCandidateOffer).where(RecCandidateOffer.approval_request_token == token))
    ).scalars().first()
    if not offer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Approval request not found")
    now = datetime.utcnow()
    if offer.offer_status != "pending_approval":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Offer is no longer pending approval.")
    if offer.approval_request_expires_at and offer.approval_request_expires_at < now:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Approval request expired.")
    candidate = await session.get(RecCandidate, offer.candidate_id)
    opening = await session.get(RecOpening, offer.opening_id) if offer.opening_id else None
    return OfferApprovalPublicOut(
        candidate_name=candidate.full_name if candidate else None,
        candidate_code=candidate.candidate_code if candidate else None,
        opening_title=opening.title if opening else None,
        designation_title=offer.designation_title,
        gross_ctc_annual=offer.gross_ctc_annual,
        currency=offer.currency,
        joining_date=offer.joining_date,
        offer_valid_until=offer.offer_valid_until,
        offer_status=offer.offer_status,
        approval_principal_email=offer.approval_principal_email,
        approval_decision=offer.approval_decision,
        approval_decision_at=offer.approval_decision_at,
        approval_rejection_reason=offer.approval_rejection_reason,
        approval_request_expires_at=offer.approval_request_expires_at,
        pdf_download_url=offer_pdf_signed_url(offer.public_token),
    )


@approval_public_router.post("/{token}/decision", response_model=OfferApprovalPublicOut)
async def decide_public_offer_approval(
    token: str,
    payload: OfferApprovalDecisionIn,
    session: AsyncSession = Depends(deps.get_db_session),
):
    offer = (
        await session.execute(select(RecCandidateOffer).where(RecCandidateOffer.approval_request_token == token))
    ).scalars().first()
    if not offer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Approval request not found")
    principal_email = normalize_principal_email(offer.approval_principal_email)
    if not is_principal_approver_email(principal_email):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Principal approver email is not configured.")
    await principal_decide_offer(
        session,
        offer=offer,
        principal_email=principal_email,
        decision=payload.decision,
        reason=payload.reason,
    )

    candidate = await session.get(RecCandidate, offer.candidate_id)
    opening = await session.get(RecOpening, offer.opening_id) if offer.opening_id else None
    hr_recipients: list[str] = []
    requested_by_email = normalize_principal_email(offer.approval_requested_by_email)
    if requested_by_email:
        hr_recipients.append(requested_by_email)
    sender_email = normalize_principal_email(settings.gmail_sender_email)
    if sender_email and sender_email not in hr_recipients:
        hr_recipients.append(sender_email)

    decision_label = "approved" if payload.decision == "approve" else "rejected"
    await send_email(
        session,
        candidate_id=offer.candidate_id,
        to_emails=hr_recipients,
        subject=f"Offer approval {decision_label}: {candidate.full_name if candidate else 'Candidate'}",
        template_name="offer_approval_decision_hr",
        context={
            "candidate_name": candidate.full_name if candidate else "",
            "candidate_code": candidate.candidate_code if candidate else "",
            "opening_title": opening.title if opening else "",
            "designation_title": offer.designation_title or "",
            "decision_label": decision_label.title(),
            "principal_email": principal_email or "",
            "reason": (payload.reason or "").strip(),
            "offer_link": _offer_public_link(offer.public_token),
            "offer_file_url": offer_pdf_signed_url(offer.public_token),
            "sender_name": "Studio Lotus Recruitment Team",
        },
        email_type="offer_approval_decision_hr",
        related_entity_type="offer",
        related_entity_id=offer.candidate_offer_id,
        meta_extra={
            "offer_id": offer.candidate_offer_id,
            "approval_principal_email": principal_email,
            "decision": payload.decision,
        },
    )

    await session.commit()
    await session.refresh(offer)
    return OfferApprovalPublicOut(
        candidate_name=candidate.full_name if candidate else None,
        candidate_code=candidate.candidate_code if candidate else None,
        opening_title=opening.title if opening else None,
        designation_title=offer.designation_title,
        gross_ctc_annual=offer.gross_ctc_annual,
        currency=offer.currency,
        joining_date=offer.joining_date,
        offer_valid_until=offer.offer_valid_until,
        offer_status=offer.offer_status,
        approval_principal_email=offer.approval_principal_email,
        approval_decision=offer.approval_decision,
        approval_decision_at=offer.approval_decision_at,
        approval_rejection_reason=offer.approval_rejection_reason,
        approval_request_expires_at=offer.approval_request_expires_at,
        pdf_download_url=offer_pdf_signed_url(offer.public_token),
    )
