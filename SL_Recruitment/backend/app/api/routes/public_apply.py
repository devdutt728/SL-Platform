from datetime import datetime, timedelta
import hashlib
import json
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
from app.models.opening import RecOpening
from app.models.stage import RecCandidateStage
from app.models.screening import RecCandidateScreening
from app.services.drive import create_candidate_folder, upload_application_doc
from app.services.email import send_email
from app.services.events import log_event
from app.services.local_docs import save_application_doc
from app.services.opening_config import get_opening_config
from app.services.screening_rules import evaluate_screening
from app.schemas.screening import ScreeningUpsertIn

router = APIRouter(prefix="/apply", tags=["apply"])

IDEMPOTENCY_TTL = timedelta(hours=24)
RATE_LIMIT_WINDOW = timedelta(minutes=1)
RATE_LIMIT_MAX = 5


class PublicApplyIn(BaseModel):
    name: str
    email: EmailStr
    phone: str | None = None
    cv_url: str | None = None


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
    return f"SLR-{candidate_id:06d}"


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
    if val in {"yes", "true", "1"}:
        return True
    if val in {"no", "false", "0"}:
        return False
    return None


def _float_or_none(raw: str | None) -> float | None:
    if raw is None:
        return None
    s = raw.strip()
    if not s:
        return None
    try:
        return float(s)
    except Exception:
        return None


def _validate_currency(value: float | None, field: str) -> float | None:
    if value is None:
        return None
    # DECIMAL(12,2) max value is 99_999_999_99.99, keep a small buffer.
    if abs(value) > 9_999_999_999.99:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field} is too large. Please enter a realistic amount (max 9,999,999,999.99).",
        )
    return value


def _int_or_none(raw: str | None) -> int | None:
    if raw is None:
        return None
    s = raw.strip()
    if not s:
        return None
    try:
        return int(s)
    except Exception:
        return None


def _date_or_none(raw: str | None):
    if raw is None:
        return None
    s = raw.strip()
    if not s:
        return None
    try:
        return datetime.fromisoformat(s).date()
    except Exception:
        return None


