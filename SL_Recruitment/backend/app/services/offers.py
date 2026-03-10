from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
import base64
import hashlib
import hmac
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.platform_session import PlatformSessionLocal
from app.models.candidate import RecCandidate
from app.models.candidate_offer import RecCandidateOffer
from app.models.joining_doc import RecCandidateJoiningDoc
from app.models.opening_event import RecOpeningEvent
from app.models.opening import RecOpening
from app.models.platform_person import DimPerson
from app.schemas.user import UserContext
from app.core.config import settings
from app.core.paths import resolve_repo_path
from app.services.drive import move_candidate_folder, upload_offer_doc
from app.services.events import log_event
from app.services.operation_queue import OP_DRIVE_MOVE_FOLDER, enqueue_operation
from app.services.platform_identity import active_status_filter
from app.services.public_links import build_public_link
from app.services.stage_transitions import apply_stage_transition

PRINCIPAL_APPROVER_EMAILS = (
    "asha@studiolotus.in",
    "ankur@studiolotus.in",
    "ambrish@studiolotus.in",
    "harsh@studiolotus.in",
    "datahub@studiolotus.in",
)

REQUIRED_JOINING_DOC_TYPES = {
    "pan",
    "aadhaar",
    "marksheets",
    "experience_letters",
    "salary_slips",
}


def _normalize_joining_doc_type(raw: str | None) -> str | None:
    value = (raw or "").strip().lower().replace(" ", "_")
    if value == "aadhar":
        value = "aadhaar"
    if value in {"mark_sheets", "mark_sheet"}:
        value = "marksheets"
    if value in {"experience_letter", "experienceletters"}:
        value = "experience_letters"
    if value in {"salary_slip", "salaryslip"}:
        value = "salary_slips"
    if value in REQUIRED_JOINING_DOC_TYPES:
        return value
    return None


async def _candidate_has_required_joining_docs(session: AsyncSession, *, candidate_id: int) -> bool:
    rows = (
        await session.execute(
            select(RecCandidateJoiningDoc.doc_type).where(RecCandidateJoiningDoc.candidate_id == candidate_id)
        )
    ).scalars().all()
    seen = {
        normalized
        for normalized in (_normalize_joining_doc_type(str(row)) for row in rows if row)
        if normalized is not None
    }
    return REQUIRED_JOINING_DOC_TYPES.issubset(seen)


def _format_date(value) -> str:
    if not value:
        return "-"
    try:
        return value.strftime("%d %b %Y")
    except Exception:
        return str(value)


def _format_money(value) -> str:
    if value is None:
        return "-"
    try:
        return f"{float(value):,.0f}"
    except Exception:
        return str(value)

def _logo_data_uri() -> str:
    preferred = resolve_repo_path("backend/app/templates/offer_letter_logo.png")
    fallback = resolve_repo_path("frontend/public/Studio Lotus Logo (TM).png")
    path = preferred if preferred.exists() else fallback
    if not path.exists():
        return ""
    data = path.read_bytes()
    b64 = base64.b64encode(data).decode("ascii")
    return f"data:image/png;base64,{b64}"

def _offer_public_link(token: str) -> str:
    return build_public_link(f"/offer/{token}")

def _offer_public_pdf_link(token: str) -> str:
    return build_public_link(f"/api/offer/{token}/pdf")


def offer_approval_public_link(token: str) -> str:
    return build_public_link(f"/offer-approval/{token}")


def normalize_principal_email(email: str | None) -> str | None:
    value = (email or "").strip().lower()
    if not value:
        return None
    return value


def is_principal_approver_email(email: str | None) -> bool:
    normalized = normalize_principal_email(email)
    return bool(normalized and normalized in PRINCIPAL_APPROVER_EMAILS)


