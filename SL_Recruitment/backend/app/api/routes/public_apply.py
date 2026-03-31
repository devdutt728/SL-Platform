from datetime import datetime, timedelta
import hashlib
import json
from pathlib import Path
from uuid import uuid4

import anyio
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, EmailStr
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.models.apply_idempotency import RecApplyIdempotency
from app.models.candidate import RecCandidate
from app.models.candidate_ingest_attempt import RecCandidateIngestAttempt
from app.models.opening import RecOpening
from app.models.screening import RecCandidateScreening
from app.services.candidate_codes import assign_candidate_code, ensure_candidate_code_registered
from app.services.drive import create_candidate_folder, upload_application_doc
from app.services.email import send_email
from app.services.external_documents import download_external_document
from app.services.events import log_event
from app.services.opening_config import get_opening_config
from app.services.recruitment_forms import (
    BASIC_DETAILS_FORM_LINK_GENERATED,
    build_basic_details_form_link,
    build_basic_details_form_path,
    get_basic_details_form_submitted_at,
    get_basic_details_form_token,
    set_basic_details_form_sent_at,
    set_basic_details_form_submitted_at,
    set_basic_details_form_token,
    sync_basic_details_form_fields,
)
from app.services.screening_rules import evaluate_screening
from app.services.stage_transitions import apply_stage_transition
from app.services.workflow_policy import workflow_policy_for_opening
from app.services.jd_assets import resolve_opening_jd_asset
from app.schemas.screening import ScreeningUpsertIn
from app.core.config import settings
from app.core.uploads import DOC_EXTENSIONS, DOC_MIME_TYPES, SPRINT_EXTENSIONS, SPRINT_MIME_TYPES, sanitize_filename, validate_upload

router = APIRouter(prefix="/apply", tags=["apply"])

IDEMPOTENCY_TTL = timedelta(hours=24)
RATE_LIMIT_WINDOW = timedelta(minutes=1)
RATE_LIMIT_MAX = 5
APPLICATION_DOC_MAX_BYTES = 50 * 1024 * 1024
PUBLIC_APPLY_DUPLICATE_WINDOW = timedelta(hours=24)


