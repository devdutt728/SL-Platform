from datetime import datetime, timedelta
import hmac
from hashlib import sha256
import logging
import mimetypes
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urlparse
from urllib.request import Request, urlopen
from uuid import uuid4

import anyio
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from fastapi.responses import RedirectResponse
import json
from pydantic import AliasChoices, BaseModel, ConfigDict, EmailStr, Field, ValidationError, field_validator, model_validator
from sqlalchemy import func, select, delete, text, or_, case, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import SQLAlchemyError, OperationalError, IntegrityError

from app.api import deps
from app.core.auth import require_roles, require_superadmin
from app.core.config import settings
from app.core.datetime_utils import now_ist_naive, to_ist_naive
from app.core.roles import Role
from app.models.candidate import RecCandidate
from app.models.candidate_assessment import RecCandidateAssessment
from app.models.candidate_ingest_attempt import RecCandidateIngestAttempt
from app.models.candidate_ingest_idempotency import RecCandidateIngestIdempotency
from app.models.candidate_offer import RecCandidateOffer
from app.models.event import RecCandidateEvent
from app.models.opening import RecOpening
from app.models.screening import RecCandidateScreening
from app.models.stage import RecCandidateStage
from app.models.interview import RecCandidateInterview
from app.schemas.candidate import CandidateCreate, CandidateDetailOut, CandidateListItem, CandidateUpdate
from app.schemas.event import CandidateEventOut
from app.schemas.offer import OfferCreateIn, OfferOut
from app.schemas.candidate_full import CandidateFullOut
from app.schemas.candidate_assessment import CandidateAssessmentOut
from app.schemas.screening import ScreeningOut, ScreeningUpsertIn
from app.schemas.stage import CandidateStageOut, StageTransitionRequest
from app.schemas.user import UserContext
from app.services.drive import create_candidate_folder, delete_candidate_folder, delete_all_candidate_folders, upload_application_doc
from app.services.email import send_email
from app.services.events import log_event
from app.services.offers import convert_candidate_to_employee, create_offer, offer_pdf_signed_url
from app.services.public_links import build_public_link, build_public_path
from app.services.opening_config import get_opening_config
from app.services.screening_rules import evaluate_screening
from app.services.stage_transitions import apply_stage_transition
from app.core.uploads import DOC_EXTENSIONS, DOC_MIME_TYPES, SPRINT_EXTENSIONS, SPRINT_MIME_TYPES, sanitize_filename

router = APIRouter(prefix="/rec/candidates", tags=["candidates"])
logger = logging.getLogger("slr.candidates")

SOURCE_ORIGIN_UI = "ui"
SOURCE_ORIGIN_GOOGLE_SHEET = "google_sheet"
EXTERNAL_DOC_MAX_BYTES_DOC = 2 * 1024 * 1024
EXTERNAL_DOC_MAX_BYTES_PORTFOLIO = 10 * 1024 * 1024
GOOGLE_SHEET_DUPLICATE_WINDOW = timedelta(hours=24)


def _strip_optional(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def _parse_yes_no(value: str | bool | None) -> bool | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "y", "on"}:
        return True
    if normalized in {"0", "false", "no", "n", "off"}:
        return False
    return None


def _label_yes_no(value: bool | None) -> str:
    if value is None:
        return "—"
    return "Yes" if value else "No"


def _parse_optional_datetime(value: str | datetime | None) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        parsed = value
    else:
        raw = value.strip()
        if not raw:
            return None
        normalized = raw.replace("Z", "+00:00")
        parsed = None
        for fmt in (
            None,
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%d %H:%M",
            "%Y/%m/%d %H:%M:%S",
            "%Y/%m/%d %H:%M",
            "%d-%m-%Y %H:%M:%S",
            "%d/%m/%Y %H:%M:%S",
        ):
            try:
                if fmt is None:
                    parsed = datetime.fromisoformat(normalized)
                else:
                    parsed = datetime.strptime(raw, fmt)
                break
            except Exception:
                continue
        if parsed is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid date value '{value}'. Use ISO format or YYYY-MM-DD HH:MM:SS.",
            )
    if parsed.tzinfo is not None:
        parsed = to_ist_naive(parsed)
    return parsed


def _extract_row_key(raw_row: dict[str, object], idx: int) -> str:
    for key in ("row_key", "row", "Row", "Row ID", "row_id"):
        raw_value = raw_row.get(key)
        if raw_value is None:
            continue
        text = str(raw_value).strip()
        if text:
            return text
    return str(idx)


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


def _download_external_file(url: str, *, max_bytes: int) -> tuple[bytes, str, str]:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unsupported URL scheme for '{url}'.")

    request = Request(url, headers={"User-Agent": "SL-Recruitment-Ingest/1.0"})
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


async def _upload_external_document(
    session: AsyncSession,
    *,
    candidate: RecCandidate,
    kind: str,
    source_url: str,
    drive_folder_id: str,
    drive_folder_url: str | None,
    performed_by_person_id_platform: int | None,
) -> str:
    max_bytes = EXTERNAL_DOC_MAX_BYTES_PORTFOLIO if kind == "portfolio" else EXTERNAL_DOC_MAX_BYTES_DOC
    data, filename, content_type = await anyio.to_thread.run_sync(
        lambda: _download_external_file(source_url, max_bytes=max_bytes)
    )
    safe_name = _validate_external_document(kind, filename, content_type)
    stored_name = f"{candidate.candidate_code}-{kind}-{safe_name}"
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
        performed_by_person_id_platform=performed_by_person_id_platform,
        related_entity_type="candidate",
        related_entity_id=candidate.candidate_id,
        meta_json={
            "source_url": source_url,
            "file_url": file_url,
            "drive_folder_id": drive_folder_id,
            "drive_folder_url": drive_folder_url,
        },
    )
    return file_url


