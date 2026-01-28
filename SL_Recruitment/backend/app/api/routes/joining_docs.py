from datetime import datetime

import anyio
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core.auth import require_roles
from app.core.roles import Role
from app.core.uploads import DOC_EXTENSIONS, DOC_MIME_TYPES, validate_upload
from app.models.candidate import RecCandidate
from app.models.candidate_offer import RecCandidateOffer
from app.models.joining_doc import RecCandidateJoiningDoc
from app.models.opening import RecOpening
from app.schemas.joining_docs import JoiningDocOut, JoiningDocPublicOut, JoiningDocsPublicContext
from app.schemas.user import UserContext
from app.services.drive import upload_joining_doc
from app.services.events import log_event

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
    "salary_slips",
}


def _normalize_doc_type(raw: str | None) -> str:
    value = (raw or "").strip().lower().replace(" ", "_")
    if value == "aadhar":
        value = "aadhaar"
    if value in {"mark_sheets", "mark_sheet"}:
        value = "marksheets"
    if value in {"salary_slip", "salary_slips"}:
        value = "salary_slips"
    if value not in JOINING_DOC_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid document type.")
    return value


async def _update_joining_docs_status(session: AsyncSession, *, candidate: RecCandidate) -> str:
    rows = (
        await session.execute(
            select(RecCandidateJoiningDoc.doc_type).where(RecCandidateJoiningDoc.candidate_id == candidate.candidate_id)
        )
    ).scalars().all()
    seen = {str(r).strip().lower() for r in rows if r}
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


@public_router.get("/{token}", response_model=JoiningDocsPublicContext)
async def get_public_joining_docs(
    token: str,
    session: AsyncSession = Depends(deps.get_db_session),
):
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

    return JoiningDocsPublicContext(
        candidate_id=candidate.candidate_id,
        candidate_name=candidate.full_name or candidate.first_name or candidate.email,
        opening_title=opening_title,
        joining_docs_status=candidate.joining_docs_status,
        required_doc_types=sorted(REQUIRED_JOINING_DOC_TYPES),
        docs=[JoiningDocPublicOut.model_validate(doc) for doc in docs],
    )


@public_router.post("/{token}/upload", response_model=JoiningDocPublicOut)
async def upload_joining_docs_public(
    token: str,
    doc_type: str = Form(...),
    file: UploadFile = File(...),
    session: AsyncSession = Depends(deps.get_db_session),
):
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
