from datetime import datetime

import anyio
from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Request, UploadFile, status
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core.auth import require_roles
from app.core.config import settings
from app.core.roles import Role
from app.core.uploads import DOC_EXTENSIONS, DOC_MIME_TYPES, validate_upload
from app.models.candidate import RecCandidate
from app.models.candidate_offer import RecCandidateOffer
from app.models.joining_doc import RecCandidateJoiningDoc
from app.models.joining_profile import RecCandidateJoiningProfile
from app.models.opening import RecOpening
from app.schemas.joining_docs import (
    JoiningDocOut,
    JoiningDocPublicOut,
    JoiningDocsPublicContext,
    JoiningProfileInternalUpsertIn,
    JoiningProfileOut,
    JoiningProfilePublicIn,
    JoiningProfilePublicOut,
)
from app.schemas.user import UserContext
from app.services.drive import upload_joining_doc
from app.services.events import log_event
from app.services.offers import verify_joining_link_signature

router = APIRouter(prefix="/rec/candidates", tags=["joining-docs"])
public_router = APIRouter(prefix="/joining", tags=["joining-docs-public"])

JOINING_DOC_TYPES = {
    "pan",
    "aadhaar",
    "marksheets",
    "experience_letters",
    "salary_slips",
    "other",
}

REQUIRED_JOINING_DOC_TYPES = {
    "pan",
    "aadhaar",
    "marksheets",
    "experience_letters",
}

JOINING_PROFILE_FIELDS = (
    "personal_id",
    "middle_name",
    "date_of_birth",
    "gender",
    "marital_status",
    "marriage_date",
    "blood_group",
    "physically_handicapped",
    "nationality",
    "mobile_number",
    "personal_email",
    "current_address_line_1",
    "current_address_line_2",
    "current_address_city",
    "current_address_state",
    "current_address_zip",
    "current_address_country",
    "permanent_address_line_1",
    "permanent_address_line_2",
    "permanent_address_city",
    "permanent_address_state",
    "permanent_address_zip",
    "permanent_address_country",
    "father_name",
    "mother_name",
    "spouse_name",
    "children_names",
    "aadhaar_number",
    "pf_number",
    "uan_number",
)


def _canonical_doc_type(raw: str | None) -> str | None:
    value = (raw or "").strip().lower().replace(" ", "_")
    if value == "aadhar":
        value = "aadhaar"
    if value in {"mark_sheets", "mark_sheet"}:
        value = "marksheets"
    if value in {"experience_letter", "experienceletters"}:
        value = "experience_letters"
    if value in {"salary_slip", "salaryslip"}:
        value = "salary_slips"
    if value in JOINING_DOC_TYPES:
        return value
    return None


def _validate_public_joining_signature(request: Request, token: str) -> None:
    exp = request.query_params.get("exp")
    sig = request.query_params.get("sig")
    has_internal_cookie = bool(request.cookies.get("slr_token"))
    if settings.environment == "production" or not has_internal_cookie:
        if not verify_joining_link_signature(token, exp, sig):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid or expired joining link")


def _normalize_doc_type(raw: str | None) -> str:
    value = _canonical_doc_type(raw)
    if value is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid document type.")
    return value


def _is_missing_joining_profile_table_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return "doesn't exist" in message or "unknown table" in message


async def _get_joining_profile(
    session: AsyncSession,
    *,
    candidate_id: int,
) -> RecCandidateJoiningProfile | None:
    try:
        return await session.get(RecCandidateJoiningProfile, candidate_id)
    except SQLAlchemyError as exc:
        if _is_missing_joining_profile_table_error(exc):
            return None
        raise


async def _get_or_create_joining_profile(
    session: AsyncSession,
    *,
    candidate_id: int,
) -> RecCandidateJoiningProfile:
    existing = await _get_joining_profile(session, candidate_id=candidate_id)
    if existing is not None:
        return existing
    profile = RecCandidateJoiningProfile(candidate_id=candidate_id, created_at=datetime.utcnow(), updated_at=datetime.utcnow())
    session.add(profile)
    try:
        await session.flush()
    except SQLAlchemyError as exc:
        if _is_missing_joining_profile_table_error(exc):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Joining profile table is missing. Apply migration `backend/migrations/0041_rec_candidate_joining_profile.sql`.",
            ) from exc
        raise
    return profile