class GoogleSheetCandidateRow(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    applied_at: str | datetime | None = Field(
        default=None,
        validation_alias=AliasChoices("applied_at", "date", "Date", "Timestamp", "timestamp"),
    )
    row_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("row_key", "row", "Row", "Row ID", "row_id"),
    )
    opening_code: str | None = Field(
        default=None,
        validation_alias=AliasChoices("opening_code", "job_id", "Job ID", "Job Id", "job id"),
    )
    applying_for: str | None = Field(
        default=None,
        validation_alias=AliasChoices("applying_for", "Applying For", "Applying for", "applying for"),
    )
    first_name: str | None = Field(
        default=None,
        validation_alias=AliasChoices("first_name", "First name", "First Name"),
    )
    last_name: str | None = Field(
        default=None,
        validation_alias=AliasChoices("last_name", "Last name", "Last Name"),
    )
    email: EmailStr = Field(validation_alias=AliasChoices("email", "Email"))
    phone: str | None = Field(
        default=None,
        validation_alias=AliasChoices("phone", "contact_number", "Contact number", "Contact Number"),
    )
    educational_qualification: str | None = Field(
        default=None,
        validation_alias=AliasChoices("educational_qualification", "Educational Qualification"),
    )
    years_of_experience: float | None = Field(
        default=None,
        validation_alias=AliasChoices("years_of_experience", "Years of experience", "Years of Exp"),
    )
    city: str | None = Field(default=None, validation_alias=AliasChoices("city", "City"))
    willing_to_relocate: str | None = Field(
        default=None,
        validation_alias=AliasChoices("willing_to_relocate", "Willing to Relocate?", "Willing to relocate"),
    )
    terms: str | bool | None = Field(default=None, validation_alias=AliasChoices("terms", "Terms"))
    portfolio_url: str | None = Field(
        default=None,
        validation_alias=AliasChoices("portfolio_url", "portfolio", "Portfolio"),
    )
    cv_url: str | None = Field(default=None, validation_alias=AliasChoices("cv_url", "cv", "CV"))
    resume_url: str | None = Field(
        default=None,
        validation_alias=AliasChoices("resume_url", "resume", "Resume"),
    )
    source_channel: str | None = None
    external_source_ref: str | None = None

    @field_validator(
        "row_key",
        "opening_code",
        "applying_for",
        "first_name",
        "last_name",
        "phone",
        "educational_qualification",
        "city",
        "willing_to_relocate",
        "portfolio_url",
        "cv_url",
        "resume_url",
        "source_channel",
        "external_source_ref",
    )
    @classmethod
    def _strip_optional_fields(cls, value: str | None) -> str | None:
        return _strip_optional(value)

    @field_validator("opening_code")
    @classmethod
    def _normalize_opening_code(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip().upper()
        return cleaned

    @field_validator("first_name", "last_name")
    @classmethod
    def _normalize_name_parts(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned

    @field_validator("years_of_experience")
    @classmethod
    def _validate_years_of_experience(cls, value: float | None) -> float | None:
        if value is None:
            return None
        if value < 0:
            raise ValueError("years_of_experience cannot be negative.")
        return value

    @model_validator(mode="after")
    def _validate_required_fields(self):
        if not self.opening_code and not self.applying_for:
            raise ValueError("Either opening_code/job_id or applying_for is required.")
        if not self.first_name:
            raise ValueError("first_name is required.")
        if not self.last_name:
            raise ValueError("last_name is required.")
        terms_consent = _parse_yes_no(self.terms)
        if terms_consent is not True:
            raise ValueError("terms consent must be accepted.")
        if not self.portfolio_url:
            raise ValueError("portfolio_url is required.")
        return self


class GoogleSheetIngestIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    batch_id: str | None = None
    sheet_id: str | None = None
    sheet_name: str | None = None
    rows: list[dict[str, object]]

    @field_validator("batch_id", "sheet_id", "sheet_name")
    @classmethod
    def _strip_batch_fields(cls, value: str | None) -> str | None:
        return _strip_optional(value)


def _candidate_code(candidate_id: int) -> str:
    return f"SLR-{candidate_id:04d}"


def _split_name(full_name: str) -> tuple[str, str | None]:
    parts = full_name.strip().split()
    if not parts:
        return "", None
    first = parts[0]
    last = " ".join(parts[1:]) or None
    return first, last


def _platform_person_id(user: UserContext) -> int | None:
    raw = (user.person_id_platform or "").strip()
    if not raw:
        return None
    try:
        return int(raw)
    except Exception:
        return None


def _actor_role_ids(user: UserContext) -> set[int]:
    values: list[object] = []
    if user.platform_role_id is not None:
        values.append(user.platform_role_id)
    values.extend(user.platform_role_ids or [])
    role_ids: set[int] = set()
    for value in values:
        raw = str(value or "").strip()
        if not raw:
            continue
        try:
            role_ids.add(int(raw))
        except (TypeError, ValueError):
            continue
    return role_ids


def _is_role_5_or_6_actor(user: UserContext) -> bool:
    role_ids = _actor_role_ids(user)
    return 5 in role_ids or 6 in role_ids


def _is_interviewer_scope(user: UserContext) -> bool:
    roles = set(user.roles or [])
    is_hr = Role.HR_ADMIN in roles or Role.HR_EXEC in roles
    role_ids = _actor_role_ids(user)
    is_superadmin = 2 in role_ids
    is_role_5_or_6 = 5 in role_ids or 6 in role_ids
    is_interviewer = Role.INTERVIEWER in roles or Role.GROUP_LEAD in roles or Role.HIRING_MANAGER in roles
    return (is_role_5_or_6 or is_interviewer) and not is_hr and not is_superadmin


def _can_manage_candidate_360(user: UserContext) -> bool:
    roles = set(user.roles or [])
    if Role.HR_ADMIN in roles or Role.HR_EXEC in roles:
        return True
    role_ids = _actor_role_ids(user)
    if 2 in role_ids:
        return True
    if 5 in role_ids or 6 in role_ids:
        return False
    return True


def _clean_person_id_platform(raw: str | None) -> str | None:
    if raw is None:
        return None
    value = raw.strip()
    return value or None


def _normalize_source_channel(source_channel: str | None, *, fallback: str) -> str:
    cleaned = _strip_optional(source_channel)
    return cleaned or fallback


def _caf_expired_for_candidate(candidate: RecCandidate, *, now: datetime | None = None) -> bool:
    if candidate.caf_submitted_at is not None:
        return False
    if candidate.caf_sent_at is None:
        return False
    expiry_hours = max(int(settings.caf_expiry_hours or 0), 0)
    if expiry_hours <= 0:
        expiry_hours = max(int(settings.caf_expiry_days or 0), 0) * 24
    if expiry_hours <= 0:
        return False
    current = now or now_ist_naive()
    return current > (candidate.caf_sent_at + timedelta(hours=expiry_hours))


def _is_recent_google_sheet_duplicate(candidate: RecCandidate, *, now: datetime) -> bool:
    marker = candidate.created_at or candidate.updated_at
    if marker is None:
        return True
    return marker >= (now - GOOGLE_SHEET_DUPLICATE_WINDOW)


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


def _derive_google_sheet_external_ref(
    *,
    payload: GoogleSheetIngestIn,
    row: GoogleSheetCandidateRow,
    row_key: str,
) -> str:
    provided = _normalize_external_source_ref(row.external_source_ref)
    if provided:
        return provided

    applied_at = ""
    if isinstance(row.applied_at, datetime):
        applied_at = row.applied_at.isoformat()
    elif row.applied_at is not None:
        applied_at = str(row.applied_at).strip()

    parts = [
        SOURCE_ORIGIN_GOOGLE_SHEET,
        (payload.sheet_id or "").strip(),
        (payload.sheet_name or "").strip(),
        applied_at,
        (row.opening_code or "").strip(),
        (row.applying_for or "").strip(),
        str(row.email).strip().lower(),
        (row.first_name or "").strip(),
        (row.last_name or "").strip(),
        (row.portfolio_url or "").strip(),
        (row.cv_url or "").strip(),
        (row.resume_url or "").strip(),
    ]
    if not applied_at:
        parts.append(str(row_key or "").strip())
    fingerprint = "|".join(part.lower() for part in parts)
    digest = sha256(fingerprint.encode("utf-8")).hexdigest()[:40]
    return f"gs:{digest}"


def _safe_payload_json(value: dict[str, object]) -> str:
    try:
        return _truncate_text(json.dumps(value, ensure_ascii=True, default=str), max_len=4000) or "{}"
    except Exception:
        return "{}"


async def _find_ingest_idempotency(
    session: AsyncSession,
    *,
    source_origin: str,
    external_source_ref: str | None,
) -> RecCandidateIngestIdempotency | None:
    ref = _normalize_external_source_ref(external_source_ref)
    if not ref:
        return None
    try:
        return (
            await session.execute(
                select(RecCandidateIngestIdempotency)
                .where(
                    RecCandidateIngestIdempotency.source_origin == source_origin,
                    RecCandidateIngestIdempotency.external_source_ref == ref,
                )
                .limit(1)
            )
        ).scalars().first()
    except OperationalError:
        return None


async def _upsert_ingest_idempotency(
    session: AsyncSession,
    *,
    source_origin: str,
    external_source_ref: str | None,
    candidate_id: int | None,
    result_status: str,
    result_message: str | None,
) -> None:
    ref = _normalize_external_source_ref(external_source_ref)
    if not ref:
        return

    try:
        async with session.begin_nested():
            existing = (
                await session.execute(
                    select(RecCandidateIngestIdempotency)
                    .where(
                        RecCandidateIngestIdempotency.source_origin == source_origin,
                        RecCandidateIngestIdempotency.external_source_ref == ref,
                    )
                    .limit(1)
                )
            ).scalars().first()
            if existing:
                if candidate_id is not None:
                    existing.candidate_id = candidate_id
                existing.result_status = (result_status or existing.result_status or "created").strip()[:32]
                existing.result_message = _truncate_text(result_message, max_len=500)
                existing.last_seen_at = now_ist_naive()
            else:
                session.add(
                    RecCandidateIngestIdempotency(
                        source_origin=source_origin,
                        external_source_ref=ref,
                        candidate_id=candidate_id,
                        result_status=(result_status or "created").strip()[:32],
                        result_message=_truncate_text(result_message, max_len=500),
                        first_seen_at=now_ist_naive(),
                        last_seen_at=now_ist_naive(),
                    )
                )
            await session.flush()
    except OperationalError:
        logger.warning("Ingest idempotency table unavailable. Apply migration 0037.")


async def _record_ingest_attempt(
    session: AsyncSession,
    *,
    payload: GoogleSheetIngestIn,
    row_key: str,
    row: GoogleSheetCandidateRow | None,
    email_normalized: str,
    external_source_ref: str | None,
    attempt_status: str,
    candidate_id: int | None,
    opening_id: int | None,
    message: str | None,
    raw_row: dict[str, object],
    attempted_at: datetime,
) -> None:
    try:
        async with session.begin_nested():
            session.add(
                RecCandidateIngestAttempt(
                    source_origin=SOURCE_ORIGIN_GOOGLE_SHEET,
                    sheet_id=(payload.sheet_id or "").strip() or None,
                    sheet_name=(payload.sheet_name or "").strip() or None,
                    batch_id=(payload.batch_id or "").strip() or None,
                    row_key=(row_key or "").strip() or None,
                    opening_id=opening_id,
                    opening_code=(
                        ((row.opening_code if row is not None else None) or raw_row.get("opening_code") or raw_row.get("job_id") or "")
                    ).strip()
                    or None,
                    email_normalized=email_normalized,
                    external_source_ref=_normalize_external_source_ref(external_source_ref),
                    attempt_status=(attempt_status or "error").strip()[:32],
                    candidate_id=candidate_id,
                    message=_truncate_text(message, max_len=500),
                    payload_json=_safe_payload_json(raw_row),
                    attempted_at=attempted_at,
                    created_at=attempted_at,
                )
            )
            await session.flush()
    except OperationalError:
        logger.warning("Ingest attempt table unavailable. Apply migration 0037.")


async def _candidate_duplicate_metadata(session: AsyncSession, *, candidate_id: int) -> tuple[bool, int, datetime | None]:
    try:
        row = (
            await session.execute(
                select(
                    func.count(RecCandidateIngestAttempt.candidate_ingest_attempt_id).label("attempt_count"),
                    func.count(func.distinct(RecCandidateIngestAttempt.external_source_ref)).label("distinct_ref_count"),
                    func.max(
                        case(
                            (RecCandidateIngestAttempt.attempt_status == "reapplied", RecCandidateIngestAttempt.attempted_at),
                            else_=None,
                        )
                    ).label("latest_reapply_at"),
                ).where(
                    RecCandidateIngestAttempt.candidate_id == candidate_id,
                )
            )
        ).first()
    except OperationalError:
        return (False, 0, None)

    if not row:
        return (False, 0, None)
    attempt_count = int(row.attempt_count or 0)
    distinct_ref_count = int(row.distinct_ref_count or 0)
    application_count = distinct_ref_count if distinct_ref_count > 0 else attempt_count
    return (application_count > 1, application_count, row.latest_reapply_at)


async def _send_assessment_link_for_l2_shortlist(
    session: AsyncSession,
    *,
    candidate: RecCandidate,
    user: UserContext,
    force_resend: bool = False,
    trigger_source: str = "l2_shortlist",
) -> dict[str, str | bool | None]:
    if not candidate.email:
        return {
            "attempted": False,
            "status": "skipped",
            "reason": "missing_recipient",
            "assessment_token": None,
        }

    assessment = (
        await session.execute(
            select(RecCandidateAssessment).where(RecCandidateAssessment.candidate_id == candidate.candidate_id)
        )
    ).scalars().first()

    now = now_ist_naive()
    if assessment is None:
        assessment = RecCandidateAssessment(
            candidate_id=candidate.candidate_id,
            assessment_token=uuid4().hex,
            created_at=now,
            updated_at=now,
        )
        session.add(assessment)
    elif not assessment.assessment_token:
        assessment.assessment_token = uuid4().hex
        assessment.updated_at = now

    if not assessment.assessment_token:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Assessment token unavailable")

    if assessment.assessment_submitted_at is not None:
        return {
            "attempted": False,
            "status": "skipped",
            "reason": "already_submitted",
            "assessment_token": assessment.assessment_token,
        }

    latest_email_meta = await _latest_email_meta(
        session,
        candidate_id=candidate.candidate_id,
        email_type="assessment_link",
    )
    latest_status = _strip_optional(str((latest_email_meta or {}).get("status") or ""))

    should_send = force_resend or assessment.assessment_sent_at is None
    # Optional auto-retry: if an earlier assessment email failed, retry on next L2 transition.
    if not should_send and latest_status == "failed":
        should_send = True
    if not should_send:
        return {
            "attempted": False,
            "status": "skipped",
            "reason": "already_sent",
            "assessment_token": assessment.assessment_token,
        }

    await log_event(
        session,
        candidate_id=candidate.candidate_id,
        action_type="assessment_link_generated",
        performed_by_person_id_platform=_platform_person_id(user),
        related_entity_type="candidate",
        related_entity_id=candidate.candidate_id,
        meta_json={
            "assessment_token": assessment.assessment_token,
            "reason": "l2_shortlist" if trigger_source == "l2_shortlist" else trigger_source,
        },
    )

    assessment_link = build_public_link(f"/assessment/{assessment.assessment_token}")
    email_meta = await send_email(
        session,
        candidate_id=candidate.candidate_id,
        to_emails=[candidate.email],
        subject="Your Studio Lotus assessment form",
        template_name="assessment_link",
        context={
            "candidate_name": candidate.full_name,
            "candidate_code": candidate.candidate_code,
            "assessment_link": assessment_link,
        },
        email_type="assessment_link",
        meta_extra={
            "assessment_token": assessment.assessment_token,
            "trigger_stage": trigger_source,
        },
    )
    email_status = _strip_optional(str(email_meta.get("status") or "")) or "unknown"
    if email_status != "failed":
        assessment.assessment_sent_at = now
        assessment.updated_at = now

    return {
        "attempted": True,
        "status": email_status,
        "reason": None,
        "assessment_token": assessment.assessment_token,
        "error": _strip_optional(str(email_meta.get("error") or "")),
    }


def _require_sheet_ingest_token(token: str | None) -> None:
    configured = (settings.sheet_ingest_token or "").strip()
    if not configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google Sheet ingestion is not configured.",
        )
    supplied = (token or "").strip()
    if not supplied or not hmac.compare_digest(supplied, configured):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid sheet ingest token.")


def _event_meta_to_dict(meta_json: str | dict | None) -> dict:
    if meta_json is None:
        return {}
    if isinstance(meta_json, dict):
        return meta_json
    if isinstance(meta_json, str):
        raw = meta_json.strip()
        if not raw:
            return {}
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            return {}
    return {}


async def _latest_email_meta(
    session: AsyncSession,
    *,
    candidate_id: int,
    email_type: str | None = None,
) -> dict | None:
    rows = (
        await session.execute(
            select(RecCandidateEvent.meta_json)
            .where(
                RecCandidateEvent.candidate_id == candidate_id,
                RecCandidateEvent.action_type == "email_sent",
            )
            .order_by(RecCandidateEvent.candidate_event_id.desc())
            .limit(10)
        )
    ).scalars().all()

    for raw_meta in rows:
        meta = _event_meta_to_dict(raw_meta)
        if not meta:
            continue
        if email_type:
            current_type = str(meta.get("email_type") or "").strip().lower()
            if current_type != email_type.strip().lower():
                continue
        return meta
    return None


async def _create_candidate_with_automation(
    session: AsyncSession,
    *,
    first_name: str,
    last_name: str | None,
    email: str,
    phone: str | None,
    opening_id: int | None,
    source_channel: str | None,
    source_origin: str,
    external_source_ref: str | None = None,
    cv_url: str | None = None,
    portfolio_url: str | None = None,
    resume_url: str | None = None,
    educational_qualification: str | None = None,
    years_of_experience: float | None = None,
    city: str | None = None,
    terms_consent: bool | None = None,
    willing_to_relocate: bool | None = None,
    created_at_override: datetime | None = None,
    link_sent_at_override: datetime | None = None,
    ingest_remote_documents: bool = False,
    l2_owner_email: str | None = None,
    l2_owner_name: str | None = None,
    performed_by_person_id_platform: int | None = None,
    performed_by_email: str | None = None,
    user: UserContext | None = None,
    event_source: str = "candidate_create",
) -> RecCandidate:
    created_at = to_ist_naive(created_at_override) if created_at_override else now_ist_naive()
    link_sent_at = link_sent_at_override or created_at
    if link_sent_at.tzinfo is not None:
        link_sent_at = to_ist_naive(link_sent_at)
    full_name = _compose_full_name(first_name, last_name)
    application_docs_status = _application_docs_status(cv_url=cv_url, portfolio_url=portfolio_url, resume_url=resume_url)

    candidate = RecCandidate(
        candidate_code=uuid4().hex[:8].upper(),
        first_name=first_name,
        last_name=last_name,
        full_name=full_name,
        email=email.lower(),
        phone=phone,
        opening_id=opening_id,
        source_channel=source_channel,
        source_origin=source_origin,
        external_source_ref=external_source_ref,
        educational_qualification=educational_qualification,
        years_of_experience=years_of_experience,
        city=city,
        current_location=city,
        terms_consent=bool(terms_consent),
        terms_consent_at=created_at if terms_consent else None,
        l2_owner_email=l2_owner_email.lower() if l2_owner_email else None,
        l2_owner_name=l2_owner_name,
        status="enquiry",
        cv_url=cv_url,
        portfolio_url=portfolio_url,
        resume_url=resume_url,
        caf_token=uuid4().hex,
        caf_sent_at=link_sent_at,
        application_docs_status=application_docs_status,
        joining_docs_status="none",
        created_at=created_at,
        updated_at=created_at,
    )
    session.add(candidate)
    await session.flush()

    candidate.candidate_code = _candidate_code(candidate.candidate_id)
    await session.flush()

    await log_event(
        session,
        candidate_id=candidate.candidate_id,
        action_type="candidate_created",
        performed_by_person_id_platform=performed_by_person_id_platform,
        related_entity_type="candidate",
        related_entity_id=candidate.candidate_id,
        meta_json={
            "candidate_code": candidate.candidate_code,
            "source_channel": candidate.source_channel,
            "source_origin": candidate.source_origin,
            "external_source_ref": candidate.external_source_ref,
            "opening_id": candidate.opening_id,
            "city": candidate.city,
            "educational_qualification": candidate.educational_qualification,
            "years_of_experience": candidate.years_of_experience,
            "terms_consent": candidate.terms_consent,
            "performed_by_email": performed_by_email,
        },
    )

    await log_event(
        session,
        candidate_id=candidate.candidate_id,
        action_type="caf_link_generated",
        performed_by_person_id_platform=performed_by_person_id_platform,
        related_entity_type="candidate",
        related_entity_id=candidate.candidate_id,
        meta_json={"caf_token": candidate.caf_token},
    )

    caf_link = build_public_link(f"/caf/{candidate.caf_token}")
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
            "candidate_email": candidate.email,
            "candidate_phone": candidate.phone or "—",
            "willing_to_relocate": _label_yes_no(willing_to_relocate),
        },
        email_type="application_links",
        meta_extra={"caf_token": candidate.caf_token},
    )

    folder_id, folder_url = await anyio.to_thread.run_sync(
        create_candidate_folder, candidate.candidate_code, candidate.full_name
    )
    candidate.drive_folder_id = folder_id
    candidate.drive_folder_url = folder_url

    await log_event(
        session,
        candidate_id=candidate.candidate_id,
        action_type="drive_folder_created",
        performed_by_person_id_platform=performed_by_person_id_platform,
        related_entity_type="candidate",
        related_entity_id=candidate.candidate_id,
        meta_json={"drive_folder_id": folder_id, "drive_folder_url": folder_url},
    )

    if ingest_remote_documents:
        if cv_url:
            candidate.cv_url = await _upload_external_document(
                session,
                candidate=candidate,
                kind="cv",
                source_url=cv_url,
                drive_folder_id=folder_id,
                drive_folder_url=folder_url,
                performed_by_person_id_platform=performed_by_person_id_platform,
            )
        if portfolio_url:
            candidate.portfolio_url = await _upload_external_document(
                session,
                candidate=candidate,
                kind="portfolio",
                source_url=portfolio_url,
                drive_folder_id=folder_id,
                drive_folder_url=folder_url,
                performed_by_person_id_platform=performed_by_person_id_platform,
            )
            candidate.portfolio_not_uploaded_reason = None
        if resume_url:
            candidate.resume_url = await _upload_external_document(
                session,
                candidate=candidate,
                kind="resume",
                source_url=resume_url,
                drive_folder_id=folder_id,
                drive_folder_url=folder_url,
                performed_by_person_id_platform=performed_by_person_id_platform,
            )
        candidate.application_docs_status = _application_docs_status(
            cv_url=candidate.cv_url,
            portfolio_url=candidate.portfolio_url,
            resume_url=candidate.resume_url,
        )

    if willing_to_relocate is not None:
        screening = (
            await session.execute(
                select(RecCandidateScreening).where(RecCandidateScreening.candidate_id == candidate.candidate_id)
            )
        ).scalars().first()
        if screening is None:
            screening = RecCandidateScreening(
                candidate_id=candidate.candidate_id,
                created_at=created_at,
                updated_at=created_at,
            )
            session.add(screening)
        screening.willing_to_relocate = willing_to_relocate
        screening.updated_at = created_at
        decision = evaluate_screening(ScreeningUpsertIn(willing_to_relocate=willing_to_relocate), get_opening_config(candidate.opening_id))
        screening.screening_result = decision
        candidate.needs_hr_review = decision == "amber"

    await apply_stage_transition(
        session,
        candidate=candidate,
        to_stage="enquiry",
        reason="system_init",
        note="system_init",
        user=user,
        source=event_source,
    )

    return candidate


