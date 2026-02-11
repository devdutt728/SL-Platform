from datetime import datetime, timedelta
import hashlib
import json
import mimetypes
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urlparse
from urllib.request import Request, urlopen
from uuid import uuid4

import anyio
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.models.apply_idempotency import RecApplyIdempotency
from app.models.candidate import RecCandidate
from app.models.candidate_assessment import RecCandidateAssessment
from app.models.opening import RecOpening
from app.models.screening import RecCandidateScreening
from app.services.drive import create_candidate_folder, upload_application_doc
from app.services.email import send_email
from app.services.events import log_event
from app.services.opening_config import get_opening_config
from app.services.screening_rules import evaluate_screening
from app.services.public_links import build_public_link, build_public_path
from app.services.stage_transitions import apply_stage_transition
from app.schemas.screening import ScreeningUpsertIn
from app.core.uploads import DOC_EXTENSIONS, DOC_MIME_TYPES, SPRINT_EXTENSIONS, SPRINT_MIME_TYPES, sanitize_filename, validate_upload

router = APIRouter(prefix="/apply", tags=["apply"])

IDEMPOTENCY_TTL = timedelta(hours=24)
RATE_LIMIT_WINDOW = timedelta(minutes=1)
RATE_LIMIT_MAX = 5
EXTERNAL_DOC_MAX_BYTES_DOC = 2 * 1024 * 1024
EXTERNAL_DOC_MAX_BYTES_PORTFOLIO = 10 * 1024 * 1024


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
    caf_token: str
    caf_url: str
    screening_result: str | None = None
    already_applied: bool = False


class OpeningApplyPrefillOut(BaseModel):
    opening_id: int
    opening_code: str
    opening_title: str | None = None
    opening_description: str | None = None
    is_active: bool | None = None


class OpeningPublicListItemOut(BaseModel):
    opening_code: str
    opening_title: str | None = None
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