async def _transition_from_caf(session: AsyncSession, *, candidate_id: int, to_stage: str) -> None:
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
        performed_by_person_id_platform=None,
        related_entity_type="candidate",
        related_entity_id=candidate_id,
        from_status=from_stage,
        to_status=to_stage,
        meta_json={"from_stage": from_stage, "to_stage": to_stage, "reason": "caf_screening"},
    )


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
    name: str = Form(...),
    email: EmailStr = Form(...),
    phone: str | None = Form(default=None),
    linkedin: str | None = Form(default=None),
    note: str | None = Form(default=None),
    current_city: str | None = Form(default=None),
    current_employer: str | None = Form(default=None),
    total_experience_years: str | None = Form(default=None),
    relevant_experience_years: str | None = Form(default=None),
    current_ctc_annual: str | None = Form(default=None),
    expected_ctc_annual: str | None = Form(default=None),
    willing_to_relocate: str | None = Form(default=None),
    notice_period_days: str | None = Form(default=None),
    expected_joining_date: str | None = Form(default=None),
    relocation_notes: str | None = Form(default=None),
    questions_from_candidate: str | None = Form(default=None),
    reason_for_job_change: str | None = Form(default=None),
    gender_identity: str | None = Form(default=None),
    gender_self_describe: str | None = Form(default=None),
    portfolio_not_uploaded_reason: str | None = Form(default=None),
    cv_file: UploadFile | None = File(default=None),
    portfolio_file: UploadFile | None = File(default=None),
    session: AsyncSession = Depends(deps.get_db_session),
):
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
            "name": (name or "").strip(),
            "phone": (phone or "").strip() if phone else None,
            "linkedin": (linkedin or "").strip() if linkedin else None,
            "note": (note or "").strip() if note else None,
            "current_city": (current_city or "").strip() if current_city else None,
            "current_employer": (current_employer or "").strip() if current_employer else None,
            "total_experience_years": (total_experience_years or "").strip() if total_experience_years else None,
            "relevant_experience_years": (relevant_experience_years or "").strip() if relevant_experience_years else None,
            "current_ctc_annual": (current_ctc_annual or "").strip() if current_ctc_annual else None,
            "expected_ctc_annual": (expected_ctc_annual or "").strip() if expected_ctc_annual else None,
            "willing_to_relocate": (willing_to_relocate or "").strip() if willing_to_relocate else None,
            "notice_period_days": (notice_period_days or "").strip() if notice_period_days else None,
            "expected_joining_date": (expected_joining_date or "").strip() if expected_joining_date else None,
            "relocation_notes": (relocation_notes or "").strip() if relocation_notes else None,
            "questions_from_candidate": (questions_from_candidate or "").strip() if questions_from_candidate else None,
            "reason_for_job_change": (reason_for_job_change or "").strip() if reason_for_job_change else None,
            "gender_identity": (gender_identity or "").strip() if gender_identity else None,
            "gender_self_describe": (gender_self_describe or "").strip() if gender_self_describe else None,
            "portfolio_not_uploaded_reason": (portfolio_not_uploaded_reason or "").strip() if portfolio_not_uploaded_reason else None,
            "cv_filename": cv_file.filename if cv_file else None,
            "portfolio_filename": portfolio_file.filename if portfolio_file else None,
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
            caf_url=f"/caf/{caf_token_existing}",
            screening_result=None,
            already_applied=True,
        ).model_dump()
        idem.status_code = status.HTTP_200_OK
        idem.response_json = json.dumps(response_payload, ensure_ascii=True)
        idem.updated_at = now
        await session.commit()
        return JSONResponse(content=response_payload, status_code=status.HTTP_200_OK)

    caf_token = uuid4().hex
    application_docs_status = "complete" if cv_file else "none"
    first_name, last_name = _split_name(name)
    temp_candidate_code = uuid4().hex[:8].upper()

    candidate = RecCandidate(
        candidate_code=temp_candidate_code,
        first_name=first_name,
        last_name=last_name,
        full_name=name,
        email=email_normalized,
        phone=phone,
        source_channel="website",
        opening_id=opening.opening_id,
        status="enquiry",
        cv_url=None,
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
                caf_url=f"/caf/{caf_token_existing}",
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

    enquiry = RecCandidateStage(
        candidate_id=candidate.candidate_id,
        stage_name="enquiry",
        stage_status="completed",
        started_at=now,
        ended_at=now,
        created_at=now,
    )
    hr_screening = RecCandidateStage(
        candidate_id=candidate.candidate_id,
        stage_name="hr_screening",
        stage_status="pending",
        started_at=now,
        created_at=now,
    )
    session.add_all([enquiry, hr_screening])

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
            "linkedin": linkedin,
            "note": note,
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

    await send_email(
        session,
        candidate_id=candidate.candidate_id,
        to_emails=[candidate.email],
        subject="Complete your Candidate Application Form",
        template_name="caf_link",
        context={"candidate_name": candidate.full_name, "caf_link": f"/caf/{caf_token}"},
        email_type="caf_link",
        meta_extra={"caf_token": caf_token},
    )

    # Best-effort Drive folder creation
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

    def _clean_name(name: str | None) -> str:
        if not name:
            return "file"
        return name.replace("/", "_").replace("\\", "_")

    async def _upload(kind: str, upload: UploadFile, max_bytes: int) -> str | None:
        data = await upload.read()
        if len(data) > max_bytes:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{kind.upper()} file too large. Max allowed is {max_bytes // (1024 * 1024)}MB.",
            )

        if drive_folder_id:
            filename = f"{candidate.candidate_code}-{kind}-{_clean_name(upload.filename)}"
            try:
                _, file_url = await anyio.to_thread.run_sync(
                    lambda: upload_application_doc(
                        drive_folder_id,
                        filename=filename,
                        content_type=upload.content_type or "application/octet-stream",
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

        stored_path = save_application_doc(
            candidate.candidate_id,
            kind=kind,
            filename=upload.filename,
            content_type=upload.content_type,
            data=data,
        )
        local_url = f"/api/rec/candidates/{candidate.candidate_id}/documents/{kind}"
        await log_event(
            session,
            candidate_id=candidate.candidate_id,
            action_type=f"{kind}_stored_local",
            performed_by_person_id_platform=None,
            related_entity_type="candidate",
            related_entity_id=candidate.candidate_id,
            meta_json={"local_url": local_url, "path": str(stored_path)},
        )
        return local_url

    cv_url: str | None = None
    portfolio_url: str | None = None
    if cv_file:
        cv_url = await _upload("cv", cv_file, max_bytes=2 * 1024 * 1024)
    if portfolio_file:
        portfolio_url = await _upload("portfolio", portfolio_file, max_bytes=10 * 1024 * 1024)

    if cv_url:
        candidate.cv_url = cv_url
    if portfolio_url:
        candidate.portfolio_url = portfolio_url
        candidate.portfolio_not_uploaded_reason = None
    else:
        candidate.portfolio_not_uploaded_reason = (portfolio_not_uploaded_reason or "").strip() or None

    candidate.application_docs_status = "complete" if (cv_url or portfolio_url) else "none"
    candidate.linkedin_url = linkedin or None

    # Auto-submit CAF data from the same form
    screening_data = {
        "current_city": (current_city or "").strip() or None,
        "current_employer": (current_employer or "").strip() or None,
        "total_experience_years": _float_or_none(total_experience_years),
        "relevant_experience_years": _float_or_none(relevant_experience_years),
        "current_ctc_annual": _validate_currency(_float_or_none(current_ctc_annual), "Current CTC"),
        "expected_ctc_annual": _validate_currency(_float_or_none(expected_ctc_annual), "Expected CTC"),
        "willing_to_relocate": _bool_or_none(willing_to_relocate),
        "notice_period_days": _int_or_none(notice_period_days),
        "expected_joining_date": _date_or_none(expected_joining_date),
        "reason_for_job_change": (reason_for_job_change or "").strip() or None,
        "gender_identity": (gender_identity or "").strip() or None,
        "gender_self_describe": (gender_self_describe or "").strip() or None,
        "relocation_notes": (relocation_notes or "").strip() or None,
        "questions_from_candidate": (questions_from_candidate or "").strip() or None,
    }

    decision: str | None = None
    # If any screening field is provided, upsert CAF and evaluate
    if any(value is not None for value in screening_data.values()):
        screening = (
            await session.execute(
                select(RecCandidateScreening).where(RecCandidateScreening.candidate_id == candidate.candidate_id)
            )
        ).scalars().first()
        now = datetime.utcnow()
        if screening is None:
            screening = RecCandidateScreening(candidate_id=candidate.candidate_id, created_at=now, updated_at=now)
            session.add(screening)
        for key, value in screening_data.items():
            setattr(screening, key, value)
        screening.updated_at = now
        candidate.caf_submitted_at = now

        opening_config = get_opening_config(candidate.opening_id)
        screening_input = ScreeningUpsertIn(**screening_data)
        decision = evaluate_screening(screening_input, opening_config)
        screening.screening_result = decision

        if decision == "green":
            candidate.needs_hr_review = False
            candidate.status = "in_process"
            await _transition_from_caf(session, candidate_id=candidate.candidate_id, to_stage="l2")
        elif decision == "red":
            candidate.needs_hr_review = False
            candidate.status = "rejected"
            await _transition_from_caf(session, candidate_id=candidate.candidate_id, to_stage="rejected")
        else:
            candidate.needs_hr_review = True
            candidate.status = "in_process"

        await log_event(
            session,
            candidate_id=candidate.candidate_id,
            action_type="caf_submitted",
            performed_by_person_id_platform=None,
            related_entity_type="candidate",
            related_entity_id=candidate.candidate_id,
            meta_json={"screening_result": decision},
        )

    response_payload = PublicApplyOut(
        candidate_id=candidate.candidate_id,
        candidate_code=candidate.candidate_code,
        caf_token=caf_token,
        caf_url=f"/caf/{caf_token}",
        screening_result=decision,
        already_applied=False,
    ).model_dump()

    idem.status_code = status.HTTP_201_CREATED
    idem.response_json = json.dumps(response_payload, ensure_ascii=True)
    idem.updated_at = datetime.utcnow()

    await session.commit()
    return JSONResponse(content=response_payload, status_code=status.HTTP_201_CREATED)
