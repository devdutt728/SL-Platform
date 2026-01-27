from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
import base64
import hashlib
import hmac
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
from app.models.screening import RecCandidateScreening
from app.schemas.user import UserContext
from app.core.config import settings
from app.core.paths import resolve_repo_path
from app.services.drive import move_candidate_folder, upload_offer_doc
from app.services.events import log_event
from app.services.platform_identity import active_status_filter


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

def _public_origin() -> str:
    if settings.public_app_origin:
        return settings.public_app_origin.rstrip("/")
    return ""

def _public_base_path() -> str:
    base_path = (settings.public_app_base_path or "").strip()
    if not base_path:
        return ""
    if not base_path.startswith("/"):
        base_path = f"/{base_path}"
    return base_path.rstrip("/")

def _offer_public_link(token: str) -> str:
    base = _public_origin()
    prefix = _public_base_path()
    path = f"{prefix}/offer/{token}" if prefix else f"/offer/{token}"
    return f"{base}{path}" if base else path

def _offer_public_pdf_link(token: str) -> str:
    base = _public_origin()
    prefix = _public_base_path()
    path = f"{prefix}/api/offer/{token}/pdf" if prefix else f"/api/offer/{token}/pdf"
    return f"{base}{path}" if base else path

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
    if candidate:
        try:
            screening = (
                await session.execute(
                    select(RecCandidateScreening.current_city).where(RecCandidateScreening.candidate_id == candidate.candidate_id)
                )
            ).scalar_one_or_none()
            if screening:
                return screening
        except Exception:
            pass
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
    candidate = await session.get(RecCandidate, offer.candidate_id)
    if normalized == "accept":
        offer.offer_status = "accepted"
        offer.accepted_at = now
        action = "offer_accepted"
        if candidate:
            candidate.status = "offer"
            candidate.final_decision = None
            candidate.updated_at = now
            await _transition_stage(session, candidate_id=candidate.candidate_id, to_stage="joining_documents", user=None)
    else:
        offer.offer_status = "declined"
        offer.declined_at = now
        action = "offer_declined"
        if candidate:
            candidate.status = "declined"
            candidate.final_decision = "declined"
            candidate.updated_at = now
            await _transition_stage(session, candidate_id=candidate.candidate_id, to_stage="declined", user=None)
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