def _strip_optional(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


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
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unsupported URL scheme for '{url}'.")

    request = Request(url, headers={"User-Agent": "SL-Recruitment-Apply/1.0"})
    try:
        with urlopen(request, timeout=25) as response:
            content_type = (response.headers.get_content_type() or "application/octet-stream").strip().lower()
            data = response.read(max_bytes + 1)
            if len(data) > max_bytes:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"File from '{url}' exceeds max allowed size.",
                )
    except HTTPException:
        raise
    except HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not download file '{url}' (HTTP {exc.code}).",
        )
    except URLError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not download file '{url}' ({exc.reason}).",
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not download file '{url}' ({exc}).",
        )

    raw_name = unquote(Path(parsed.path or "").name or "document")
    filename = sanitize_filename(raw_name, default="document")
    if "." not in filename:
        guessed_ext = mimetypes.guess_extension(content_type or "") or ""
        if guessed_ext:
            filename = f"{filename}{guessed_ext}"

    return data, filename, content_type or "application/octet-stream"


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
    return [
        OpeningPublicListItemOut(
            opening_code=o.opening_code,
            opening_title=o.title,
            is_active=bool(o.is_active) if o.is_active is not None else None,
            location_city=o.location_city,
            location_country=o.location_country,
            headcount_required=o.headcount_required,
        )
        for o in rows
    ]


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
    return OpeningApplyPrefillOut(
        opening_id=opening.opening_id,
        opening_code=opening_code,
        opening_title=opening.title,
        opening_description=opening.description,
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

    request_hash = _hash_request(
        {
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
    if existing_candidate:
        caf_token_existing = existing_candidate.caf_token or uuid4().hex
        if existing_candidate.caf_token != caf_token_existing:
            existing_candidate.caf_token = caf_token_existing
            existing_candidate.caf_sent_at = now
            existing_candidate.updated_at = now
            await log_event(
                session,
                candidate_id=existing_candidate.candidate_id,
                action_type="caf_link_generated",
                performed_by_person_id_platform=None,
                related_entity_type="candidate",
                related_entity_id=existing_candidate.candidate_id,
                meta_json={"caf_token": caf_token_existing, "reason": "apply_deduped"},
            )
        response_payload = PublicApplyOut(
            candidate_id=existing_candidate.candidate_id,
            candidate_code=existing_candidate.candidate_code,
            caf_token=caf_token_existing,
            caf_url=build_public_path(f"/caf/{caf_token_existing}"),
            screening_result=None,
            already_applied=True,
        ).model_dump()
        idem.status_code = status.HTTP_200_OK
        idem.response_json = json.dumps(response_payload, ensure_ascii=True)
        idem.updated_at = now
        await session.commit()
        return JSONResponse(content=response_payload, status_code=status.HTTP_200_OK)

    caf_token = uuid4().hex
    full_name = _compose_full_name(first_name_clean, last_name_clean)
    application_docs_status = _application_docs_status(
        cv_url=cv_source_url if has_cv_file or cv_source_url else None,
        portfolio_url=portfolio_source_url if has_portfolio_file or portfolio_source_url else None,
        resume_url=resume_source_url if has_resume_file or resume_source_url else None,
    )
    temp_candidate_code = uuid4().hex[:8].upper()

    candidate = RecCandidate(
        candidate_code=temp_candidate_code,
        first_name=first_name_clean,
        last_name=last_name_clean,
        full_name=full_name,
        email=email_normalized,
        phone=phone_value,
        source_channel="website",
        source_origin="public_apply",
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
        caf_token=caf_token,
        caf_sent_at=now,
        application_docs_status=application_docs_status,
        joining_docs_status="none",
        created_at=now,
        updated_at=now,
    )
    session.add(candidate)
    try:
        await session.flush()
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
            caf_token_existing = existing_candidate.caf_token or uuid4().hex
            if existing_candidate.caf_token != caf_token_existing:
                existing_candidate.caf_token = caf_token_existing
                existing_candidate.caf_sent_at = now
                existing_candidate.updated_at = now
            response_payload = PublicApplyOut(
                candidate_id=existing_candidate.candidate_id,
                candidate_code=existing_candidate.candidate_code,
                caf_token=caf_token_existing,
                caf_url=build_public_path(f"/caf/{caf_token_existing}"),
                screening_result=None,
                already_applied=True,
            ).model_dump()
            # Best-effort: persist idempotency completion.
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
                await session.commit()
            except Exception:
                await session.rollback()
            return JSONResponse(content=response_payload, status_code=status.HTTP_200_OK)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An application with this email already exists for this role.",
        )

    candidate.candidate_code = _candidate_code(candidate.candidate_id)
    await session.flush()

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
    await log_event(
        session,
        candidate_id=candidate.candidate_id,
        action_type="caf_link_generated",
        performed_by_person_id_platform=None,
        related_entity_type="candidate",
        related_entity_id=candidate.candidate_id,
        meta_json={"caf_token": caf_token},
    )

    caf_link = build_public_link(f"/caf/{caf_token}")

    assessment = RecCandidateAssessment(
        candidate_id=candidate.candidate_id,
        assessment_token=uuid4().hex,
        assessment_sent_at=now,
        created_at=now,
        updated_at=now,
    )
    session.add(assessment)
    await log_event(
        session,
        candidate_id=candidate.candidate_id,
        action_type="assessment_link_generated",
        performed_by_person_id_platform=None,
        related_entity_type="candidate",
        related_entity_id=candidate.candidate_id,
        meta_json={"assessment_token": assessment.assessment_token},
    )

    assessment_link = build_public_link(f"/assessment/{assessment.assessment_token}")

    # Drive folder creation (required)
    drive_folder_id: str | None = None
    drive_folder_url: str | None = None
    try:
        folder_id, folder_url = await anyio.to_thread.run_sync(
            create_candidate_folder, candidate.candidate_code, candidate.full_name
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
        max_bytes = EXTERNAL_DOC_MAX_BYTES_PORTFOLIO if kind == "portfolio" else EXTERNAL_DOC_MAX_BYTES_DOC
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
            max_bytes=2 * 1024 * 1024,
            allowed_extensions=DOC_EXTENSIONS,
            allowed_mime_types=DOC_MIME_TYPES,
        )
    elif cv_source_url:
        cv_url = await _upload_remote("cv", cv_source_url)

    if has_portfolio_file and portfolio_file:
        portfolio_url = await _upload_file(
            "portfolio",
            portfolio_file,
            max_bytes=10 * 1024 * 1024,
            allowed_extensions=SPRINT_EXTENSIONS,
            allowed_mime_types=SPRINT_MIME_TYPES,
        )
    elif portfolio_source_url:
        portfolio_url = await _upload_remote("portfolio", portfolio_source_url)

    if has_resume_file and resume_file:
        resume_url_uploaded = await _upload_file(
            "resume",
            resume_file,
            max_bytes=2 * 1024 * 1024,
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

    candidate.cv_url = cv_url
    candidate.portfolio_url = portfolio_url
    candidate.resume_url = resume_url_uploaded
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
        caf_token=caf_token,
        caf_url=build_public_path(f"/caf/{caf_token}"),
        screening_result=decision,
        already_applied=False,
    ).model_dump()

    await send_email(
        session,
        candidate_id=candidate.candidate_id,
        to_emails=[candidate.email],
        subject="Your Studio Lotus application links",
        template_name="application_links",
        context={
            "candidate_name": candidate.full_name,
            "candidate_code": candidate.candidate_code,
            "caf_link": caf_link,
            "assessment_link": assessment_link,
            "candidate_email": candidate.email,
            "candidate_phone": candidate.phone or "—",
            "willing_to_relocate": _label_yes_no(screening_data.get("willing_to_relocate")),
        },
        email_type="application_links",
        meta_extra={"caf_token": caf_token, "assessment_token": assessment.assessment_token},
    )

    idem.status_code = status.HTTP_201_CREATED
    idem.response_json = json.dumps(response_payload, ensure_ascii=True)
    idem.updated_at = datetime.utcnow()

    await session.commit()
    return JSONResponse(content=response_payload, status_code=status.HTTP_201_CREATED)