async def _assert_candidate_access(session: AsyncSession, candidate_id: int, user: UserContext) -> None:
    if not _is_interviewer_scope(user):
        return
    interviewer_id = _clean_person_id_platform(user.person_id_platform)
    user_email = (user.email or "").strip().lower()
    if not interviewer_id and not user_email:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access restricted")
    interview_row = None
    if interviewer_id:
        interview_row = (
            await session.execute(
                select(RecCandidateInterview.candidate_id)
                .where(
                    RecCandidateInterview.candidate_id == candidate_id,
                    RecCandidateInterview.interviewer_person_id_platform == interviewer_id,
                )
                .limit(1)
            )
        ).first()
    owner_row = None
    if user_email:
        owner_row = (
            await session.execute(
                select(RecCandidate.candidate_id)
                .where(
                    RecCandidate.candidate_id == candidate_id,
                    func.lower(RecCandidate.l2_owner_email) == user_email,
                )
                .limit(1)
            )
        ).first()
    if not interview_row and not owner_row:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access restricted")


def _decode_letter_overrides(raw: str | None) -> dict[str, str]:
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
        if not isinstance(key, str) or value is None:
            continue
        cleaned[key] = str(value)
    return cleaned


async def _ensure_offer_token(session: AsyncSession, offer: RecCandidateOffer) -> None:
    if offer.public_token:
        return
    offer.public_token = uuid4().hex
    offer.updated_at = now_ist_naive()
    await session.flush()