def _apply_joining_profile_payload(
    profile: RecCandidateJoiningProfile,
    payload: JoiningProfilePublicIn | JoiningProfileInternalUpsertIn,
) -> None:
    data = payload.model_dump(exclude_unset=True)
    for field_name in JOINING_PROFILE_FIELDS:
        if field_name in data:
            setattr(profile, field_name, data[field_name])
    if isinstance(payload, JoiningProfileInternalUpsertIn):
        if "pan_verified" in data:
            profile.pan_verified = bool(data["pan_verified"])
        if "aadhaar_verified" in data:
            profile.aadhaar_verified = bool(data["aadhaar_verified"])


def _public_joining_profile_out(profile: RecCandidateJoiningProfile | None) -> JoiningProfilePublicOut | None:
    if profile is None:
        return None
    return JoiningProfilePublicOut(
        personal_id=profile.personal_id,
        middle_name=profile.middle_name,
        date_of_birth=profile.date_of_birth,
        gender=profile.gender,
        marital_status=profile.marital_status,
        marriage_date=profile.marriage_date,
        blood_group=profile.blood_group,
        physically_handicapped=profile.physically_handicapped,
        nationality=profile.nationality,
        mobile_number=profile.mobile_number,
        personal_email=profile.personal_email,
        current_address_line_1=profile.current_address_line_1,
        current_address_line_2=profile.current_address_line_2,
        current_address_city=profile.current_address_city,
        current_address_state=profile.current_address_state,
        current_address_zip=profile.current_address_zip,
        current_address_country=profile.current_address_country,
        permanent_address_line_1=profile.permanent_address_line_1,
        permanent_address_line_2=profile.permanent_address_line_2,
        permanent_address_city=profile.permanent_address_city,
        permanent_address_state=profile.permanent_address_state,
        permanent_address_zip=profile.permanent_address_zip,
        permanent_address_country=profile.permanent_address_country,
        father_name=profile.father_name,
        mother_name=profile.mother_name,
        spouse_name=profile.spouse_name,
        children_names=profile.children_names,
        aadhaar_number=profile.aadhaar_number,
        pf_number=profile.pf_number,
        uan_number=profile.uan_number,
        profile_status=profile.profile_status,
        submitted_at=profile.submitted_at,
    )


def _refresh_profile_verification_state(profile: RecCandidateJoiningProfile) -> None:
    if not (profile.personal_id or "").strip():
        profile.pan_verified = False
    if not (profile.aadhaar_number or "").strip():
        profile.aadhaar_verified = False
    if profile.pan_verified and profile.aadhaar_verified:
        profile.verified_at = datetime.utcnow()
    elif not profile.pan_verified or not profile.aadhaar_verified:
        profile.verified_at = None


async def _update_joining_docs_status(session: AsyncSession, *, candidate: RecCandidate) -> str:
    rows = (
        await session.execute(
            select(RecCandidateJoiningDoc.doc_type).where(RecCandidateJoiningDoc.candidate_id == candidate.candidate_id)
        )
    ).scalars().all()
    seen = {
        normalized
        for normalized in (_canonical_doc_type(str(r)) for r in rows if r)
        if normalized is not None
    }
    if not seen:
        status_value = "none"
    elif REQUIRED_JOINING_DOC_TYPES.issubset(seen):
        status_value = "complete"
    else:
        status_value = "partial"
    candidate.joining_docs_status = status_value
    candidate.updated_at = datetime.utcnow()
    return status_value