def _offer_pdf_signature(token: str, expires_at: int) -> str:
    signing_key = (settings.public_link_signing_key or settings.secret_key).strip()
    payload = f"{token}:{int(expires_at)}"
    digest = hmac.new(
        signing_key.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")

def offer_pdf_signed_url(token: str, *, download: bool = True) -> str:
    expires_at = int((datetime.now(timezone.utc) + timedelta(hours=settings.public_link_ttl_hours)).timestamp())
    sig = _offer_pdf_signature(token, expires_at)
    base = _offer_public_pdf_link(token)
    download_flag = "1" if download else "0"
    return f"{base}?exp={expires_at}&sig={sig}&download={download_flag}"

def verify_offer_pdf_signature(token: str, exp: str | None, sig: str | None) -> bool:
    if not exp or not sig:
        return False
    try:
        exp_int = int(exp)
    except ValueError:
        return False
    if datetime.now(timezone.utc).timestamp() > exp_int:
        return False
    expected = _offer_pdf_signature(token, exp_int)
    return hmac.compare_digest(expected, sig)


def _joining_link_signature(token: str, expires_at: int) -> str:
    signing_key = (settings.public_link_signing_key or settings.secret_key).strip()
    payload = f"joining:{token}:{int(expires_at)}"
    digest = hmac.new(
        signing_key.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")


def joining_public_signed_url(token: str) -> str:
    expires_at = int((datetime.now(timezone.utc) + timedelta(hours=settings.public_link_ttl_hours)).timestamp())
    sig = _joining_link_signature(token, expires_at)
    base = build_public_link(f"/joining/{token}")
    return f"{base}?exp={expires_at}&sig={sig}"


def verify_joining_link_signature(token: str, exp: str | None, sig: str | None) -> bool:
    if not exp or not sig:
        return False
    try:
        exp_int = int(exp)
    except ValueError:
        return False
    if datetime.now(timezone.utc).timestamp() > exp_int:
        return False
    expected = _joining_link_signature(token, exp_int)
    return hmac.compare_digest(expected, sig)


def _parse_letter_overrides(raw: str | None) -> dict[str, str]:
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except Exception:
        return {}
    if not isinstance(data, dict):
        return {}
    cleaned: dict[str, str] = {}
    for key, value in data.items():
        if not isinstance(key, str):
            continue
        if value is None:
            continue
        cleaned[key] = str(value)
    return cleaned

def _render_offer_pdf_bytes(html: str) -> bytes:
    try:
        from weasyprint import HTML
    except Exception as exc:
        raise RuntimeError(
            "WeasyPrint is required to generate offer PDFs. Install weasyprint and its system dependencies."
        ) from exc
    try:
        return HTML(string=html).write_pdf()
    except Exception as exc:
        raise RuntimeError("Failed to render offer letter PDF.") from exc

async def _resolve_reporting_to(opening: RecOpening | None) -> str:
    if not opening or not opening.reporting_person_id_platform:
        return ""
    person_id = str(opening.reporting_person_id_platform).strip()
    if not person_id:
        return ""
    try:
        async with PlatformSessionLocal() as platform_session:
            person = (
                await platform_session.execute(
                    select(DimPerson).where(DimPerson.person_id == person_id, active_status_filter())
                )
            ).scalars().first()
            if not person:
                return ""
            return person.display_name or person.full_name or person.email or ""
    except Exception:
        return ""


async def _resolve_candidate_address(session: AsyncSession, candidate: RecCandidate | None, opening: RecOpening | None) -> str:
    if candidate and candidate.current_location:
        return candidate.current_location
    city = opening.location_city if opening else None
    country = opening.location_country if opening else None
    parts = [p for p in [city, country] if p]
    return ", ".join(parts) if parts else ""


async def _ensure_offer_pdf(
    *,
    session: AsyncSession,
    offer: RecCandidateOffer,
    candidate: RecCandidate | None,
    opening: RecOpening | None,
    sender_name: str,
    candidate_address: str,
    reporting_to: str,
    unit_name: str,
    force: bool = False,
) -> str | None:
    if not candidate or not candidate.drive_folder_id:
        return None
    if not force and offer.pdf_url and offer.pdf_url.lower().endswith(".pdf"):
        return offer.pdf_url
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
    filename = f"{candidate.candidate_code}-offer-letter.pdf"
    _, file_url = upload_offer_doc(
        candidate.drive_folder_id,
        filename=filename,
        content_type="application/pdf",
        data=pdf_bytes,
    )
    offer.pdf_url = file_url
    await session.flush()
    return file_url

def render_offer_letter(
    *,
    offer: RecCandidateOffer,
    candidate: RecCandidate | None,
    opening: RecOpening | None,
    sender_name: str,
    candidate_address: str,
    reporting_to: str,
    unit_name: str,
) -> str:
    path = resolve_repo_path("backend/app/templates/offer_letter.html")
    raw = path.read_text(encoding="utf-8")
    joining_address = "F 301, Ch. Prem Singh House, Lado Sarai, New Delhi 110030"
    gross_monthly = None
    if offer.gross_ctc_annual is not None:
        try:
            gross_monthly = float(offer.gross_ctc_annual) / 12
        except Exception:
            gross_monthly = None
    joining_bonus_monthly = "-"
    letter_date = _format_date(offer.generated_at or offer.created_at)
    context = {
        "logo_data_uri": _logo_data_uri(),
        "letter_date": letter_date,
        "candidate_name": candidate.full_name if candidate else "",
        "candidate_code": candidate.candidate_code if candidate else "",
        "candidate_address": candidate_address or "Address / City.",
        "designation_title": offer.designation_title or (opening.title if opening else ""),
        "opening_title": opening.title if opening else "",
        "joining_date": _format_date(offer.joining_date),
        "joining_address": joining_address,
        "gross_ctc": _format_money(offer.gross_ctc_annual),
        "fixed_ctc": _format_money(offer.fixed_ctc_annual),
        "variable_ctc": _format_money(offer.variable_ctc_annual),
        "currency": offer.currency or "INR",
        "probation_months": f"{offer.probation_months} months" if offer.probation_months is not None else "6 months",
        "valid_until": _format_date(offer.offer_valid_until),
        "gross_salary_monthly": _format_money(gross_monthly),
        "joining_bonus_monthly": joining_bonus_monthly,
        "joining_bonus_until": "March 2027",
        "ctc_revision_from": "April 2027",
        "ctc_revision_window": "April 2026 - March 2027",
        "ctc_revision_payout": "2027-28",
        "unit_name": unit_name or (opening.title if opening else "Studio Lotus"),
        "reporting_to": reporting_to or "-",
        "minimum_commitment_years": "2",
        "probation_notice_days": "15",
        "signatory_name": "Harsh Vardhan",
        "signatory_title": "Principal",
        "footer_note": "",
        "sender_name": sender_name,
        "offer_public_link": _offer_public_link(offer.public_token),
    }
    overrides = _parse_letter_overrides(offer.offer_letter_overrides)
    for key, value in overrides.items():
        if key in context and value.strip():
            context[key] = value.strip()
    return raw.format_map({k: ("" if v is None else v) for k, v in context.items()})

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


async def _sync_opening_counts_for_hire(
    session: AsyncSession,
    *,
    opening_id: int | None,
    user: UserContext,
) -> None:
    if opening_id is None:
        return

    opening = await session.get(RecOpening, opening_id, with_for_update=True)
    if not opening:
        return

    filled_before = int(opening.headcount_filled or 0)
    is_active_before = bool(opening.is_active)
    required = int(opening.headcount_required or 0)

    filled_now = (
        await session.execute(
            select(func.count(RecCandidate.candidate_id)).where(
                RecCandidate.opening_id == opening_id,
                RecCandidate.final_decision == "hired",
                RecCandidate.archived_at.is_(None),
            )
        )
    ).scalar_one()
    opening.headcount_filled = int(filled_now or 0)

    if required > 0 and opening.headcount_filled >= required:
        opening.is_active = 0
    opening.updated_at = datetime.utcnow()

    if filled_before == opening.headcount_filled and is_active_before == bool(opening.is_active):
        return

    session.add(
        RecOpeningEvent(
            opening_id=opening.opening_id,
            opening_request_id=None,
            action_type="opening_headcount_synced_on_hire",
            actor_person_id_platform=(user.person_id_platform or "").strip() or None,
            actor_role="offer_flow",
            meta_json=json.dumps(
                {
                    "headcount_filled_before": filled_before,
                    "headcount_filled_after": opening.headcount_filled,
                    "headcount_required": required,
                    "is_active_before": is_active_before,
                    "is_active_after": bool(opening.is_active),
                },
                separators=(",", ":"),
            ),
            created_at=datetime.utcnow(),
        )
    )


async def create_offer(session: AsyncSession, *, candidate: RecCandidate, opening: RecOpening | None, payload: dict[str, Any], user: UserContext) -> RecCandidateOffer:
    now = datetime.utcnow()
    letter_overrides = payload.get("letter_overrides")
    if isinstance(letter_overrides, dict):
        try:
            letter_overrides = json.dumps(letter_overrides)
        except Exception:
            letter_overrides = None
    else:
        letter_overrides = None
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
        offer_letter_overrides=letter_overrides,
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


async def create_offer_revision(
    session: AsyncSession,
    *,
    source_offer: RecCandidateOffer,
    candidate: RecCandidate,
    opening: RecOpening | None,
    user: UserContext,
    revision_reason: str | None = None,
) -> RecCandidateOffer:
    if source_offer.offer_status not in {"declined", "withdrawn"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Offer revision is allowed only after a declined/withdrawn offer.",
        )
    max_version = (
        await session.execute(select(func.max(RecCandidateOffer.offer_version)).where(RecCandidateOffer.candidate_id == source_offer.candidate_id))
    ).scalar_one()
    next_version = int(max_version or 0) + 1
    now = datetime.utcnow()
    revision_note = (revision_reason or "").strip()
    notes = (source_offer.notes_internal or "").strip()
    if revision_note:
        notes = f"{notes}\n\nRevision reason: {revision_note}".strip()

    revision = RecCandidateOffer(
        candidate_id=source_offer.candidate_id,
        opening_id=source_offer.opening_id,
        offer_template_code=source_offer.offer_template_code,
        offer_version=next_version,
        gross_ctc_annual=source_offer.gross_ctc_annual,
        fixed_ctc_annual=source_offer.fixed_ctc_annual,
        variable_ctc_annual=source_offer.variable_ctc_annual,
        currency=source_offer.currency or "INR",
        designation_title=source_offer.designation_title or (opening.title if opening else None),
        grade_id_platform=source_offer.grade_id_platform,
        joining_date=source_offer.joining_date,
        probation_months=source_offer.probation_months,
        offer_valid_until=source_offer.offer_valid_until,
        offer_status="draft",
        public_token=uuid4().hex,
        generated_by_person_id_platform=_platform_person_id(user),
        generated_at=now,
        notes_internal=notes or None,
        offer_letter_overrides=source_offer.offer_letter_overrides,
        created_at=now,
        updated_at=now,
    )
    session.add(revision)
    await session.flush()

    candidate.status = "offer"
    candidate.final_decision = "pending"
    candidate.updated_at = now
    await apply_stage_transition(
        session,
        candidate=candidate,
        to_stage="offer",
        decision="advance",
        note="offer_revision",
        reason=revision_reason,
        user=user,
        source="offer_revision",
        allow_noop=True,
        skip_requested=True,
        skip_requires_superadmin=False,
    )
    await log_event(
        session,
        candidate_id=source_offer.candidate_id,
        action_type="offer_revision_created",
        performed_by_person_id_platform=_platform_person_id(user),
        related_entity_type="offer",
        related_entity_id=revision.candidate_offer_id,
        meta_json=_event_meta(
            user,
            {
                "offer_id": revision.candidate_offer_id,
                "source_offer_id": source_offer.candidate_offer_id,
                "source_offer_status": source_offer.offer_status,
                "offer_version": revision.offer_version,
                "reason": revision_reason,
            },
        ),
    )
    return revision


async def update_offer_details(session: AsyncSession, *, offer: RecCandidateOffer, payload: dict[str, Any], user: UserContext) -> RecCandidateOffer:
    if offer.offer_status != "draft":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only draft offers can be edited.")
    for key, value in payload.items():
        if key == "letter_overrides":
            if isinstance(value, dict):
                try:
                    offer.offer_letter_overrides = json.dumps(value)
                except Exception:
                    offer.offer_letter_overrides = None
            elif value is None:
                offer.offer_letter_overrides = None
            continue
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
    principal_email = normalize_principal_email(offer.approval_principal_email)
    if not principal_email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Select a principal approver email.")
    return await submit_for_approval_with_principal(
        session,
        offer=offer,
        user=user,
        approval_principal_email=principal_email,
    )


async def submit_for_approval_with_principal(
    session: AsyncSession,
    *,
    offer: RecCandidateOffer,
    user: UserContext,
    approval_principal_email: str,
) -> RecCandidateOffer:
    if offer.offer_status != "draft":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only draft offers can be submitted.")
    normalized_principal = normalize_principal_email(approval_principal_email)
    if not is_principal_approver_email(normalized_principal):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid principal approver email.")
    now = datetime.utcnow()
    offer.offer_status = "pending_approval"
    offer.approval_principal_email = normalized_principal
    offer.approval_requested_by_email = (user.email or "").strip().lower()
    offer.approval_requested_at = now
    offer.approval_request_token = uuid4().hex
    offer.approval_request_expires_at = now + timedelta(hours=settings.public_link_ttl_hours)
    offer.approval_request_used_at = None
    offer.approval_decision = None
    offer.approval_decision_by_email = None
    offer.approval_decision_at = None
    offer.approval_rejection_reason = None
    offer.updated_at = now
    await log_event(
        session,
        candidate_id=offer.candidate_id,
        action_type="offer_submitted_for_approval",
        performed_by_person_id_platform=_platform_person_id(user),
        related_entity_type="offer",
        related_entity_id=offer.candidate_offer_id,
        meta_json=_event_meta(
            user,
            {
                "offer_id": offer.candidate_offer_id,
                "approval_principal_email": normalized_principal,
                "approval_request_expires_at": offer.approval_request_expires_at.isoformat() if offer.approval_request_expires_at else None,
            },
        ),
    )
    return offer


async def approve_offer(session: AsyncSession, *, offer: RecCandidateOffer, user: UserContext) -> RecCandidateOffer:
    if offer.offer_status != "pending_approval":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Offer is not pending approval.")
    now = datetime.utcnow()
    offer.offer_status = "approved"
    offer.approved_by_person_id_platform = _platform_person_id(user)
    offer.approved_at = now
    offer.approval_decision = "approved"
    offer.approval_decision_by_email = (user.email or "").strip().lower() or None
    offer.approval_decision_at = now
    offer.approval_rejection_reason = None
    offer.approval_request_used_at = now
    offer.approval_request_token = None
    offer.approval_request_expires_at = None
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
    now = datetime.utcnow()
    offer.offer_status = "draft"
    offer.approval_decision = "rejected"
    offer.approval_decision_by_email = (user.email or "").strip().lower() or None
    offer.approval_decision_at = now
    offer.approval_rejection_reason = (reason or "").strip() or None
    offer.approval_request_used_at = now
    offer.approval_request_token = None
    offer.approval_request_expires_at = None
    offer.updated_at = now
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


async def principal_decide_offer(
    session: AsyncSession,
    *,
    offer: RecCandidateOffer,
    principal_email: str,
    decision: str,
    reason: str | None = None,
) -> RecCandidateOffer:
    if offer.offer_status != "pending_approval":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Offer is not pending principal approval.")
    normalized_principal = normalize_principal_email(principal_email)
    if not is_principal_approver_email(normalized_principal):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Principal approver is not allowed.")
    if normalize_principal_email(offer.approval_principal_email) != normalized_principal:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This approval request is not assigned to this principal.")
    now = datetime.utcnow()
    if offer.approval_request_expires_at and offer.approval_request_expires_at < now:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Approval request link has expired.")

    normalized = (decision or "").strip().lower()
    if normalized == "approve":
        offer.offer_status = "approved"
        offer.approved_at = now
        offer.approved_by_person_id_platform = None
        offer.approval_decision = "approved"
        offer.approval_rejection_reason = None
        action_type = "offer_principal_approved"
    elif normalized == "reject":
        offer.offer_status = "draft"
        offer.approval_decision = "rejected"
        offer.approval_rejection_reason = (reason or "").strip() or None
        action_type = "offer_principal_rejected"
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Decision must be approve or reject.")

    offer.approval_decision_by_email = normalized_principal
    offer.approval_decision_at = now
    offer.approval_request_used_at = now
    offer.approval_request_token = None
    offer.approval_request_expires_at = None
    offer.updated_at = now

    await log_event(
        session,
        candidate_id=offer.candidate_id,
        action_type=action_type,
        performed_by_person_id_platform=None,
        related_entity_type="offer",
        related_entity_id=offer.candidate_offer_id,
        meta_json={
            "offer_id": offer.candidate_offer_id,
            "principal_email": normalized_principal,
            "reason": offer.approval_rejection_reason,
        },
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

    candidate = await session.get(RecCandidate, offer.candidate_id)
    opening = await session.get(RecOpening, offer.opening_id) if offer.opening_id else None
    sender_name = user.full_name or "SL Recruitment"
    reporting_to = await _resolve_reporting_to(opening)
    candidate_address = await _resolve_candidate_address(session, candidate, opening)
    unit_name = opening.title if opening and opening.title else "Studio Lotus"

    try:
        await _ensure_offer_pdf(
            session=session,
            offer=offer,
            candidate=candidate,
            opening=opening,
            sender_name=sender_name,
            candidate_address=candidate_address,
            reporting_to=reporting_to,
            unit_name=unit_name,
        )
    except Exception:
        # Best-effort upload; do not block send
        pass

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


async def record_candidate_response(
    session: AsyncSession,
    *,
    offer: RecCandidateOffer,
    decision: str,
    reason: str | None = None,
    typed_name: str | None = None,
    actor_ip: str | None = None,
    actor_user_agent: str | None = None,
    allow_override: bool = False,
) -> RecCandidateOffer:
    now = datetime.utcnow()
    if offer.offer_status not in {"sent", "viewed"} and not allow_override:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Offer is not awaiting candidate response.")
    if allow_override and offer.offer_status in {"accepted", "declined", "withdrawn"}:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Offer decision is already final.")
    normalized = decision.strip().lower()
    if normalized not in {"accept", "decline"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Decision must be accept or decline.")
    typed_name_clean = (typed_name or "").strip()
    if normalized == "accept" and not allow_override and not typed_name_clean:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Typed name is required to accept the offer.")
    candidate = await session.get(RecCandidate, offer.candidate_id)
    if normalized == "accept":
        offer.offer_status = "accepted"
        offer.accepted_at = now
        offer.acceptance_typed_name = typed_name_clean or None
        offer.acceptance_ip = (actor_ip or "").strip() or None
        offer.acceptance_user_agent = (actor_user_agent or "").strip()[:512] or None
        action = "offer_accepted"
        if candidate:
            candidate.status = "offer"
            candidate.final_decision = "pending"
            candidate.updated_at = now
            await apply_stage_transition(
                session,
                candidate=candidate,
                to_stage="joining_documents",
                decision="accept",
                reason=reason,
                note="offer_flow",
                source="offer_response",
            )
    else:
        offer.offer_status = "declined"
        offer.declined_at = now
        offer.acceptance_typed_name = None
        offer.acceptance_ip = None
        offer.acceptance_user_agent = None
        action = "offer_declined"
        if candidate:
            # Keep candidate active for negotiation; HR will explicitly close as rejected/declined/hired.
            candidate.status = "offer"
            candidate.final_decision = "pending"
            candidate.updated_at = now
            await apply_stage_transition(
                session,
                candidate=candidate,
                to_stage="offer",
                decision="decline",
                reason=reason,
                note="offer_declined_negotiation",
                source="offer_response",
                allow_noop=True,
                allow_terminal_reopen=True,
            )
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


def _clean_optional_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _coerce_optional_int(value: Any, *, field_label: str) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{field_label} must be a valid integer.")
    if isinstance(value, int):
        return value
    text = str(value).strip()
    if not text:
        return None
    try:
        return int(text)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{field_label} must be a valid integer.") from exc


def _is_intern_role(*values: str | None) -> bool:
    for value in values:
        normalized = (value or "").strip().lower()
        if "intern" in normalized:
            return True
    return False


async def convert_candidate_to_employee(
    session: AsyncSession,
    *,
    candidate: RecCandidate,
    offer: RecCandidateOffer,
    user: UserContext,
    employee_profile: dict[str, Any],
) -> RecCandidate:
    if offer.offer_status != "accepted":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Offer must be accepted before conversion.")
    docs_complete = await _candidate_has_required_joining_docs(session, candidate_id=candidate.candidate_id)
    if not docs_complete:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Joining documents are not complete.")
    candidate.joining_docs_status = "complete"

    profile = employee_profile or {}
    person_code = _clean_optional_text(profile.get("person_code"))
    first_name = _clean_optional_text(profile.get("first_name"))
    employment_type = _clean_optional_text(profile.get("employment_type"))
    email = (_clean_optional_text(profile.get("email")) or "").lower()

    if not person_code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Employee ID is required.")
    if not first_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="First name is required.")
    if not employment_type:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Employment type is required.")
    if not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email is required.")

    email_domain = email.split("@")[-1] if "@" in email else ""
    is_intern = _is_intern_role(employment_type, offer.designation_title)
    is_permanent = "permanent" in employment_type.lower()
    if is_permanent and not is_intern and email_domain != "studiolotus.in":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Permanent employees must use a @studiolotus.in email.",
        )

    last_name = _clean_optional_text(profile.get("last_name")) or candidate.last_name
    personal_id = _clean_optional_text(profile.get("personal_id"))
    mobile_number = _clean_optional_text(profile.get("mobile_number")) or candidate.phone
    manager_id = _clean_optional_text(profile.get("manager_id"))
    role_id = _coerce_optional_int(profile.get("role_id"), field_label="Role ID")
    grade_id = _coerce_optional_int(profile.get("grade_id"), field_label="Grade ID")
    if role_id is None and offer.grade_id_platform is not None:
        role_id = int(offer.grade_id_platform)
    if grade_id is None and offer.grade_id_platform is not None:
        grade_id = int(offer.grade_id_platform)
    department_id = _coerce_optional_int(profile.get("department_id"), field_label="Department ID")
    join_date = profile.get("join_date") or offer.joining_date
    exit_date = profile.get("exit_date")
    person_status = _clean_optional_text(profile.get("status")) or "working"
    source_system = _clean_optional_text(profile.get("source_system")) or "recruitment"

    full_name = _clean_optional_text(profile.get("full_name"))
    if not full_name:
        full_name = " ".join(part for part in [first_name, last_name] if part).strip()
    display_name = _clean_optional_text(profile.get("display_name")) or full_name

    person_id = f"REC_{candidate.candidate_id}"
    now = datetime.utcnow()
    async with PlatformSessionLocal() as platform_session:
        person_code_conflict = (
            await platform_session.execute(
                select(DimPerson.person_id).where(
                    DimPerson.person_code == person_code,
                    DimPerson.person_id != person_id,
                    active_status_filter(),
                )
            )
        ).scalars().first()
        if person_code_conflict:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Employee ID is already assigned to another active employee.",
            )

        email_conflict = (
            await platform_session.execute(
                select(DimPerson.person_id).where(
                    DimPerson.email == email,
                    DimPerson.person_id != person_id,
                    active_status_filter(),
                )
            )
        ).scalars().first()
        if email_conflict:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email is already assigned to another active employee.",
            )

        existing = await platform_session.get(DimPerson, person_id)
        if existing:
            existing.person_code = person_code
            existing.personal_id = personal_id
            existing.email = email
            existing.first_name = first_name
            existing.last_name = last_name
            existing.mobile_number = mobile_number
            existing.role_id = role_id
            existing.grade_id = grade_id
            existing.department_id = department_id
            existing.manager_id = manager_id
            existing.employment_type = employment_type
            existing.join_date = join_date
            existing.exit_date = exit_date
            existing.status = person_status
            existing.source_system = source_system
            existing.full_name = full_name
            existing.display_name = display_name
            existing.is_deleted = 0
            existing.updated_at = now
        else:
            person = DimPerson(
                person_id=person_id,
                person_code=person_code,
                personal_id=personal_id,
                email=email,
                first_name=first_name,
                last_name=last_name,
                mobile_number=mobile_number,
                role_id=role_id,
                grade_id=grade_id,
                department_id=department_id,
                manager_id=manager_id,
                employment_type=employment_type,
                join_date=join_date,
                exit_date=exit_date,
                status=person_status,
                is_deleted=0,
                created_at=now,
                updated_at=now,
                source_system=source_system,
                full_name=full_name,
                display_name=display_name,
            )
            platform_session.add(person)
        await platform_session.commit()

    candidate.hired_person_id_platform = int("".join(filter(str.isdigit, person_id)) or candidate.candidate_id)
    candidate.final_decision = "hired"
    candidate.status = "hired"
    candidate.updated_at = now

    await apply_stage_transition(
        session,
        candidate=candidate,
        to_stage="hired",
        decision="advance",
        note="offer_flow",
        user=user,
        source="candidate_convert",
    )
    await session.flush()
    await _sync_opening_counts_for_hire(session, opening_id=candidate.opening_id, user=user)

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
        except Exception as exc:  # noqa: BLE001
            await log_event(
                session,
                candidate_id=candidate.candidate_id,
                action_type="drive_folder_move_failed",
                performed_by_person_id_platform=_platform_person_id(user),
                related_entity_type="candidate",
                related_entity_id=candidate.candidate_id,
                meta_json=_event_meta(user, {"bucket": "Appointed", "error": str(exc)}),
            )
            await enqueue_operation(
                session,
                operation_type=OP_DRIVE_MOVE_FOLDER,
                payload={
                    "folder_id": candidate.drive_folder_id,
                    "target_bucket": "Appointed",
                },
                candidate_id=candidate.candidate_id,
                related_entity_type="candidate",
                related_entity_id=candidate.candidate_id,
                idempotency_key=f"drive_move_appointed:{candidate.candidate_id}",
            )

    await log_event(
        session,
        candidate_id=candidate.candidate_id,
        action_type="candidate_converted_to_employee",
        performed_by_person_id_platform=_platform_person_id(user),
        related_entity_type="candidate",
        related_entity_id=candidate.candidate_id,
        meta_json=_event_meta(user, {"person_id_platform": person_id, "person_code": person_code, "email": email}),
    )
    return candidate