def _offer_out_payload(offer: RecCandidateOffer) -> dict:
    payload = OfferOut.model_validate(offer).model_dump()
    payload["pdf_download_url"] = offer_pdf_signed_url(offer.public_token) if offer.public_token else None
    payload["letter_overrides"] = _decode_letter_overrides(offer.offer_letter_overrides)
    return payload


async def _delete_candidate_with_dependents(session: AsyncSession, candidate: RecCandidate, *, delete_drive: bool = True):
    cid = candidate.candidate_id
    # Delete known dependent tables (best-effort to tolerate missing tables/migrations).
    for stmt, label in [
        (delete(RecCandidateEvent).where(RecCandidateEvent.candidate_id == cid), "rec_candidate_event"),
        (delete(RecCandidateStage).where(RecCandidateStage.candidate_id == cid), "rec_candidate_stage"),
        (delete(RecCandidateScreening).where(RecCandidateScreening.candidate_id == cid), "rec_candidate_screening"),
    ]:
        try:
            await session.execute(stmt)
        except SQLAlchemyError as exc:
            logger.warning("Skip delete on %s due to DB error: %s", label, exc)
    # Best-effort deletes for other dependent tables
    for table in [
        "rec_candidate_interview",
        "rec_candidate_offer",
        "rec_candidate_reference_check",
        "rec_candidate_sprint",
    ]:
        try:
            await session.execute(text(f"DELETE FROM {table} WHERE candidate_id = :cid"), {"cid": cid})
        except Exception:
            # Ignore if table missing or FK differs
            continue
    if delete_drive:
        try:
            # Try all buckets to catch folders that were moved post-creation.
            deleted = 0
            for bucket in ["Ongoing", "Appointed", "Not Appointed"]:
                deleted += await anyio.to_thread.run_sync(
                    lambda: delete_candidate_folder(
                        candidate_code=candidate.candidate_code,
                        folder_id=candidate.drive_folder_id,
                        bucket=bucket,  # type: ignore[arg-type]
                    )
                )
            if deleted == 0 and candidate.drive_folder_id:
                logger.warning("Drive delete attempted but nothing removed for candidate_id=%s", cid)
        except Exception as exc:
            logger.warning("Drive delete failed for candidate_id=%s: %s", cid, exc)
    await session.delete(candidate)


async def _get_current_stage_name(session: AsyncSession, *, candidate_id: int) -> str | None:
    pending = await session.execute(
        select(RecCandidateStage.stage_name)
        .where(RecCandidateStage.candidate_id == candidate_id, RecCandidateStage.stage_status == "pending")
        .order_by(RecCandidateStage.started_at.desc(), RecCandidateStage.stage_id.desc())
        .limit(1)
    )
    stage = pending.scalar_one_or_none()
    if stage:
        return stage
    latest = await session.execute(
        select(RecCandidateStage.stage_name)
        .where(RecCandidateStage.candidate_id == candidate_id)
        .order_by(RecCandidateStage.started_at.desc(), RecCandidateStage.stage_id.desc())
        .limit(1)
    )
    return latest.scalar_one_or_none()


async def _get_ageing_days(session: AsyncSession, *, candidate_id: int) -> int:
    row = await session.execute(
        select(func.datediff(func.curdate(), RecCandidateStage.started_at))
        .where(RecCandidateStage.candidate_id == candidate_id, RecCandidateStage.stage_status == "pending")
        .order_by(RecCandidateStage.started_at.desc(), RecCandidateStage.stage_id.desc())
        .limit(1)
    )
    value = row.scalar_one_or_none()
    return int(value or 0)


@router.post("", response_model=CandidateDetailOut, status_code=status.HTTP_201_CREATED)
async def create_candidate(
    payload: CandidateCreate,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC])),
):
    first_name = (payload.first_name or "").strip()
    last_name = (payload.last_name or "").strip() or None
    if not first_name:
        parsed_first, parsed_last = _split_name((payload.name or "").strip())
        first_name = parsed_first
        last_name = last_name or parsed_last
    if not first_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="First name is required.")

    candidate = await _create_candidate_with_automation(
        session,
        first_name=first_name,
        last_name=last_name,
        email=str(payload.email),
        phone=payload.phone,
        opening_id=payload.opening_id,
        source_channel=_normalize_source_channel(payload.source_channel, fallback="ui_manual"),
        source_origin=SOURCE_ORIGIN_UI,
        cv_url=payload.cv_url,
        portfolio_url=payload.portfolio_url,
        resume_url=payload.resume_url,
        educational_qualification=payload.educational_qualification,
        years_of_experience=payload.years_of_experience,
        city=payload.city,
        terms_consent=payload.terms_consent,
        l2_owner_email=str(payload.l2_owner_email) if payload.l2_owner_email else None,
        l2_owner_name=payload.l2_owner_name,
        performed_by_person_id_platform=_platform_person_id(user),
        performed_by_email=user.email,
        user=user,
        event_source="candidate_create",
    )

    await session.commit()

    opening_title = None
    if candidate.opening_id is not None:
        opening_title = (
            await session.execute(select(RecOpening.title).where(RecOpening.opening_id == candidate.opening_id))
        ).scalar_one_or_none()

    return CandidateDetailOut(
        candidate_id=candidate.candidate_id,
        candidate_code=candidate.candidate_code,
        name=candidate.full_name,
        first_name=candidate.first_name,
        last_name=candidate.last_name,
        email=candidate.email,
        phone=candidate.phone,
        opening_id=candidate.opening_id,
        opening_title=opening_title,
        l2_owner_email=candidate.l2_owner_email,
        l2_owner_name=candidate.l2_owner_name,
        source_channel=candidate.source_channel,
        source_origin=candidate.source_origin,
        external_source_ref=candidate.external_source_ref,
        educational_qualification=candidate.educational_qualification,
        years_of_experience=candidate.years_of_experience,
        city=candidate.city,
        terms_consent=candidate.terms_consent,
        terms_consent_at=candidate.terms_consent_at,
        status=candidate.status,
        current_stage="enquiry",
        final_decision=candidate.final_decision,
        hired_person_id_platform=candidate.hired_person_id_platform,
        cv_url=candidate.cv_url,
        resume_url=candidate.resume_url,
        portfolio_url=candidate.portfolio_url,
        portfolio_not_uploaded_reason=candidate.portfolio_not_uploaded_reason,
        questions_from_candidate=candidate.questions_from_candidate,
        drive_folder_url=candidate.drive_folder_url,
        caf_sent_at=candidate.caf_sent_at,
        caf_submitted_at=candidate.caf_submitted_at,
        needs_hr_review=bool(candidate.needs_hr_review),
        application_docs_status=candidate.application_docs_status,
        joining_docs_status=candidate.joining_docs_status,
        created_at=candidate.created_at,
        updated_at=candidate.updated_at,
    )