async def _upload_joining_doc(
    session: AsyncSession,
    *,
    candidate: RecCandidate,
    doc_type: str,
    upload: UploadFile,
    uploaded_by: str,
    uploaded_by_person_id_platform: int | None,
) -> RecCandidateJoiningDoc:
    if not candidate.drive_folder_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Drive folder missing; please retry later.",
        )

    safe_name = validate_upload(upload, allowed_extensions=DOC_EXTENSIONS, allowed_mime_types=DOC_MIME_TYPES)
    data = await upload.read()
    max_bytes = 10 * 1024 * 1024
    if len(data) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File too large. Max allowed is 10MB.",
        )

    filename = f"{candidate.candidate_code}-joining-{doc_type}-{safe_name}"
    try:
        file_id, file_url = await anyio.to_thread.run_sync(
            lambda: upload_joining_doc(
                candidate.drive_folder_id,
                filename=filename,
                content_type=upload.content_type or "application/octet-stream",
                data=data,
            )
        )
    except Exception as exc:  # noqa: BLE001
        await log_event(
            session,
            candidate_id=candidate.candidate_id,
            action_type="joining_doc_upload_failed",
            performed_by_person_id_platform=uploaded_by_person_id_platform,
            related_entity_type="candidate",
            related_entity_id=candidate.candidate_id,
            meta_json={"error": str(exc), "doc_type": doc_type},
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to upload document to Drive. Please retry later.",
        )

    record = RecCandidateJoiningDoc(
        candidate_id=candidate.candidate_id,
        doc_type=doc_type,
        file_id=file_id,
        file_url=file_url,
        file_name=safe_name,
        content_type=upload.content_type,
        uploaded_by=uploaded_by,
        uploaded_by_person_id_platform=uploaded_by_person_id_platform,
        created_at=datetime.utcnow(),
    )
    session.add(record)
    await _update_joining_docs_status(session, candidate=candidate)
    await session.flush()
    await log_event(
        session,
        candidate_id=candidate.candidate_id,
        action_type="joining_doc_uploaded",
        performed_by_person_id_platform=uploaded_by_person_id_platform,
        related_entity_type="candidate",
        related_entity_id=candidate.candidate_id,
        meta_json={"doc_type": doc_type, "file_id": file_id},
    )
    return record