class PublicApplyIn(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    phone: str | None = None
    cv_url: str | None = None
    portfolio_url: str | None = None
    resume_url: str | None = None


class PublicApplyOut(BaseModel):
    candidate_id: int
    candidate_code: str | None = None
    basic_details_form_token: str | None = None
    basic_details_form_url: str | None = None
    caf_token: str | None = None
    caf_url: str | None = None
    screening_result: str | None = None
    already_applied: bool = False
    reapplied: bool = False


class OpeningApplyPrefillOut(BaseModel):
    opening_id: int
    opening_code: str
    opening_title: str | None = None
    opening_description: str | None = None
    location_city: str | None = None
    location_country: str | None = None
    jd_available: bool = False
    jd_display_name: str | None = None
    is_active: bool | None = None


class OpeningPublicListItemOut(BaseModel):
    opening_code: str
    opening_title: str | None = None
    jd_available: bool = False
    jd_display_name: str | None = None
    is_active: bool | None = None
    location_city: str | None = None
    location_country: str | None = None
    headcount_required: int | None = None


def _candidate_code(candidate_id: int) -> str:
    return f"SLR-{candidate_id:04d}"


def _client_ip(request: Request) -> str | None:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        # Take the left-most entry: original client.
        return xff.split(",")[0].strip() or None
    xrip = request.headers.get("x-real-ip")
    if xrip:
        return xrip.strip() or None
    return request.client.host if request.client else None


def _hash_request(payload: dict) -> str:
    raw = json.dumps(payload, ensure_ascii=True, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _split_name(full_name: str) -> tuple[str, str | None]:
    parts = full_name.strip().split()
    if not parts:
        return "", None
    first = parts[0]
    last = " ".join(parts[1:]) or None
    return first, last


def _bool_or_none(raw: str | None) -> bool | None:
    if raw is None:
        return None
    val = raw.strip().lower()
    if val in {"yes", "true", "1", "on", "y"}:
        return True
    if val in {"no", "false", "0", "off", "n"}:
        return False
    return None


def _label_yes_no(value: bool | None) -> str:
    if value is None:
        return "—"
    return "Yes" if value else "No"


def _caf_expiry_note_parts() -> tuple[str, str]:
    hours = max(int(settings.caf_expiry_hours or 0), 0)
    if hours <= 0:
        hours = max(int(settings.caf_expiry_days or 0), 0) * 24
    if hours > 0 and hours % 24 == 0:
        days = hours // 24
        label = f"{days} {'day' if days == 1 else 'days'}"
    elif hours > 0:
        label = f"{hours} {'hour' if hours == 1 else 'hours'}"
    else:
        label = ""
    note = (
        f"This secure link will expire in {label}."
        if label
        else "This secure link may expire based on the recruitment workflow timeline."
    )
    return label, note


def _strip_optional(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def _truncate_text(value: str | None, *, max_len: int = 500) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    if len(text) <= max_len:
        return text
    if max_len <= 3:
        return text[:max_len]
    return f"{text[: max_len - 3]}..."


def _normalize_external_source_ref(value: str | None) -> str | None:
    cleaned = _strip_optional(value)
    if cleaned is None:
        return None
    return cleaned[:191]


def _safe_payload_json(payload: dict[str, object]) -> str:
    try:
        return _truncate_text(json.dumps(payload, ensure_ascii=True, default=str), max_len=4000) or "{}"
    except Exception:
        return "{}"


def _derive_public_apply_external_ref(*, opening_code: str, email_normalized: str, idempotency_key: str) -> str:
    fingerprint = "|".join(
        [
            "public_apply",
            opening_code.strip().lower(),
            email_normalized.strip().lower(),
            idempotency_key.strip(),
        ]
    )
    digest = hashlib.sha256(fingerprint.encode("utf-8")).hexdigest()[:40]
    return f"apply:{digest}"


def _is_recent_public_apply_duplicate(candidate: RecCandidate, *, now: datetime) -> bool:
    marker = candidate.created_at or candidate.updated_at
    if marker is None:
        return True
    return marker >= (now - PUBLIC_APPLY_DUPLICATE_WINDOW)


async def _record_public_apply_attempt(
    session: AsyncSession,
    *,
    opening_id: int | None,
    opening_code: str,
    email_normalized: str,
    external_source_ref: str | None,
    attempt_status: str,
    candidate_id: int | None,
    message: str | None,
    idempotency_key: str | None,
    attempted_at: datetime,
    request_payload: dict[str, object],
) -> None:
    try:
        async with session.begin_nested():
            session.add(
                RecCandidateIngestAttempt(
                    source_origin="public_apply",
                    sheet_id=None,
                    sheet_name=None,
                    batch_id=None,
                    row_key=_truncate_text(idempotency_key, max_len=64),
                    opening_id=opening_id,
                    opening_code=_truncate_text(opening_code, max_len=100),
                    email_normalized=email_normalized,
                    external_source_ref=_normalize_external_source_ref(external_source_ref),
                    attempt_status=(attempt_status or "error").strip()[:32],
                    candidate_id=candidate_id,
                    message=_truncate_text(message, max_len=500),
                    payload_json=_safe_payload_json(request_payload),
                    attempted_at=attempted_at,
                    created_at=attempted_at,
                )
            )
            await session.flush()
    except OperationalError:
        return


def _compose_full_name(first_name: str, last_name: str | None) -> str:
    first = (first_name or "").strip()
    last = (last_name or "").strip()
    return f"{first} {last}".strip() or first


def _application_docs_status(*, cv_url: str | None, portfolio_url: str | None, resume_url: str | None) -> str:
    count = sum(1 for value in [cv_url, portfolio_url, resume_url] if value)
    if count <= 0:
        return "none"
    if count >= 3:
        return "complete"
    return "partial"


def _parse_years_of_experience(raw: str | None) -> float | None:
    cleaned = _strip_optional(raw)
    if cleaned is None:
        return None
    try:
        years = float(cleaned)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Years of experience must be a number.",
        )
    if years < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Years of experience cannot be negative.",
        )
    return years


def _download_external_file(url: str, *, max_bytes: int) -> tuple[bytes, str, str]:
    downloaded = download_external_document(
        url,
        max_bytes=max_bytes,
        user_agent="SL-Recruitment-Apply/1.0",
    )
    return downloaded.data, downloaded.filename, downloaded.content_type


def _validate_external_document(kind: str, filename: str, content_type: str) -> str:
    ext = Path(filename).suffix.lower()
    if kind == "portfolio":
        allowed_extensions = SPRINT_EXTENSIONS
        allowed_mime_types = SPRINT_MIME_TYPES
    else:
        allowed_extensions = DOC_EXTENSIONS
        allowed_mime_types = DOC_MIME_TYPES
    if ext and ext not in allowed_extensions:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unsupported {kind} file type.")

    normalized_type = (content_type or "").split(";", 1)[0].strip().lower()
    if normalized_type and normalized_type not in allowed_mime_types and normalized_type not in {"application/octet-stream", "binary/octet-stream"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unsupported {kind} content type.")

    return sanitize_filename(filename, default=f"{kind}.pdf")


@router.get("", response_model=list[OpeningPublicListItemOut])
async def list_public_openings(session: AsyncSession = Depends(deps.get_db_session)):
    rows = (
        await session.execute(
            select(RecOpening)
            .where(RecOpening.is_active == 1)
            .order_by(RecOpening.updated_at.is_(None), RecOpening.updated_at.desc(), RecOpening.opening_id.desc())
        )
    ).scalars().all()
    items: list[OpeningPublicListItemOut] = []
    for opening in rows:
        jd_asset = resolve_opening_jd_asset(opening)
        items.append(
            OpeningPublicListItemOut(
                opening_code=opening.opening_code,
                opening_title=opening.title,
                jd_available=jd_asset is not None,
                jd_display_name=jd_asset.display_name if jd_asset else None,
                is_active=bool(opening.is_active) if opening.is_active is not None else None,
                location_city=opening.location_city,
                location_country=opening.location_country,
                headcount_required=opening.headcount_required,
            )
        )
    return items


@router.get("/{opening_code}/jd")
async def get_opening_jd(
    opening_code: str,
    download: bool = Query(False),
    session: AsyncSession = Depends(deps.get_db_session),
):
    opening = (
        await session.execute(select(RecOpening).where(RecOpening.opening_code == opening_code))
    ).scalars().first()
    if not opening or not bool(opening.is_active):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not available")
    jd_asset = resolve_opening_jd_asset(opening)
    if not jd_asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job description not available")
    disposition = "attachment" if download else "inline"
    return FileResponse(
        path=jd_asset.path,
        media_type="application/pdf",
        filename=sanitize_filename(jd_asset.file_name, default=f"{opening.opening_code}-jd.pdf"),
        headers={"content-disposition": f'{disposition}; filename="{sanitize_filename(jd_asset.file_name, default=f"{opening.opening_code}-jd.pdf")}"'},
    )


@router.get("/{opening_code}", response_model=OpeningApplyPrefillOut)
async def get_opening_apply_prefill(
    opening_code: str,
    session: AsyncSession = Depends(deps.get_db_session),
):
    opening = (
        await session.execute(select(RecOpening).where(RecOpening.opening_code == opening_code))
    ).scalars().first()
    if not opening or not bool(opening.is_active):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not available")
    workflow_policy = workflow_policy_for_opening(opening)
    jd_asset = resolve_opening_jd_asset(opening)
    return OpeningApplyPrefillOut(
        opening_id=opening.opening_id,
        opening_code=opening_code,
        opening_title=opening.title,
        opening_description=opening.description,
        location_city=opening.location_city,
        location_country=opening.location_country,
        jd_available=jd_asset is not None,
        jd_display_name=jd_asset.display_name if jd_asset else None,
        is_active=bool(opening.is_active) if opening.is_active is not None else None,
    )


@router.post("/{opening_code}", response_model=PublicApplyOut, status_code=status.HTTP_201_CREATED)
async def apply_for_opening(
    opening_code: str,
    request: Request,
    first_name: str | None = Form(default=None),
    last_name: str | None = Form(default=None),
    name: str | None = Form(default=None),
    email: EmailStr = Form(...),
    phone: str | None = Form(default=None),
    note: str | None = Form(default=None),
    educational_qualification: str | None = Form(default=None),
    years_of_experience: str | None = Form(default=None),
    city: str | None = Form(default=None),
    willing_to_relocate: str | None = Form(default=None),
    terms_consent: str | None = Form(default=None),
    questions_from_candidate: str | None = Form(default=None),
    gender_identity: str | None = Form(default=None),
    gender_self_describe: str | None = Form(default=None),
    cv_url: str | None = Form(default=None),
    portfolio_url: str | None = Form(default=None),
    resume_url: str | None = Form(default=None),
    cv_file: UploadFile | None = File(default=None),
    portfolio_file: UploadFile | None = File(default=None),
    resume_file: UploadFile | None = File(default=None),
    session: AsyncSession = Depends(deps.get_db_session),
):
    first_name_clean = _strip_optional(first_name)
    last_name_clean = _strip_optional(last_name)
    if not first_name_clean or not last_name_clean:
        legacy_name = _strip_optional(name)
        if legacy_name:
            parsed_first, parsed_last = _split_name(legacy_name)
            first_name_clean = first_name_clean or _strip_optional(parsed_first)
            last_name_clean = last_name_clean or _strip_optional(parsed_last)
    if not first_name_clean or not last_name_clean:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="First name and last name are required.",
        )

    terms_accepted = _bool_or_none(terms_consent)
    if terms_accepted is not True:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please accept the recruitment data consent terms.",
        )

    cv_source_url = _strip_optional(cv_url)
    portfolio_source_url = _strip_optional(portfolio_url)
    resume_source_url = _strip_optional(resume_url)
    has_cv_file = bool(cv_file and (cv_file.filename or "").strip())
    has_portfolio_file = bool(portfolio_file and (portfolio_file.filename or "").strip())
    has_resume_file = bool(resume_file and (resume_file.filename or "").strip())
    if not has_portfolio_file and not portfolio_source_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Portfolio is mandatory. Upload a portfolio or provide a valid URL.",
        )

    years_of_experience_value = _parse_years_of_experience(years_of_experience)
    educational_qualification_value = _strip_optional(educational_qualification)
    city_value = _strip_optional(city)
    phone_value = _strip_optional(phone)
    note_value = _strip_optional(note)
    questions_value = _strip_optional(questions_from_candidate)

    idempotency_key = (request.headers.get("idempotency-key") or request.headers.get("Idempotency-Key") or "").strip()
    if not idempotency_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing Idempotency-Key header.",
        )

    opening = (
        await session.execute(select(RecOpening).where(RecOpening.opening_code == opening_code))
    ).scalars().first()
    if not opening or not bool(opening.is_active):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not available")

    now = datetime.utcnow()
    email_normalized = str(email).strip().lower()
    ip_address = _client_ip(request)

    # Basic abuse protection: per-IP and per-email throttling.
    cutoff = now - RATE_LIMIT_WINDOW
    if ip_address:
        ip_hits = (
            await session.execute(
                select(func.count(RecApplyIdempotency.id)).where(
                    RecApplyIdempotency.ip_address == ip_address,
                    RecApplyIdempotency.created_at >= cutoff,
                )
            )
        ).scalar_one()
        if ip_hits >= RATE_LIMIT_MAX:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many submission attempts. Please wait a minute and try again.",
            )

    email_hits = (
        await session.execute(
            select(func.count(RecApplyIdempotency.id)).where(
                RecApplyIdempotency.email_normalized == email_normalized,
                RecApplyIdempotency.created_at >= cutoff,
            )
        )
    ).scalar_one()
    if email_hits >= RATE_LIMIT_MAX:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many submission attempts. Please wait a minute and try again.",
        )

    request_payload: dict[str, object] = {
        "opening_code": opening_code,
        "email": email_normalized,
        "first_name": first_name_clean,
        "last_name": last_name_clean,
        "phone": phone_value,
        "note": note_value,
        "educational_qualification": educational_qualification_value,
        "years_of_experience": years_of_experience_value,
        "city": city_value,
        "questions_from_candidate": questions_value,
        "willing_to_relocate": _strip_optional(willing_to_relocate),
        "terms_consent": terms_accepted,
        "gender_identity": _strip_optional(gender_identity),
        "gender_self_describe": _strip_optional(gender_self_describe),
        "cv_filename": cv_file.filename if has_cv_file else None,
        "portfolio_filename": portfolio_file.filename if has_portfolio_file else None,
        "resume_filename": resume_file.filename if has_resume_file else None,
        "cv_url": cv_source_url,
        "portfolio_url": portfolio_source_url,
        "resume_url": resume_source_url,
    }
    request_hash = _hash_request(request_payload)
    external_source_ref = _derive_public_apply_external_ref(
        opening_code=opening_code,
        email_normalized=email_normalized,
        idempotency_key=idempotency_key,
    )

    existing_idem = (
        await session.execute(select(RecApplyIdempotency).where(RecApplyIdempotency.idempotency_key == idempotency_key))
    ).scalars().first()
    if existing_idem:
        if existing_idem.request_hash != request_hash:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Idempotency-Key has already been used with a different payload.",
            )
        if existing_idem.status_code is not None and existing_idem.response_json:
            try:
                return JSONResponse(
                    content=json.loads(existing_idem.response_json),
                    status_code=existing_idem.status_code,
                )
            except Exception:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Submission already completed; stored response could not be loaded.",
                )
        if existing_idem.created_at < now - IDEMPOTENCY_TTL:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Previous submission is too old; please refresh the page and try again.",
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Submission already in progress. Please wait and try again.",
        )

    idem = RecApplyIdempotency(
        idempotency_key=idempotency_key,
        request_hash=request_hash,
        opening_code=opening_code,
        email_normalized=email_normalized,
        ip_address=ip_address,
        created_at=now,
        updated_at=now,
    )
    session.add(idem)
    await session.flush()

    existing_candidate = (
        await session.execute(
            select(RecCandidate)
            .where(
                RecCandidate.opening_id == opening.opening_id,
                func.lower(RecCandidate.email) == email_normalized,
            )
            .order_by(RecCandidate.candidate_id.desc())
            .limit(1)
        )
    ).scalars().first()
    if existing_candidate and _is_recent_public_apply_duplicate(existing_candidate, now=now):
        duplicate_message = "Candidate already exists for this opening/email within last 24 hours."
        sync_basic_details_form_fields(existing_candidate)
        basic_details_form_token_existing = get_basic_details_form_token(existing_candidate) or uuid4().hex if workflow_policy.requires_caf else None
        if workflow_policy.requires_caf and get_basic_details_form_token(existing_candidate) != basic_details_form_token_existing:
            set_basic_details_form_token(existing_candidate, basic_details_form_token_existing)
            set_basic_details_form_sent_at(existing_candidate, now)
            existing_candidate.updated_at = now
            await log_event(
                session,
                candidate_id=existing_candidate.candidate_id,
                action_type=BASIC_DETAILS_FORM_LINK_GENERATED,
                performed_by_person_id_platform=None,
                related_entity_type="candidate",
                related_entity_id=existing_candidate.candidate_id,
                meta_json={
                    "basic_details_form_token": basic_details_form_token_existing,
                    "caf_token": basic_details_form_token_existing,
                    "reason": "apply_deduped",
                },
            )
        if not existing_candidate.source_channel:
            existing_candidate.source_channel = "website"
        if not existing_candidate.source_origin:
            existing_candidate.source_origin = "public_apply"
        if not existing_candidate.external_source_ref:
            existing_candidate.external_source_ref = external_source_ref
        await _record_public_apply_attempt(
            session,
            opening_id=opening.opening_id,
            opening_code=opening_code,
            email_normalized=email_normalized,
            external_source_ref=external_source_ref,
            attempt_status="duplicate_recent",
            candidate_id=existing_candidate.candidate_id,
            message=duplicate_message,
            idempotency_key=idempotency_key,
            attempted_at=now,
            request_payload=request_payload,
        )
        response_payload = PublicApplyOut(
            candidate_id=existing_candidate.candidate_id,
            candidate_code=existing_candidate.candidate_code,
            basic_details_form_token=basic_details_form_token_existing,
            basic_details_form_url=build_basic_details_form_path(basic_details_form_token_existing) if basic_details_form_token_existing else None,
            caf_token=basic_details_form_token_existing,
            caf_url=build_basic_details_form_path(basic_details_form_token_existing) if basic_details_form_token_existing else None,
            screening_result=None,
            already_applied=True,
            reapplied=False,
        ).model_dump()
        idem.status_code = status.HTTP_200_OK
        idem.response_json = json.dumps(response_payload, ensure_ascii=True)
        idem.updated_at = now
        await session.commit()
        return JSONResponse(content=response_payload, status_code=status.HTTP_200_OK)

    is_reapplied = bool(existing_candidate)
    candidate: RecCandidate
    basic_details_form_token: str | None
    if existing_candidate:
        candidate = existing_candidate
        sync_basic_details_form_fields(candidate)
        basic_details_form_token = get_basic_details_form_token(candidate) or uuid4().hex if workflow_policy.requires_caf else None
        candidate.first_name = first_name_clean
        candidate.last_name = last_name_clean
        candidate.full_name = _compose_full_name(first_name_clean, last_name_clean)
        candidate.email = email_normalized
        candidate.phone = phone_value
        candidate.source_channel = "website"
        candidate.source_origin = "public_apply"
        candidate.external_source_ref = external_source_ref
        candidate.opening_id = opening.opening_id
        candidate.educational_qualification = educational_qualification_value
        candidate.years_of_experience = years_of_experience_value
        candidate.city = city_value
        candidate.current_location = city_value
        candidate.terms_consent = True
        candidate.terms_consent_at = now
        candidate.cv_url = cv_source_url or candidate.cv_url
        candidate.portfolio_url = portfolio_source_url or candidate.portfolio_url
        candidate.resume_url = resume_source_url or candidate.resume_url
        candidate.questions_from_candidate = questions_value
        if workflow_policy.requires_caf:
            set_basic_details_form_token(candidate, basic_details_form_token)
            set_basic_details_form_sent_at(candidate, now)
            if get_basic_details_form_submitted_at(candidate) is None:
                set_basic_details_form_submitted_at(candidate, now)
        else:
            set_basic_details_form_token(candidate, None)
            set_basic_details_form_sent_at(candidate, None)
            set_basic_details_form_submitted_at(candidate, None)
        candidate.updated_at = now
        candidate.application_docs_status = _application_docs_status(
            cv_url=cv_source_url if has_cv_file or cv_source_url else candidate.cv_url,
            portfolio_url=portfolio_source_url if has_portfolio_file or portfolio_source_url else candidate.portfolio_url,
            resume_url=resume_source_url if has_resume_file or resume_source_url else candidate.resume_url,
        )
        if not candidate.candidate_code:
            candidate.candidate_code = _candidate_code(candidate.candidate_id)
        await ensure_candidate_code_registered(session, candidate)

        await log_event(
            session,
            candidate_id=candidate.candidate_id,
            action_type="public_apply_reapplied",
            performed_by_person_id_platform=None,
            related_entity_type="candidate",
            related_entity_id=candidate.candidate_id,
            meta_json={
                "opening_id": opening.opening_id,
                "opening_code": opening_code,
                "idempotency_key": idempotency_key,
                "external_source_ref": external_source_ref,
            },
        )
        if workflow_policy.requires_caf and basic_details_form_token:
            await log_event(
                session,
                candidate_id=candidate.candidate_id,
                action_type=BASIC_DETAILS_FORM_LINK_GENERATED,
                performed_by_person_id_platform=None,
                related_entity_type="candidate",
                related_entity_id=candidate.candidate_id,
                meta_json={
                    "basic_details_form_token": basic_details_form_token,
                    "caf_token": basic_details_form_token,
                    "reason": "public_apply_reapply",
                },
            )
    else:
        basic_details_form_token = uuid4().hex if workflow_policy.requires_caf else None
        full_name = _compose_full_name(first_name_clean, last_name_clean)
        application_docs_status = _application_docs_status(
            cv_url=cv_source_url if has_cv_file or cv_source_url else None,
            portfolio_url=portfolio_source_url if has_portfolio_file or portfolio_source_url else None,
            resume_url=resume_source_url if has_resume_file or resume_source_url else None,
        )
        candidate = RecCandidate(
            # Leave unset until the allocator assigns the real SLR code.
            candidate_code="",
            first_name=first_name_clean,
            last_name=last_name_clean,
            full_name=full_name,
            email=email_normalized,
            phone=phone_value,
            source_channel="website",
            source_origin="public_apply",
            external_source_ref=external_source_ref,
            opening_id=opening.opening_id,
            educational_qualification=educational_qualification_value,
            years_of_experience=years_of_experience_value,
            city=city_value,
            current_location=city_value,
            terms_consent=True,
            terms_consent_at=now,
            status="enquiry",
            cv_url=cv_source_url,
            portfolio_url=portfolio_source_url,
            resume_url=resume_source_url,
            application_docs_status=application_docs_status,
            joining_docs_status="none",
            created_at=now,
            updated_at=now,
        )
        if workflow_policy.requires_caf:
            set_basic_details_form_token(candidate, basic_details_form_token)
            set_basic_details_form_sent_at(candidate, now)
            set_basic_details_form_submitted_at(candidate, now)
        try:
            await assign_candidate_code(session, candidate, legacy_code_factory=_candidate_code)
        except IntegrityError:
            await session.rollback()
            existing_candidate = (
                await session.execute(
                    select(RecCandidate)
                    .where(
                        RecCandidate.opening_id == opening.opening_id,
                        func.lower(RecCandidate.email) == email_normalized,
                    )
                    .order_by(RecCandidate.candidate_id.desc())
                    .limit(1)
                )
            ).scalars().first()
            if existing_candidate:
                sync_basic_details_form_fields(existing_candidate)
                basic_details_form_token_existing = get_basic_details_form_token(existing_candidate) or uuid4().hex if workflow_policy.requires_caf else None
                if workflow_policy.requires_caf:
                    candidate_changed = False
                    if get_basic_details_form_token(existing_candidate) != basic_details_form_token_existing:
                        set_basic_details_form_token(existing_candidate, basic_details_form_token_existing)
                        candidate_changed = True
                    if existing_candidate.basic_details_form_sent_at is None:
                        set_basic_details_form_sent_at(existing_candidate, now)
                        candidate_changed = True
                    if get_basic_details_form_submitted_at(existing_candidate) is None:
                        set_basic_details_form_submitted_at(existing_candidate, now)
                        candidate_changed = True
                    if candidate_changed:
                        existing_candidate.updated_at = now
                response_payload = PublicApplyOut(
                    candidate_id=existing_candidate.candidate_id,
                    candidate_code=existing_candidate.candidate_code,
                    basic_details_form_token=basic_details_form_token_existing,
                    basic_details_form_url=build_basic_details_form_path(basic_details_form_token_existing) if basic_details_form_token_existing else None,
                    caf_token=basic_details_form_token_existing,
                    caf_url=build_basic_details_form_path(basic_details_form_token_existing) if basic_details_form_token_existing else None,
                    screening_result=None,
                    already_applied=True,
                    reapplied=False,
                ).model_dump()
                try:
                    session.add(
                        RecApplyIdempotency(
                            idempotency_key=idempotency_key,
                            request_hash=request_hash,
                            opening_code=opening_code,
                            email_normalized=email_normalized,
                            ip_address=ip_address,
                            status_code=status.HTTP_200_OK,
                            response_json=json.dumps(response_payload, ensure_ascii=True),
                            created_at=now,
                            updated_at=now,
                        )
                    )
                    await _record_public_apply_attempt(
                        session,
                        opening_id=opening.opening_id,
                        opening_code=opening_code,
                        email_normalized=email_normalized,
                        external_source_ref=external_source_ref,
                        attempt_status="duplicate_recent",
                        candidate_id=existing_candidate.candidate_id,
                        message="Candidate already exists for this opening/email within last 24 hours.",
                        idempotency_key=idempotency_key,
                        attempted_at=now,
                        request_payload=request_payload,
                    )
                    await session.commit()
                except Exception:
                    await session.rollback()
                return JSONResponse(content=response_payload, status_code=status.HTTP_200_OK)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An application with this email already exists for this opening.",
            )

    if not is_reapplied:
        await apply_stage_transition(
            session,
            candidate=candidate,
            to_stage="enquiry",
            reason="system_init",
            note="system_init",
            source="public_apply",
        )

        await log_event(
            session,
            candidate_id=candidate.candidate_id,
            action_type="candidate_created",
            performed_by_person_id_platform=None,
            related_entity_type="candidate",
            related_entity_id=candidate.candidate_id,
            meta_json={
                "source_channel": "website",
                "opening_id": opening.opening_id,
                "opening_code": opening_code,
                "note": note_value,
                "city": city_value,
                "educational_qualification": educational_qualification_value,
                "years_of_experience": years_of_experience_value,
                "terms_consent": True,
            },
        )
        if workflow_policy.requires_caf and basic_details_form_token:
            await log_event(
                session,
                candidate_id=candidate.candidate_id,
                action_type=BASIC_DETAILS_FORM_LINK_GENERATED,
                performed_by_person_id_platform=None,
                related_entity_type="candidate",
                related_entity_id=candidate.candidate_id,
                meta_json={
                    "basic_details_form_token": basic_details_form_token,
                    "caf_token": basic_details_form_token,
                },
            )

    # Re-use existing folder for reapply; create only if missing.
    drive_folder_id = _strip_optional(candidate.drive_folder_id)
    drive_folder_url = _strip_optional(candidate.drive_folder_url)
    if not drive_folder_id:
        try:
            folder_id, folder_url = await anyio.to_thread.run_sync(
                create_candidate_folder, candidate.candidate_code, candidate.full_name or candidate.first_name
            )
            candidate.drive_folder_id = drive_folder_id = folder_id
            candidate.drive_folder_url = drive_folder_url = folder_url
            await log_event(
                session,
                candidate_id=candidate.candidate_id,
                action_type="drive_folder_created",
                performed_by_person_id_platform=None,
                related_entity_type="candidate",
                related_entity_id=candidate.candidate_id,
                meta_json={"drive_folder_id": folder_id, "drive_folder_url": folder_url},
            )
        except Exception as exc:
            await log_event(
                session,
                candidate_id=candidate.candidate_id,
                action_type="drive_folder_failed",
                performed_by_person_id_platform=None,
                related_entity_type="candidate",
                related_entity_id=candidate.candidate_id,
                meta_json={"error": str(exc)},
            )
            await session.rollback()
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Unable to create candidate folder in Drive. Please retry later.",
            )

    async def _upload_bytes(
        kind: str,
        *,
        filename: str,
        content_type: str,
        data: bytes,
    ) -> str:
        if not drive_folder_id:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Drive folder missing; please retry later.",
            )
        safe_name = sanitize_filename(filename, default=f"{kind}.pdf")
        stored_name = f"{candidate.candidate_code}-{kind}-{safe_name}"
        try:
            _, file_url = await anyio.to_thread.run_sync(
                lambda: upload_application_doc(
                    drive_folder_id,
                    filename=stored_name,
                    content_type=content_type or "application/octet-stream",
                    data=data,
                )
            )
            await log_event(
                session,
                candidate_id=candidate.candidate_id,
                action_type=f"{kind}_uploaded",
                performed_by_person_id_platform=None,
                related_entity_type="candidate",
                related_entity_id=candidate.candidate_id,
                meta_json={
                    "file_url": file_url,
                    "drive_folder_id": drive_folder_id,
                    "drive_folder_url": drive_folder_url,
                },
            )
            return file_url
        except Exception as exc:  # noqa: BLE001
            await log_event(
                session,
                candidate_id=candidate.candidate_id,
                action_type=f"{kind}_upload_failed",
                performed_by_person_id_platform=None,
                related_entity_type="candidate",
                related_entity_id=candidate.candidate_id,
                meta_json={
                    "error": str(exc),
                    "drive_folder_id": drive_folder_id,
                    "drive_folder_url": drive_folder_url,
                },
            )
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Unable to upload {kind} to Drive. Please retry later.",
            )

    async def _upload_file(
        kind: str,
        upload: UploadFile,
        max_bytes: int,
        *,
        allowed_extensions: set[str],
        allowed_mime_types: set[str],
    ) -> str:
        safe_name = validate_upload(upload, allowed_extensions=allowed_extensions, allowed_mime_types=allowed_mime_types)
        data = await upload.read()
        if len(data) > max_bytes:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{kind.upper()} file too large. Max allowed is {max_bytes // (1024 * 1024)}MB.",
            )
        return await _upload_bytes(
            kind,
            filename=safe_name,
            content_type=upload.content_type or "application/octet-stream",
            data=data,
        )

    async def _upload_remote(kind: str, source_url: str) -> str:
        max_bytes = APPLICATION_DOC_MAX_BYTES
        data, filename, content_type = await anyio.to_thread.run_sync(
            lambda: _download_external_file(source_url, max_bytes=max_bytes)
        )
        safe_name = _validate_external_document(kind, filename, content_type)
        return await _upload_bytes(
            kind,
            filename=safe_name,
            content_type=content_type,
            data=data,
        )

    cv_url: str | None = None
    portfolio_url: str | None = None
    resume_url_uploaded: str | None = None
    if has_cv_file and cv_file:
        cv_url = await _upload_file(
            "cv",
            cv_file,
            max_bytes=APPLICATION_DOC_MAX_BYTES,
            allowed_extensions=DOC_EXTENSIONS,
            allowed_mime_types=DOC_MIME_TYPES,
        )
    elif cv_source_url:
        cv_url = await _upload_remote("cv", cv_source_url)

    if has_portfolio_file and portfolio_file:
        portfolio_url = await _upload_file(
            "portfolio",
            portfolio_file,
            max_bytes=APPLICATION_DOC_MAX_BYTES,
            allowed_extensions=SPRINT_EXTENSIONS,
            allowed_mime_types=SPRINT_MIME_TYPES,
        )
    elif portfolio_source_url:
        portfolio_url = await _upload_remote("portfolio", portfolio_source_url)

    if has_resume_file and resume_file:
        resume_url_uploaded = await _upload_file(
            "resume",
            resume_file,
            max_bytes=APPLICATION_DOC_MAX_BYTES,
            allowed_extensions=DOC_EXTENSIONS,
            allowed_mime_types=DOC_MIME_TYPES,
        )
    elif resume_source_url:
        resume_url_uploaded = await _upload_remote("resume", resume_source_url)

    if not portfolio_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Portfolio upload failed. Please retry with a valid file/link.",
        )

    candidate.cv_url = cv_url or candidate.cv_url
    candidate.portfolio_url = portfolio_url or candidate.portfolio_url
    candidate.resume_url = resume_url_uploaded or candidate.resume_url
    candidate.portfolio_not_uploaded_reason = None
    candidate.application_docs_status = _application_docs_status(
        cv_url=candidate.cv_url,
        portfolio_url=candidate.portfolio_url,
        resume_url=candidate.resume_url,
    )
    candidate.questions_from_candidate = questions_value

    # Optionally capture screening data from the same form (do not mark CAF submitted here).
    willing_to_relocate_value = _strip_optional(willing_to_relocate)
    screening_data = {
        "willing_to_relocate": _bool_or_none(willing_to_relocate_value),
        "gender_identity": _strip_optional(gender_identity),
        "gender_self_describe": _strip_optional(gender_self_describe),
    }

    if willing_to_relocate_value is not None and screening_data["willing_to_relocate"] is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid value for willing_to_relocate. Use yes/no.",
        )

    decision: str | None = None
    # If any screening field is provided, upsert screening but do not mark CAF submitted.
    if any(value is not None for value in screening_data.values()):
        screening = (
            await session.execute(
                select(RecCandidateScreening).where(RecCandidateScreening.candidate_id == candidate.candidate_id)
            )
        ).scalars().first()
        screening_now = datetime.utcnow()
        if screening is None:
            screening = RecCandidateScreening(candidate_id=candidate.candidate_id, created_at=screening_now, updated_at=screening_now)
            session.add(screening)
        for key, value in screening_data.items():
            setattr(screening, key, value)
        screening.updated_at = screening_now

        opening_config = get_opening_config(candidate.opening_id)
        screening_input = ScreeningUpsertIn(**screening_data)
        decision = evaluate_screening(screening_input, opening_config)
        screening.screening_result = decision
        candidate.needs_hr_review = decision == "amber"

    response_payload = PublicApplyOut(
        candidate_id=candidate.candidate_id,
        candidate_code=candidate.candidate_code,
        basic_details_form_token=basic_details_form_token,
        basic_details_form_url=build_basic_details_form_path(basic_details_form_token) if basic_details_form_token else None,
        caf_token=basic_details_form_token,
        caf_url=build_basic_details_form_path(basic_details_form_token) if basic_details_form_token else None,
        screening_result=decision,
        already_applied=False,
        reapplied=is_reapplied,
    ).model_dump()

    caf_expiry_window, caf_expiry_note = _caf_expiry_note_parts()
    email_meta = await send_email(
        session,
        candidate_id=candidate.candidate_id,
        to_emails=[candidate.email],
        subject="Your Studio Lotus application links" if workflow_policy.requires_caf else "Your Studio Lotus application is received",
        template_name="application_links" if workflow_policy.requires_caf else "application_received",
        context={
            "candidate_name": candidate.full_name,
            "candidate_code": candidate.candidate_code,
            "caf_link": build_basic_details_form_link(basic_details_form_token) if basic_details_form_token else "",
            "candidate_email": candidate.email,
            "candidate_phone": candidate.phone or "—",
            "willing_to_relocate": _label_yes_no(screening_data.get("willing_to_relocate")),
            "caf_expiry_window": caf_expiry_window,
            "caf_expiry_note": caf_expiry_note,
        },
        email_type="application_links",
        meta_extra={
            "basic_details_form_token": basic_details_form_token,
            "caf_token": basic_details_form_token,
            "reason": "public_apply_reapply" if is_reapplied else "public_apply",
        }
        if basic_details_form_token
        else {"reason": "public_apply_reapply" if is_reapplied else "public_apply"},
    )

    email_status = _strip_optional(str((email_meta or {}).get("status") or ""))
    email_error = _strip_optional(str((email_meta or {}).get("error") or ""))
    attempt_status = "reapplied" if is_reapplied else "created"
    attempt_message = "Candidate re-applied and profile refreshed." if is_reapplied else "Candidate created."
    if email_status == "sent":
        attempt_message = (
            "Candidate re-applied and application links email sent."
            if is_reapplied
            else "Candidate created and application links email sent."
        )
    elif email_status == "failed":
        attempt_message = (
            "Candidate re-applied, but application links email failed."
            if is_reapplied
            else "Candidate created, but application links email failed."
        )
    elif email_status == "skipped":
        attempt_message = (
            "Candidate re-applied, but application links email was skipped."
            if is_reapplied
            else "Candidate created, but application links email was skipped."
        )
    if email_error:
        attempt_message = f"{attempt_message} ({email_error})"

    await _record_public_apply_attempt(
        session,
        opening_id=opening.opening_id,
        opening_code=opening_code,
        email_normalized=email_normalized,
        external_source_ref=external_source_ref,
        attempt_status=attempt_status,
        candidate_id=candidate.candidate_id,
        message=attempt_message,
        idempotency_key=idempotency_key,
        attempted_at=datetime.utcnow(),
        request_payload=request_payload,
    )

    idem.status_code = status.HTTP_201_CREATED
    idem.response_json = json.dumps(response_payload, ensure_ascii=True)
    idem.updated_at = datetime.utcnow()

    await session.commit()
    return JSONResponse(content=response_payload, status_code=status.HTTP_201_CREATED)