@router.post("/import/google-sheet", status_code=status.HTTP_200_OK)
async def import_candidates_from_google_sheet(
    payload: GoogleSheetIngestIn,
    session: AsyncSession = Depends(deps.get_db_session),
    x_sheet_ingest_token: str | None = Header(default=None, alias="x-sheet-ingest-token"),
):
    _require_sheet_ingest_token(x_sheet_ingest_token)
    if not payload.rows:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No rows provided.")

    max_rows = int(settings.sheet_ingest_max_rows or 0)
    if max_rows > 0 and len(payload.rows) > max_rows:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Payload too large. Maximum {max_rows} rows per request.",
        )

    results: list[dict] = []
    created_count = 0
    duplicate_count = 0
    failed_count = 0
    processed_at = now_ist_naive().isoformat()

    for idx, raw_row in enumerate(payload.rows, start=1):
        row_key = _extract_row_key(raw_row, idx)
        row_now = now_ist_naive()
        row: GoogleSheetCandidateRow | None = None
        email_normalized = str(raw_row.get("email") or raw_row.get("Email") or "").strip().lower()
        external_source_ref = _normalize_external_source_ref(
            str(raw_row.get("external_source_ref") or raw_row.get("External Source Ref") or "").strip()
        )
        opening_id_for_dedupe: int | None = None
        try:
            row = GoogleSheetCandidateRow.model_validate(raw_row)
            email_normalized = str(row.email).strip().lower()
            external_source_ref = _derive_google_sheet_external_ref(
                payload=payload,
                row=row,
                row_key=row_key,
            )

            idempotent_hit = await _find_ingest_idempotency(
                session,
                source_origin=SOURCE_ORIGIN_GOOGLE_SHEET,
                external_source_ref=external_source_ref,
            )
            if idempotent_hit:
                duplicate_count += 1
                idempotent_candidate: RecCandidate | None = None
                if idempotent_hit.candidate_id is not None:
                    idempotent_candidate = await session.get(RecCandidate, idempotent_hit.candidate_id)
                idempotent_message = (
                    _strip_optional(idempotent_hit.result_message)
                    or "This source application row was already ingested."
                )
                await _record_ingest_attempt(
                    session,
                    payload=payload,
                    row_key=row_key,
                    row=row,
                    email_normalized=email_normalized,
                    external_source_ref=external_source_ref,
                    attempt_status="duplicate_idempotent",
                    candidate_id=idempotent_candidate.candidate_id if idempotent_candidate else idempotent_hit.candidate_id,
                    opening_id=idempotent_candidate.opening_id if idempotent_candidate else None,
                    message=idempotent_message,
                    raw_row=raw_row,
                    attempted_at=row_now,
                )
                await _upsert_ingest_idempotency(
                    session,
                    source_origin=SOURCE_ORIGIN_GOOGLE_SHEET,
                    external_source_ref=external_source_ref,
                    candidate_id=idempotent_candidate.candidate_id if idempotent_candidate else idempotent_hit.candidate_id,
                    result_status="duplicate",
                    result_message=idempotent_message,
                )
                await session.commit()
                results.append(
                    {
                        "row_key": row_key,
                        "status": "duplicate",
                        "candidate_id": idempotent_candidate.candidate_id if idempotent_candidate else idempotent_hit.candidate_id,
                        "candidate_code": (
                            idempotent_candidate.candidate_code if idempotent_candidate else None
                        ),
                        "message": idempotent_message,
                    }
                )
                continue

            opening: RecOpening | None = None
            opening_code = (row.opening_code or "").strip().upper()
            applying_for = (row.applying_for or "").strip()
            if opening_code:
                opening = (
                    await session.execute(
                        select(RecOpening).where(RecOpening.opening_code == opening_code).limit(1)
                    )
                ).scalars().first()
                if not opening:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Opening not found for code '{opening_code}'.",
                    )
                if applying_for:
                    opening_title = (opening.title or "").strip().lower()
                    if opening_title and opening_title != applying_for.lower():
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=(
                                f"Opening title mismatch for code '{opening_code}'. "
                                f"Expected '{opening.title}', got '{applying_for}'."
                            ),
                        )
            else:
                candidates_for_title = (
                    await session.execute(
                        select(RecOpening)
                        .where(func.lower(RecOpening.title) == applying_for.lower())
                        .order_by(RecOpening.updated_at.desc(), RecOpening.opening_id.desc())
                    )
                ).scalars().all()
                active_openings = [item for item in candidates_for_title if bool(item.is_active)]
                if len(active_openings) > 1:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Multiple active openings found for title '{applying_for}'. Provide Job ID/opening_code.",
                    )
                if active_openings:
                    opening = active_openings[0]
                elif candidates_for_title:
                    opening = candidates_for_title[0]
                else:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Opening not found for title '{applying_for}'.",
                    )

            if not opening:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Opening not found for row.",
                )
            if not bool(opening.is_active):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Opening '{opening.opening_code or opening.opening_id}' is inactive.",
                )
            opening_id_for_dedupe = opening.opening_id

            terms_consent = _parse_yes_no(row.terms)
            if terms_consent is not True:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Terms consent must be accepted for every row.",
                )

            willing_to_relocate = _parse_yes_no(row.willing_to_relocate)
            if row.willing_to_relocate is not None and willing_to_relocate is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid willing_to_relocate value '{row.willing_to_relocate}'. Use Yes/No.",
                )
            applied_at_override = _parse_optional_datetime(row.applied_at)

            external_source_ref = row.external_source_ref or f"{payload.sheet_id or 'sheet'}:{payload.sheet_name or 'default'}:{row_key}"

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
            if existing_candidate and _is_recent_google_sheet_duplicate(existing_candidate, now=row_now):
                duplicate_message = "Candidate already exists for this opening/email within last 24 hours."
                duplicate_count += 1
                if not existing_candidate.source_origin:
                    existing_candidate.source_origin = SOURCE_ORIGIN_GOOGLE_SHEET
                if not existing_candidate.source_channel:
                    existing_candidate.source_channel = _normalize_source_channel(
                        row.source_channel,
                        fallback=SOURCE_ORIGIN_GOOGLE_SHEET,
                    )
                if not existing_candidate.external_source_ref:
                    existing_candidate.external_source_ref = external_source_ref
                existing_candidate.updated_at = now_ist_naive()
                await _record_ingest_attempt(
                    session,
                    payload=payload,
                    row_key=row_key,
                    row=row,
                    email_normalized=email_normalized,
                    external_source_ref=external_source_ref,
                    attempt_status="duplicate_recent",
                    candidate_id=existing_candidate.candidate_id,
                    opening_id=opening.opening_id,
                    message=duplicate_message,
                    raw_row=raw_row,
                    attempted_at=row_now,
                )
                await _upsert_ingest_idempotency(
                    session,
                    source_origin=SOURCE_ORIGIN_GOOGLE_SHEET,
                    external_source_ref=external_source_ref,
                    candidate_id=existing_candidate.candidate_id,
                    result_status="duplicate",
                    result_message=duplicate_message,
                )
                await session.commit()
                results.append(
                    {
                        "row_key": row_key,
                        "status": "duplicate",
                        "candidate_id": existing_candidate.candidate_id,
                        "candidate_code": existing_candidate.candidate_code,
                        "message": duplicate_message,
                    }
                )
                continue

            if existing_candidate:
                existing_candidate.first_name = row.first_name or existing_candidate.first_name
                existing_candidate.last_name = row.last_name if row.last_name is not None else existing_candidate.last_name
                existing_candidate.full_name = _compose_full_name(existing_candidate.first_name or "", existing_candidate.last_name)
                if row.phone:
                    existing_candidate.phone = row.phone
                if row.educational_qualification:
                    existing_candidate.educational_qualification = row.educational_qualification
                if row.years_of_experience is not None:
                    existing_candidate.years_of_experience = row.years_of_experience
                if row.city:
                    existing_candidate.city = row.city
                    existing_candidate.current_location = row.city
                existing_candidate.terms_consent = True
                existing_candidate.terms_consent_at = row_now
                existing_candidate.source_origin = SOURCE_ORIGIN_GOOGLE_SHEET
                existing_candidate.source_channel = _normalize_source_channel(
                    row.source_channel,
                    fallback=existing_candidate.source_channel or SOURCE_ORIGIN_GOOGLE_SHEET,
                )
                existing_candidate.external_source_ref = external_source_ref
                if not existing_candidate.caf_token:
                    existing_candidate.caf_token = uuid4().hex
                existing_candidate.caf_sent_at = row_now
                existing_candidate.updated_at = row_now

                await log_event(
                    session,
                    candidate_id=existing_candidate.candidate_id,
                    action_type="google_sheet_reapplied",
                    performed_by_person_id_platform=None,
                    related_entity_type="candidate",
                    related_entity_id=existing_candidate.candidate_id,
                    meta_json={
                        "row_key": row_key,
                        "batch_id": payload.batch_id,
                        "sheet_id": payload.sheet_id,
                        "sheet_name": payload.sheet_name,
                        "external_source_ref": external_source_ref,
                    },
                )

                reapply_email_meta = await send_email(
                    session,
                    candidate_id=existing_candidate.candidate_id,
                    to_emails=[existing_candidate.email],
                    subject="Your Studio Lotus application links",
                    template_name="application_links",
                    context={
                        "candidate_name": existing_candidate.full_name,
                        "candidate_code": existing_candidate.candidate_code,
                        "caf_link": build_public_link(f"/caf/{existing_candidate.caf_token}"),
                        "candidate_email": existing_candidate.email,
                        "candidate_phone": existing_candidate.phone or "—",
                        "willing_to_relocate": _label_yes_no(willing_to_relocate),
                    },
                    email_type="application_links",
                    meta_extra={
                        "caf_token": existing_candidate.caf_token,
                        "reason": "google_sheet_reapply",
                    },
                )

                reapply_status = _strip_optional(str((reapply_email_meta or {}).get("status") or ""))
                reapply_error = _strip_optional(str((reapply_email_meta or {}).get("error") or ""))
                reapply_message = "Candidate re-applied and profile refreshed."
                if reapply_status == "sent":
                    reapply_message = "Candidate re-applied and application links email sent."
                elif reapply_status == "failed":
                    reapply_message = "Candidate re-applied, but application links email failed."
                elif reapply_status == "skipped":
                    reapply_message = "Candidate re-applied, but application links email was skipped."

                await _record_ingest_attempt(
                    session,
                    payload=payload,
                    row_key=row_key,
                    row=row,
                    email_normalized=email_normalized,
                    external_source_ref=external_source_ref,
                    attempt_status="reapplied",
                    candidate_id=existing_candidate.candidate_id,
                    opening_id=opening.opening_id,
                    message=reapply_message,
                    raw_row=raw_row,
                    attempted_at=row_now,
                )
                await _upsert_ingest_idempotency(
                    session,
                    source_origin=SOURCE_ORIGIN_GOOGLE_SHEET,
                    external_source_ref=external_source_ref,
                    candidate_id=existing_candidate.candidate_id,
                    result_status="reapplied",
                    result_message=reapply_message,
                )
                await session.commit()

                created_count += 1
                result_payload = {
                    "row_key": row_key,
                    "status": "created",
                    "candidate_id": existing_candidate.candidate_id,
                    "candidate_code": existing_candidate.candidate_code,
                    "message": reapply_message,
                }
                if reapply_status:
                    result_payload["email_status"] = reapply_status
                if reapply_error:
                    result_payload["email_error"] = reapply_error
                results.append(result_payload)
                continue

            candidate = await _create_candidate_with_automation(
                session,
                first_name=row.first_name or "",
                last_name=row.last_name,
                email=email_normalized,
                phone=row.phone,
                opening_id=opening.opening_id,
                source_channel=_normalize_source_channel(row.source_channel, fallback=SOURCE_ORIGIN_GOOGLE_SHEET),
                source_origin=SOURCE_ORIGIN_GOOGLE_SHEET,
                external_source_ref=external_source_ref,
                cv_url=row.cv_url,
                portfolio_url=row.portfolio_url,
                resume_url=row.resume_url,
                educational_qualification=row.educational_qualification,
                years_of_experience=row.years_of_experience,
                city=row.city,
                terms_consent=terms_consent,
                willing_to_relocate=willing_to_relocate,
                created_at_override=applied_at_override,
                link_sent_at_override=row_now,
                ingest_remote_documents=True,
                performed_by_person_id_platform=None,
                performed_by_email="google-sheet-import@internal",
                user=None,
                event_source="google_sheet_import",
            )
            await _record_ingest_attempt(
                session,
                payload=payload,
                row_key=row_key,
                row=row,
                email_normalized=email_normalized,
                external_source_ref=external_source_ref,
                attempt_status="created",
                candidate_id=candidate.candidate_id,
                opening_id=opening.opening_id,
                message="Candidate created.",
                raw_row=raw_row,
                attempted_at=row_now,
            )
            await _upsert_ingest_idempotency(
                session,
                source_origin=SOURCE_ORIGIN_GOOGLE_SHEET,
                external_source_ref=external_source_ref,
                candidate_id=candidate.candidate_id,
                result_status="created",
                result_message="Candidate created.",
            )
            await session.commit()
            created_count += 1
            result_payload = {
                "row_key": row_key,
                "status": "created",
                "candidate_id": candidate.candidate_id,
                "candidate_code": candidate.candidate_code,
            }
            email_meta = await _latest_email_meta(
                session,
                candidate_id=candidate.candidate_id,
                email_type="application_links",
            )
            if email_meta:
                email_status = _strip_optional(str(email_meta.get("status") or ""))
                email_error = _strip_optional(str(email_meta.get("error") or ""))
                if email_status:
                    result_payload["email_status"] = email_status
                    if email_status == "sent":
                        result_payload["message"] = "Candidate created and application links email sent."
                    elif email_status == "failed":
                        result_payload["message"] = "Candidate created, but application links email failed."
                    elif email_status == "skipped":
                        result_payload["message"] = "Candidate created, but application links email was skipped."
                if email_error:
                    result_payload["email_error"] = email_error
            results.append(result_payload)
        except ValidationError as exc:
            await session.rollback()
            failed_count += 1
            message = "; ".join(error.get("msg", "invalid row") for error in exc.errors()) or "Invalid row payload."
            await _record_ingest_attempt(
                session,
                payload=payload,
                row_key=row_key,
                row=None,
                email_normalized=email_normalized,
                external_source_ref=external_source_ref,
                attempt_status="error",
                candidate_id=None,
                opening_id=None,
                message=message,
                raw_row=raw_row,
                attempted_at=row_now,
            )
            await session.commit()
            results.append({"row_key": row_key, "status": "error", "message": message})
        except IntegrityError:
            await session.rollback()
            dedupe_filters = [func.lower(RecCandidate.email) == email_normalized]
            if opening_id_for_dedupe is not None:
                dedupe_filters.append(RecCandidate.opening_id == opening_id_for_dedupe)
            existing_candidate = (
                await session.execute(
                    select(RecCandidate)
                    .where(*dedupe_filters)
                    .order_by(RecCandidate.candidate_id.desc())
                    .limit(1)
                )
            ).scalars().first()
            if existing_candidate:
                duplicate_count += 1
                duplicate_message = (
                    "Candidate already exists for this opening/email within last 24 hours."
                    if _is_recent_google_sheet_duplicate(existing_candidate, now=row_now)
                    else "Candidate already exists for this opening/email."
                )
                await _record_ingest_attempt(
                    session,
                    payload=payload,
                    row_key=row_key,
                    row=row,
                    email_normalized=email_normalized,
                    external_source_ref=external_source_ref,
                    attempt_status="duplicate_integrity",
                    candidate_id=existing_candidate.candidate_id,
                    opening_id=opening_id_for_dedupe,
                    message=duplicate_message,
                    raw_row=raw_row,
                    attempted_at=row_now,
                )
                await _upsert_ingest_idempotency(
                    session,
                    source_origin=SOURCE_ORIGIN_GOOGLE_SHEET,
                    external_source_ref=external_source_ref,
                    candidate_id=existing_candidate.candidate_id,
                    result_status="duplicate",
                    result_message=duplicate_message,
                )
                await session.commit()
                results.append(
                    {
                        "row_key": row_key,
                        "status": "duplicate",
                        "candidate_id": existing_candidate.candidate_id,
                        "candidate_code": existing_candidate.candidate_code,
                        "message": duplicate_message,
                    }
                )
            else:
                failed_count += 1
                message = "Candidate could not be imported due to an integrity error."
                await _record_ingest_attempt(
                    session,
                    payload=payload,
                    row_key=row_key,
                    row=row,
                    email_normalized=email_normalized,
                    external_source_ref=external_source_ref,
                    attempt_status="error",
                    candidate_id=None,
                    opening_id=opening_id_for_dedupe,
                    message=message,
                    raw_row=raw_row,
                    attempted_at=row_now,
                )
                await session.commit()
                results.append(
                    {
                        "row_key": row_key,
                        "status": "error",
                        "message": message,
                    }
                )
        except HTTPException as exc:
            await session.rollback()
            failed_count += 1
            message = str(exc.detail)
            await _record_ingest_attempt(
                session,
                payload=payload,
                row_key=row_key,
                row=row,
                email_normalized=email_normalized,
                external_source_ref=external_source_ref,
                attempt_status="error",
                candidate_id=None,
                opening_id=opening_id_for_dedupe,
                message=message,
                raw_row=raw_row,
                attempted_at=row_now,
            )
            await session.commit()
            results.append({"row_key": row_key, "status": "error", "message": message})
        except Exception as exc:
            await session.rollback()
            failed_count += 1
            logger.exception("Google sheet import failed for row %s: %s", row_key, exc)
            detail = "Candidate import failed."
            if settings.environment != "production":
                detail = f"Candidate import failed: {exc}"
            await _record_ingest_attempt(
                session,
                payload=payload,
                row_key=row_key,
                row=row,
                email_normalized=email_normalized,
                external_source_ref=external_source_ref,
                attempt_status="error",
                candidate_id=None,
                opening_id=opening_id_for_dedupe,
                message=detail,
                raw_row=raw_row,
                attempted_at=row_now,
            )
            await session.commit()
            results.append({"row_key": row_key, "status": "error", "message": detail})

    return {
        "batch_id": payload.batch_id,
        "sheet_id": payload.sheet_id,
        "sheet_name": payload.sheet_name,
        "processed_at": processed_at,
        "requested_rows": len(payload.rows),
        "created_count": created_count,
        "duplicate_count": duplicate_count,
        "failed_count": failed_count,
        "results": results,
    }