@router.get("/{candidate_id}/joining-docs", response_model=list[JoiningDocOut])
async def list_joining_docs(
    candidate_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.HIRING_MANAGER, Role.INTERVIEWER, Role.VIEWER])),
):
    candidate = await session.get(RecCandidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")
    # Heal stale status values (legacy doc_type spellings) whenever docs are fetched.
    previous_status = (candidate.joining_docs_status or "").strip().lower()
    current_status = previous_status
    try:
        current_status = await _update_joining_docs_status(session, candidate=candidate)
    except SQLAlchemyError as exc:
        if "doesn't exist" in str(exc).lower():
            return []
        raise

    try:
        docs = (
            await session.execute(
                select(RecCandidateJoiningDoc)
                .where(RecCandidateJoiningDoc.candidate_id == candidate_id)
                .order_by(RecCandidateJoiningDoc.created_at.desc(), RecCandidateJoiningDoc.joining_doc_id.desc())
            )
        ).scalars().all()
    except SQLAlchemyError as exc:
        if "doesn't exist" in str(exc).lower():
            return []
        raise
    if current_status != previous_status:
        await session.commit()
    return [JoiningDocOut.model_validate(doc) for doc in docs]


@router.post("/{candidate_id}/joining-docs", response_model=JoiningDocOut)
async def upload_joining_docs_internal(
    candidate_id: int,
    doc_type: str = Form(...),
    file: UploadFile = File(...),
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC])),
):
    candidate = await session.get(RecCandidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")
    normalized = _normalize_doc_type(doc_type)
    record = await _upload_joining_doc(
        session,
        candidate=candidate,
        doc_type=normalized,
        upload=file,
        uploaded_by="hr",
        uploaded_by_person_id_platform=_platform_person_id(user),
    )
    await session.commit()
    return JoiningDocOut.model_validate(record)


@router.get("/{candidate_id}/joining-profile", response_model=JoiningProfileOut | None)
async def get_joining_profile_internal(
    candidate_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.HIRING_MANAGER, Role.INTERVIEWER, Role.VIEWER])),
):
    candidate = await session.get(RecCandidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")
    profile = await _get_joining_profile(session, candidate_id=candidate_id)
    if profile is None:
        return None
    return JoiningProfileOut.model_validate(profile)


@router.patch("/{candidate_id}/joining-profile", response_model=JoiningProfileOut)
async def update_joining_profile_internal(
    candidate_id: int,
    payload: JoiningProfileInternalUpsertIn = Body(...),
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC])),
):
    candidate = await session.get(RecCandidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")
    profile = await _get_or_create_joining_profile(session, candidate_id=candidate_id)
    _apply_joining_profile_payload(profile, payload)
    profile.updated_at = datetime.utcnow()
    if profile.profile_status != "submitted" and any(getattr(profile, field_name) for field_name in JOINING_PROFILE_FIELDS):
        profile.profile_status = "draft"
    _refresh_profile_verification_state(profile)
    await session.commit()
    await session.refresh(profile)
    return JoiningProfileOut.model_validate(profile)


@public_router.get("/{token}", response_model=JoiningDocsPublicContext)
async def get_public_joining_docs(
    token: str,
    request: Request,
    session: AsyncSession = Depends(deps.get_db_session),
):
    _validate_public_joining_signature(request, token)
    offer = (
        await session.execute(
            select(RecCandidateOffer).where(RecCandidateOffer.public_token == token)
        )
    ).scalars().first()
    if not offer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found")
    if offer.offer_status != "accepted":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Offer not accepted yet")

    candidate = await session.get(RecCandidate, offer.candidate_id)
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    opening_title = None
    if offer.opening_id:
        opening_title = (
            await session.execute(select(RecOpening.title).where(RecOpening.opening_id == offer.opening_id))
        ).scalar_one_or_none()

    try:
        docs = (
            await session.execute(
                select(RecCandidateJoiningDoc)
                .where(RecCandidateJoiningDoc.candidate_id == candidate.candidate_id)
                .order_by(RecCandidateJoiningDoc.created_at.desc(), RecCandidateJoiningDoc.joining_doc_id.desc())
            )
        ).scalars().all()
    except SQLAlchemyError as exc:
        if "doesn't exist" in str(exc).lower():
            docs = []
        else:
            raise

    profile = await _get_joining_profile(session, candidate_id=candidate.candidate_id)

    return JoiningDocsPublicContext(
        candidate_id=candidate.candidate_id,
        candidate_name=candidate.full_name or candidate.first_name or candidate.email,
        opening_title=opening_title,
        joining_docs_status=candidate.joining_docs_status,
        required_doc_types=sorted(REQUIRED_JOINING_DOC_TYPES),
        profile=_public_joining_profile_out(profile),
        docs=[JoiningDocPublicOut.model_validate(doc) for doc in docs],
    )


@public_router.post("/{token}/profile", response_model=JoiningProfilePublicOut)
async def save_joining_profile_public(
    token: str,
    payload: JoiningProfilePublicIn,
    request: Request,
    session: AsyncSession = Depends(deps.get_db_session),
):
    _validate_public_joining_signature(request, token)
    offer = (
        await session.execute(
            select(RecCandidateOffer).where(RecCandidateOffer.public_token == token)
        )
    ).scalars().first()
    if not offer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found")
    if offer.offer_status != "accepted":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Offer not accepted yet")

    candidate = await session.get(RecCandidate, offer.candidate_id)
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    profile = await _get_or_create_joining_profile(session, candidate_id=candidate.candidate_id)
    _apply_joining_profile_payload(profile, payload)
    profile.profile_status = "submitted"
    profile.submitted_at = datetime.utcnow()
    profile.updated_at = datetime.utcnow()
    _refresh_profile_verification_state(profile)
    await session.commit()
    await session.refresh(profile)
    await log_event(
        session,
        candidate_id=candidate.candidate_id,
        action_type="joining_profile_submitted",
        performed_by_person_id_platform=None,
        related_entity_type="candidate",
        related_entity_id=candidate.candidate_id,
        meta_json={"profile_status": profile.profile_status},
    )
    await session.commit()
    return _public_joining_profile_out(profile) or JoiningProfilePublicOut()


@public_router.post("/{token}/upload", response_model=JoiningDocPublicOut)
async def upload_joining_docs_public(
    token: str,
    request: Request,
    doc_type: str = Form(...),
    file: UploadFile = File(...),
    session: AsyncSession = Depends(deps.get_db_session),
):
    _validate_public_joining_signature(request, token)
    offer = (
        await session.execute(
            select(RecCandidateOffer).where(RecCandidateOffer.public_token == token)
        )
    ).scalars().first()
    if not offer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found")
    if offer.offer_status != "accepted":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Offer not accepted yet")
    candidate = await session.get(RecCandidate, offer.candidate_id)
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")
    normalized = _normalize_doc_type(doc_type)
    record = await _upload_joining_doc(
        session,
        candidate=candidate,
        doc_type=normalized,
        upload=file,
        uploaded_by="candidate",
        uploaded_by_person_id_platform=None,
    )
    await session.commit()
    return JoiningDocPublicOut.model_validate(record)


def _platform_person_id(user: UserContext) -> int | None:
    raw = (user.person_id_platform or "").strip()
    if not raw:
        return None
    try:
        return int(raw)
    except Exception:
        return None