@router.get("", response_model=list[CandidateListItem])
async def list_candidates(
    opening_id: int | None = Query(default=None),
    status_filter: list[str] | None = Query(default=None, alias="status"),
    stage: list[str] | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.HIRING_MANAGER, Role.INTERVIEWER, Role.GROUP_LEAD, Role.VIEWER])),
):
    latest_stage_subq = (
        select(RecCandidateStage.candidate_id, func.max(RecCandidateStage.stage_id).label("stage_id"))
        .where(RecCandidateStage.stage_status == "pending")
        .group_by(RecCandidateStage.candidate_id)
        .subquery()
    )
    current_stage_subq = (
        select(RecCandidateStage.candidate_id, RecCandidateStage.stage_name, RecCandidateStage.started_at)
        .join(latest_stage_subq, latest_stage_subq.c.stage_id == RecCandidateStage.stage_id)
        .subquery()
    )
    interview_agg_subq = (
        select(
            RecCandidateInterview.candidate_id.label("candidate_id"),
            func.sum(
                case((func.lower(RecCandidateInterview.round_type).like("%l1%"), 1), else_=0)
            ).label("l1_interview_count"),
            func.max(
                case(
                    (
                        and_(
                            func.lower(RecCandidateInterview.round_type).like("%l1%"),
                            RecCandidateInterview.feedback_submitted.is_(True),
                        ),
                        1,
                    ),
                    else_=0,
                )
            ).label("l1_feedback_submitted"),
            func.sum(
                case((func.lower(RecCandidateInterview.round_type).like("%l2%"), 1), else_=0)
            ).label("l2_interview_count"),
            func.max(
                case(
                    (
                        and_(
                            func.lower(RecCandidateInterview.round_type).like("%l2%"),
                            RecCandidateInterview.feedback_submitted.is_(True),
                        ),
                        1,
                    ),
                    else_=0,
                )
            ).label("l2_feedback_submitted"),
        )
        .group_by(RecCandidateInterview.candidate_id)
        .subquery()
    )

    query = (
        select(
            RecCandidate.candidate_id,
            RecCandidate.candidate_code,
            RecCandidate.full_name,
            RecCandidate.status,
            RecCandidate.opening_id.label("opening_id"),
            RecCandidate.l2_owner_email.label("l2_owner_email"),
            RecCandidate.l2_owner_name.label("l2_owner_name"),
            RecCandidate.source_channel.label("source_channel"),
            RecCandidate.source_origin.label("source_origin"),
            RecCandidate.external_source_ref.label("external_source_ref"),
            RecCandidate.created_at.label("created_at"),
            RecCandidate.caf_sent_at.label("caf_sent_at"),
            RecCandidate.caf_submitted_at.label("caf_submitted_at"),
            RecCandidate.needs_hr_review.label("needs_hr_review"),
            RecOpening.title.label("opening_title"),
            RecCandidateScreening.screening_result.label("screening_result"),
            current_stage_subq.c.stage_name.label("current_stage"),
            func.coalesce(func.datediff(func.curdate(), current_stage_subq.c.started_at), 0).label("ageing_days"),
            func.coalesce(func.datediff(func.curdate(), RecCandidate.created_at), 0).label("applied_ageing_days"),
            func.coalesce(interview_agg_subq.c.l1_interview_count, 0).label("l1_interview_count"),
            func.coalesce(interview_agg_subq.c.l1_feedback_submitted, 0).label("l1_feedback_submitted"),
            func.coalesce(interview_agg_subq.c.l2_interview_count, 0).label("l2_interview_count"),
            func.coalesce(interview_agg_subq.c.l2_feedback_submitted, 0).label("l2_feedback_submitted"),
        )
        .select_from(RecCandidate)
        .outerjoin(RecOpening, RecOpening.opening_id == RecCandidate.opening_id)
        .outerjoin(RecCandidateScreening, RecCandidateScreening.candidate_id == RecCandidate.candidate_id)
        .outerjoin(current_stage_subq, current_stage_subq.c.candidate_id == RecCandidate.candidate_id)
        .outerjoin(interview_agg_subq, interview_agg_subq.c.candidate_id == RecCandidate.candidate_id)
        .order_by(RecCandidate.created_at.desc(), RecCandidate.candidate_id.desc())
        .limit(limit)
        .offset(offset)
    )

    if opening_id is not None:
        query = query.where(RecCandidate.opening_id == opening_id)
    if status_filter:
        query = query.where(RecCandidate.status.in_(status_filter))
    if stage:
        normalized: list[str] = []
        for item in stage:
            if item == "hr_screening":
                normalized.extend(["hr_screening", "caf"])
            elif item == "caf":
                normalized.extend(["caf", "hr_screening"])
            else:
                normalized.append(item)
        query = query.where(current_stage_subq.c.stage_name.in_(normalized))

    if _is_interviewer_scope(user):
        interviewer_id = _clean_person_id_platform(user.person_id_platform)
        user_email = (user.email or "").strip().lower()
        if not interviewer_id and not user_email:
            return []
        filters = []
        if interviewer_id:
            assigned_ids = (
                select(RecCandidateInterview.candidate_id)
                .where(RecCandidateInterview.interviewer_person_id_platform == interviewer_id)
                .subquery()
            )
            filters.append(RecCandidate.candidate_id.in_(select(assigned_ids.c.candidate_id)))
        if user_email:
            filters.append(func.lower(RecCandidate.l2_owner_email) == user_email)
        query = query.where(or_(*filters))

    rows = (await session.execute(query)).all()
    return [
        CandidateListItem(
            candidate_id=row.candidate_id,
            candidate_code=row.candidate_code or "",
            name=row.full_name,
            opening_id=row.opening_id,
            opening_title=row.opening_title,
            l2_owner_email=row.l2_owner_email,
            l2_owner_name=row.l2_owner_name,
            source_channel=row.source_channel,
            source_origin=row.source_origin,
            external_source_ref=row.external_source_ref,
            current_stage=row.current_stage,
            status=row.status,
            ageing_days=int(row.ageing_days or 0),
            applied_ageing_days=int(row.applied_ageing_days or 0),
            created_at=row.created_at,
            caf_sent_at=row.caf_sent_at,
            caf_submitted_at=row.caf_submitted_at,
            needs_hr_review=bool(row.needs_hr_review),
            screening_result=row.screening_result,
            l1_interview_count=int(row.l1_interview_count or 0),
            l1_feedback_submitted=bool(row.l1_feedback_submitted),
            l2_interview_count=int(row.l2_interview_count or 0),
            l2_feedback_submitted=bool(row.l2_feedback_submitted),
        )
        for row in rows
    ]


@router.get("/{candidate_id}", response_model=CandidateDetailOut)
async def get_candidate(
    candidate_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.HIRING_MANAGER, Role.INTERVIEWER, Role.GROUP_LEAD, Role.VIEWER])),
):
    candidate = await session.get(RecCandidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")
    await _assert_candidate_access(session, candidate_id, user)

    opening_title = None
    if candidate.opening_id is not None:
        opening_title = (
            await session.execute(select(RecOpening.title).where(RecOpening.opening_id == candidate.opening_id))
        ).scalar_one_or_none()

    current_stage = await _get_current_stage_name(session, candidate_id=candidate_id)
    duplicate_tag, duplicate_application_count, latest_reapplication_at = await _candidate_duplicate_metadata(
        session, candidate_id=candidate_id
    )
    return CandidateDetailOut(
        candidate_id=candidate.candidate_id,
        candidate_code=candidate.candidate_code or _candidate_code(candidate.candidate_id),
        name=candidate.full_name,
        first_name=candidate.first_name,
        last_name=candidate.last_name,
        email=candidate.email,
        phone=candidate.phone,
        opening_id=candidate.opening_id,
        opening_title=opening_title,
        l2_owner_email=candidate.l2_owner_email,
        l2_owner_name=candidate.l2_owner_name,
        source_channel=candidate.source_channel,
        source_origin=candidate.source_origin,
        external_source_ref=candidate.external_source_ref,
        educational_qualification=candidate.educational_qualification,
        years_of_experience=candidate.years_of_experience,
        city=candidate.city,
        terms_consent=candidate.terms_consent,
        terms_consent_at=candidate.terms_consent_at,
        status=candidate.status,
        current_stage=current_stage,
        final_decision=candidate.final_decision,
        hired_person_id_platform=candidate.hired_person_id_platform,
        cv_url=candidate.cv_url,
        resume_url=candidate.resume_url,
        portfolio_url=candidate.portfolio_url,
        portfolio_not_uploaded_reason=candidate.portfolio_not_uploaded_reason,
        drive_folder_url=candidate.drive_folder_url,
        caf_sent_at=candidate.caf_sent_at,
        caf_submitted_at=candidate.caf_submitted_at,
        needs_hr_review=bool(candidate.needs_hr_review),
        application_docs_status=candidate.application_docs_status,
        joining_docs_status=candidate.joining_docs_status,
        duplicate_tag=duplicate_tag,
        duplicate_application_count=duplicate_application_count,
        latest_reapplication_at=latest_reapplication_at,
        created_at=candidate.created_at,
        updated_at=candidate.updated_at,
    )


@router.get("/{candidate_id}/documents/{kind}")
async def download_candidate_application_document(
    candidate_id: int,
    kind: str,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.HIRING_MANAGER, Role.INTERVIEWER, Role.GROUP_LEAD, Role.VIEWER])),
):
    normalized = (kind or "").strip().lower()
    if normalized not in {"cv", "portfolio", "resume"}:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    candidate = await session.get(RecCandidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    if normalized == "cv":
        url = candidate.cv_url
    elif normalized == "resume":
        url = candidate.resume_url
    else:
        url = candidate.portfolio_url
    if not url:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    if url.startswith("/"):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Document stored locally; Drive storage is required.",
        )
    return RedirectResponse(url=url, status_code=status.HTTP_302_FOUND)


@router.get("/{candidate_id}/full", response_model=CandidateFullOut)
async def get_candidate_full(
    candidate_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.HIRING_MANAGER, Role.INTERVIEWER, Role.GROUP_LEAD, Role.VIEWER])),
):
    if not _can_manage_candidate_360(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Candidate 360 is not available for this role.")

    candidate = await get_candidate(candidate_id, session, user)  # type: ignore[arg-type]

    stages = await list_candidate_stages(candidate_id, session, user)  # type: ignore[arg-type]
    events = await list_candidate_events(candidate_id, session, user)  # type: ignore[arg-type]

    screening: ScreeningOut | None = None
    try:
        screening = await get_candidate_screening(candidate_id, session, user)  # type: ignore[arg-type]
    except HTTPException as exc:
        if exc.status_code not in {status.HTTP_404_NOT_FOUND, status.HTTP_503_SERVICE_UNAVAILABLE}:
            raise
    except OperationalError:
        # DB missing screening columns/table; treat as no screening instead of 500
        screening = None
    except SQLAlchemyError:
        screening = None

    assessment: CandidateAssessmentOut | None = None
    try:
        assessment_row = (
            await session.execute(
                select(RecCandidateAssessment).where(RecCandidateAssessment.candidate_id == candidate_id)
            )
        ).scalars().first()
        if assessment_row:
            assessment = CandidateAssessmentOut.model_validate(assessment_row)
    except OperationalError:
        assessment = None
    except SQLAlchemyError:
        assessment = None

    return CandidateFullOut(candidate=candidate, stages=stages, events=events, screening=screening, assessment=assessment)


@router.get("/{candidate_id}/screening", response_model=ScreeningOut)
async def get_candidate_screening(
    candidate_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.HIRING_MANAGER, Role.INTERVIEWER, Role.GROUP_LEAD, Role.VIEWER])),
):
    candidate = await session.get(RecCandidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")
    await _assert_candidate_access(session, candidate_id, user)

    try:
        screening = (
            await session.execute(
                select(RecCandidateScreening).where(RecCandidateScreening.candidate_id == candidate_id)
            )
        ).scalars().first()
    except OperationalError:
        # DB is missing screening columns/table (migration not applied)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Screening table/columns missing (apply migration 0002)")

    if not screening:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No screening data yet")

    return ScreeningOut.model_validate(screening)


@router.put("/{candidate_id}/screening", response_model=ScreeningOut)
async def upsert_candidate_screening(
    candidate_id: int,
    payload: ScreeningUpsertIn,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_superadmin()),
):
    candidate = await session.get(RecCandidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    now = now_ist_naive()
    screening = (
        await session.execute(
            select(RecCandidateScreening).where(RecCandidateScreening.candidate_id == candidate_id)
        )
    ).scalars().first()
    if screening is None:
        screening = RecCandidateScreening(candidate_id=candidate_id, created_at=now, updated_at=now)
        session.add(screening)

    data = payload.model_dump(exclude_none=True)
    for key, value in data.items():
        setattr(screening, key, value)
    screening.updated_at = now

    opening_config = get_opening_config(candidate.opening_id)
    decision = evaluate_screening(payload, opening_config)
    screening.screening_result = decision
    candidate.needs_hr_review = decision == "amber"
    candidate.updated_at = now

    await log_event(
        session,
        candidate_id=candidate_id,
        action_type="screening_admin_update",
        performed_by_person_id_platform=_platform_person_id(user),
        related_entity_type="candidate",
        related_entity_id=candidate_id,
        meta_json={"screening_result": decision},
    )

    await session.commit()
    await session.refresh(screening)
    return ScreeningOut.model_validate(screening)


@router.get("/{candidate_id}/caf-link")
async def get_candidate_caf_link(
    candidate_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC])),
):
    candidate = await session.get(RecCandidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")
    now = now_ist_naive()
    refreshed = False
    if not candidate.caf_token:
        candidate.caf_token = uuid4().hex
        refreshed = True
    if candidate.caf_submitted_at is None and (candidate.caf_sent_at is None or _caf_expired_for_candidate(candidate, now=now)):
        candidate.caf_sent_at = now
        refreshed = True
    if refreshed:
        candidate.updated_at = now
        await log_event(
            session,
            candidate_id=candidate.candidate_id,
            action_type="caf_link_generated",
            performed_by_person_id_platform=_platform_person_id(user),
            related_entity_type="candidate",
            related_entity_id=candidate.candidate_id,
            meta_json={"caf_token": candidate.caf_token, "reason": "manual_link_refresh"},
        )
        await session.commit()
    return {"caf_token": candidate.caf_token, "caf_url": build_public_path(f"/caf/{candidate.caf_token}")}


@router.get("/{candidate_id}/assessment-link")
async def get_candidate_assessment_link(
    candidate_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC])),
):
    candidate = await session.get(RecCandidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    assessment = (
        await session.execute(
            select(RecCandidateAssessment).where(RecCandidateAssessment.candidate_id == candidate_id)
        )
    ).scalars().first()

    now = now_ist_naive()
    generated = False
    if not assessment:
        assessment = RecCandidateAssessment(
            candidate_id=candidate_id,
            assessment_token=uuid4().hex,
            created_at=now,
            updated_at=now,
        )
        session.add(assessment)
        generated = True
    elif not assessment.assessment_token:
        assessment.assessment_token = uuid4().hex
        assessment.updated_at = now
        generated = True

    if not assessment.assessment_token:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Assessment token unavailable")

    if generated:
        await log_event(
            session,
            candidate_id=candidate_id,
            action_type="assessment_link_generated",
            performed_by_person_id_platform=_platform_person_id(user),
            related_entity_type="candidate",
            related_entity_id=candidate_id,
            meta_json={"assessment_token": assessment.assessment_token},
        )

    await session.commit()
    return {
        "assessment_token": assessment.assessment_token,
        "assessment_url": build_public_path(f"/assessment/{assessment.assessment_token}"),
    }


@router.post("/{candidate_id}/assessment-link/resend")
async def resend_candidate_assessment_link(
    candidate_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC])),
):
    candidate = await session.get(RecCandidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    send_result = await _send_assessment_link_for_l2_shortlist(
        session,
        candidate=candidate,
        user=user,
        force_resend=True,
        trigger_source="manual_resend",
    )
    await session.commit()

    assessment_token = _strip_optional(str(send_result.get("assessment_token") or ""))
    payload = {
        "candidate_id": candidate_id,
        "attempted": bool(send_result.get("attempted")),
        "email_status": _strip_optional(str(send_result.get("status") or "")) or "unknown",
    }
    if assessment_token:
        payload["assessment_token"] = assessment_token
        payload["assessment_url"] = build_public_path(f"/assessment/{assessment_token}")
    reason = _strip_optional(str(send_result.get("reason") or ""))
    if reason:
        payload["reason"] = reason
    error = _strip_optional(str(send_result.get("error") or ""))
    if error:
        payload["email_error"] = error
    return payload


@router.patch("/{candidate_id}", response_model=CandidateDetailOut)
async def update_candidate(
    candidate_id: int,
    payload: CandidateUpdate,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC])),
):
    candidate = await session.get(RecCandidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    now = now_ist_naive()
    updates = payload.model_dump(exclude_none=True)
    name_update = updates.pop("name", None)
    first_name_update = updates.pop("first_name", None)
    last_name_update = updates.pop("last_name", None)

    if name_update is not None:
        normalized_name = (name_update or "").strip()
        if not normalized_name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Name cannot be empty.")
        candidate.full_name = normalized_name
        if first_name_update is None and last_name_update is None:
            parsed_first, parsed_last = _split_name(normalized_name)
            if parsed_first:
                candidate.first_name = parsed_first
            candidate.last_name = parsed_last

    if first_name_update is not None:
        normalized_first = (first_name_update or "").strip()
        if not normalized_first:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="First name cannot be empty.")
        candidate.first_name = normalized_first
    if last_name_update is not None:
        normalized_last = (last_name_update or "").strip()
        candidate.last_name = normalized_last or None
    if first_name_update is not None or last_name_update is not None:
        candidate.full_name = _compose_full_name(candidate.first_name or "", candidate.last_name)

    if "l2_owner_email" in updates:
        updates["l2_owner_email"] = str(updates["l2_owner_email"]).lower()
    if "city" in updates:
        updates["city"] = _strip_optional(updates["city"])
        updates["current_location"] = updates["city"]
    if "terms_consent" in updates:
        accepted = bool(updates["terms_consent"])
        updates["terms_consent"] = accepted
        updates["terms_consent_at"] = now if accepted else None
    for key, value in updates.items():
        setattr(candidate, key, value)
    if any(key in updates for key in {"cv_url", "portfolio_url", "resume_url"}):
        candidate.application_docs_status = _application_docs_status(
            cv_url=candidate.cv_url,
            portfolio_url=candidate.portfolio_url,
            resume_url=candidate.resume_url,
        )
    candidate.updated_at = now

    await log_event(
        session,
        candidate_id=candidate_id,
        action_type="candidate_updated",
        performed_by_person_id_platform=_platform_person_id(user),
        related_entity_type="candidate",
        related_entity_id=candidate_id,
        meta_json=payload.model_dump(exclude_none=True),
    )

    await session.commit()
    return await get_candidate(candidate_id, session, user)  # type: ignore[arg-type]


@router.delete("/{candidate_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_candidate(
    candidate_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_superadmin()),
):
    candidate = await session.get(RecCandidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")
    try:
        await _delete_candidate_with_dependents(session, candidate)
        await session.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    except SQLAlchemyError as exc:
        await session.rollback()
        remaining = await session.get(RecCandidate, candidate_id)
        if remaining is None:
            return Response(status_code=status.HTTP_204_NO_CONTENT)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Candidate could not be deleted: {exc}")
    except Exception as exc:
        await session.rollback()
        logger.exception("Candidate delete failed: candidate_id=%s error=%s", candidate_id, exc)
        remaining = await session.get(RecCandidate, candidate_id)
        if remaining is None:
            return Response(status_code=status.HTTP_204_NO_CONTENT)
        detail = "Candidate could not be deleted."
        if settings.environment != "production":
            detail = f"Candidate could not be deleted: {exc}"
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=detail)


class DriveCleanupRequest(BaseModel):
    bucket: str = "Ongoing"


@router.post("/drive/cleanup", status_code=status.HTTP_200_OK)
async def cleanup_candidate_folders(
    payload: DriveCleanupRequest,
    _session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_superadmin()),
):
    bucket = payload.bucket
    if bucket not in {"Ongoing", "Appointed", "Not Appointed"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid bucket")
    deleted = await anyio.to_thread.run_sync(delete_all_candidate_folders, bucket)  # type: ignore[arg-type]
    return {"deleted": deleted}


@router.get("/{candidate_id}/events", response_model=list[CandidateEventOut])
async def list_candidate_events(
    candidate_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.HIRING_MANAGER, Role.INTERVIEWER, Role.GROUP_LEAD, Role.VIEWER])),
):
    candidate = await session.get(RecCandidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")
    await _assert_candidate_access(session, candidate_id, user)

    rows = (
        await session.execute(
            select(RecCandidateEvent)
            .where(RecCandidateEvent.candidate_id == candidate_id)
            .order_by(RecCandidateEvent.created_at.asc(), RecCandidateEvent.candidate_event_id.asc())
        )
    ).scalars()

    out: list[CandidateEventOut] = []
    for event in rows:
        meta: dict = {}
        if event.meta_json:
            try:
                meta = json.loads(event.meta_json) if isinstance(event.meta_json, str) else {}
            except Exception:
                meta = {}
        performed_by_name = meta.get("performed_by_name") if isinstance(meta, dict) else None
        performed_by_email = meta.get("performed_by_email") if isinstance(meta, dict) else None
        out.append(
            CandidateEventOut(
                event_id=event.candidate_event_id,
                candidate_id=event.candidate_id,
                candidate_name=candidate.full_name,
                candidate_code=candidate.candidate_code,
                action_type=event.action_type,
                performed_by_person_id_platform=event.performed_by_person_id_platform,
                performed_by_name=performed_by_name,
                performed_by_email=performed_by_email,
                meta_json=meta,
                created_at=event.created_at,
            )
        )
    return out


@router.get("/{candidate_id}/offers", response_model=list[OfferOut])
async def list_candidate_offers(
    candidate_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    _user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC])),
):
    await _assert_candidate_access(session, candidate_id, _user)
    rows = (
        await session.execute(
            select(RecCandidateOffer)
            .where(RecCandidateOffer.candidate_id == candidate_id)
            .order_by(RecCandidateOffer.created_at.desc(), RecCandidateOffer.candidate_offer_id.desc())
        )
    ).scalars().all()
    for offer in rows:
        await _ensure_offer_token(session, offer)
    await session.commit()
    return [_offer_out_payload(row) for row in rows]


@router.post("/{candidate_id}/offers", response_model=OfferOut, status_code=status.HTTP_201_CREATED)
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
    await session.commit()
    await session.refresh(offer)
    return _offer_out_payload(offer)


@router.get("/{candidate_id}/stages", response_model=list[CandidateStageOut])
async def list_candidate_stages(
    candidate_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.HIRING_MANAGER, Role.INTERVIEWER, Role.GROUP_LEAD, Role.VIEWER])),
):
    candidate = await session.get(RecCandidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")
    await _assert_candidate_access(session, candidate_id, user)

    stages = (
        await session.execute(
            select(RecCandidateStage)
            .where(RecCandidateStage.candidate_id == candidate_id)
            .order_by(RecCandidateStage.started_at.asc(), RecCandidateStage.stage_id.asc())
        )
    ).scalars()
    return [CandidateStageOut.model_validate(stage) for stage in stages]


@router.post("/{candidate_id}/transition", status_code=status.HTTP_202_ACCEPTED)
async def transition_stage(
    candidate_id: int,
    payload: StageTransitionRequest,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.HIRING_MANAGER, Role.INTERVIEWER, Role.GROUP_LEAD])),
):
    candidate = await session.get(RecCandidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")
    if not _can_manage_candidate_360(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Candidate 360 actions are restricted for this role.")

    result = await apply_stage_transition(
        session,
        candidate=candidate,
        to_stage=payload.to_stage,
        decision=payload.decision,
        reason=payload.reason,
        note=payload.note,
        user=user,
        source="candidate_transition",
    )

    if result.changed and result.to_stage == "l2_shortlist":
        await _send_assessment_link_for_l2_shortlist(session, candidate=candidate, user=user)

    await session.commit()
    return {
        "candidate_id": candidate_id,
        "from_stage": result.from_stage,
        "to_stage": result.to_stage,
        "status": candidate.status,
    }


@router.post("/{candidate_id}/convert", status_code=status.HTTP_200_OK)
async def convert_candidate(
    candidate_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC])),
):
    candidate = await session.get(RecCandidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")
    offer = (
        await session.execute(
            select(RecCandidateOffer)
            .where(RecCandidateOffer.candidate_id == candidate_id, RecCandidateOffer.offer_status == "accepted")
            .order_by(RecCandidateOffer.accepted_at.desc(), RecCandidateOffer.candidate_offer_id.desc())
            .limit(1)
        )
    ).scalars().first()
    if not offer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No accepted offer found")
    await convert_candidate_to_employee(session, candidate=candidate, offer=offer, user=user)
    await session.commit()
    return {"candidate_id": candidate_id, "status": candidate.status, "final_decision": candidate.final_decision}
