from __future__ import annotations

from datetime import datetime
import logging
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Query, status
from starlette.responses import FileResponse, RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core.auth import require_roles, require_superadmin
from app.core.roles import Role
from app.models.candidate import RecCandidate
from app.models.candidate_offer import RecCandidateOffer
from app.models.opening import RecOpening
from app.models.stage import RecCandidateStage
from app.schemas.offer import (
    OfferCreateIn,
    OfferDecisionIn,
    OfferDocumentGenerateIn,
    OfferOut,
    OfferPublicOut,
    OfferUpdateIn,
)
from app.schemas.user import UserContext
from app.services.offers import (
    _platform_person_id,
    approve_offer,
    convert_candidate_to_employee,
    create_offer,
    record_candidate_response,
    reject_offer,
    send_offer,
    submit_for_approval,
    update_offer_details,
)
from app.services.events import log_event
from app.services.offer_documents import generate_offer_document
from app.services.drive import delete_drive_item, move_candidate_folder
from app.services.email import send_email

router = APIRouter(prefix="/rec/offers", tags=["offers"])
public_router = APIRouter(prefix="/offer", tags=["offers-public"])
logger = logging.getLogger(__name__)


def _resolve_offer_path(raw_path: str, root: Path) -> Path:
    path = Path(raw_path)
    if not path.is_absolute():
        path = (root / path).resolve()
    return path


def _drive_file_id_from_url(url: str) -> str | None:
    if "drive.google.com/file/d/" not in url:
        return None
    parts = url.split("/file/d/", 1)[1].split("/", 1)
    return parts[0] if parts and parts[0] else None


@router.get("", response_model=list[OfferOut])
async def list_offers(
    status_filter: list[str] | None = Query(default=None, alias="status"),
    session: AsyncSession = Depends(deps.get_db_session),
    _user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.HIRING_MANAGER, Role.INTERVIEWER, Role.VIEWER])),
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
        query = query.where(RecCandidateOffer.offer_status.in_(status_filter))
    rows = (await session.execute(query)).all()
    out: list[OfferOut] = []
    for row in rows:
        offer = row[0]
        base = OfferOut.model_validate(offer).model_dump(exclude={"candidate_name", "candidate_code", "opening_title"})
        out.append(
            OfferOut(
                **base,
                candidate_name=row[1],
                candidate_code=row[2],
                opening_title=row[3],
            )
        )
    return out


@router.get("/{offer_id}", response_model=OfferOut)
async def get_offer(
    offer_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    _user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.HIRING_MANAGER, Role.INTERVIEWER, Role.VIEWER])),
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
    base = OfferOut.model_validate(offer).model_dump(exclude={"candidate_name", "candidate_code", "opening_title"})
    return OfferOut(
        **base,
        candidate_name=row[1],
        candidate_code=row[2],
        opening_title=row[3],
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
    if updates:
        await update_offer_details(session, offer=offer, payload=updates, user=user)
    if submit:
        await submit_for_approval(session, offer=offer, user=user)
    await session.commit()
    await session.refresh(offer)
    return OfferOut.model_validate(offer)


@router.post("/{offer_id}/approve", response_model=OfferOut)
async def approve_offer_route(
    offer_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN])),
):
    offer = await session.get(RecCandidateOffer, offer_id)
    if not offer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found")
    await approve_offer(session, offer=offer, user=user)
    await session.commit()
    await session.refresh(offer)
    return OfferOut.model_validate(offer)


@router.post("/{offer_id}/reject", response_model=OfferOut)
async def reject_offer_route(
    offer_id: int,
    payload: OfferDecisionIn | None = None,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN])),
):
    offer = await session.get(RecCandidateOffer, offer_id)
    if not offer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found")
    reason = payload.reason if payload else None
    await reject_offer(session, offer=offer, user=user, reason=reason)
    await session.commit()
    await session.refresh(offer)
    return OfferOut.model_validate(offer)


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
        await send_email(
            session,
            candidate_id=candidate.candidate_id,
            to_emails=[candidate.email],
            subject="Your offer letter is ready",
            template_name="offer_sent",
            context={
                "candidate_name": candidate.full_name,
                "opening_title": opening.title if opening else "",
                "offer_link": f"/offer/{offer.public_token}",
                "joining_date": offer.joining_date,
            },
            email_type="offer_sent",
            related_entity_type="offer",
            related_entity_id=offer.candidate_offer_id,
            meta_extra={"offer_id": offer.candidate_offer_id},
        )
    await session.commit()
    await session.refresh(offer)
    return OfferOut.model_validate(offer)


@router.post("/{offer_id}/decision", response_model=OfferOut)
async def decide_offer_admin(
    offer_id: int,
    payload: OfferDecisionIn,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_superadmin()),
):
    offer = await session.get(RecCandidateOffer, offer_id)
    if not offer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found")
    await record_candidate_response(session, offer=offer, decision=payload.decision, reason=payload.reason)

    candidate = await session.get(RecCandidate, offer.candidate_id)
    if candidate and payload.decision.strip().lower() == "decline":
        candidate.status = "rejected"
        candidate.final_decision = "not_hired"
        candidate.updated_at = datetime.utcnow()
        current = (
            await session.execute(
                select(RecCandidateStage)
                .where(RecCandidateStage.candidate_id == candidate.candidate_id, RecCandidateStage.stage_status == "pending")
                .order_by(RecCandidateStage.started_at.desc(), RecCandidateStage.stage_id.desc())
                .limit(1)
            )
        ).scalars().first()
        now = datetime.utcnow()
        if current:
            current.stage_status = "completed"
            current.ended_at = now
        session.add(
            RecCandidateStage(
                candidate_id=candidate.candidate_id,
                stage_name="rejected",
                stage_status="pending",
                started_at=now,
                created_at=now,
            )
        )
        if candidate.drive_folder_id:
            try:
                move_candidate_folder(candidate.drive_folder_id, "Not Appointed")
                await log_event(
                    session,
                    candidate_id=candidate.candidate_id,
                    action_type="drive_folder_moved",
                    performed_by_person_id_platform=_platform_person_id(user),
                    related_entity_type="candidate",
                    related_entity_id=candidate.candidate_id,
                    meta_json={"bucket": "Not Appointed"},
                )
            except Exception:
                pass
    await session.commit()
    await session.refresh(offer)
    return OfferOut.model_validate(offer)


@router.post("/{offer_id}/document", response_model=OfferOut)
async def generate_offer_document_route(
    offer_id: int,
    payload: OfferDocumentGenerateIn,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC])),
):
    offer = await session.get(RecCandidateOffer, offer_id)
    if not offer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found")
    candidate = await session.get(RecCandidate, offer.candidate_id)
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")
    opening = await session.get(RecOpening, offer.opening_id) if offer.opening_id else None
    try:
        await generate_offer_document(
            session,
            offer=offer,
            candidate=candidate,
            opening=opening,
            payload=payload.model_dump(),
            user=user,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))
    except OSError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))
    except Exception as exc:
        logger.exception("Offer document generation failed", extra={"offer_id": offer_id, "candidate_id": offer.candidate_id})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Offer letter generation failed: {type(exc).__name__}: {exc}",
        )
    try:
        await session.commit()
    except Exception as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))
    try:
        await session.refresh(offer)
    except Exception as exc:
        logger.warning("Offer refresh failed after document generation", exc_info=exc)
    return OfferOut.model_validate(offer)


@router.get("/{offer_id}/document")
async def download_offer_document(
    offer_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    _user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.HIRING_MANAGER, Role.INTERVIEWER, Role.VIEWER])),
):
    offer = await session.get(RecCandidateOffer, offer_id)
    if not offer or not offer.docx_url:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer document not found")
    path = _resolve_offer_path(offer.docx_url, Path(__file__).resolve().parents[2])
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer document not found")
    filename = path.name
    return FileResponse(
        path,
        filename=filename,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


@router.get("/{offer_id}/document/pdf")
async def download_offer_pdf(
    offer_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    _user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.HIRING_MANAGER, Role.INTERVIEWER, Role.VIEWER])),
):
    offer = await session.get(RecCandidateOffer, offer_id)
    if not offer or not offer.pdf_url:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer PDF not found")
    if str(offer.pdf_url).lower().startswith("http"):
        return RedirectResponse(offer.pdf_url)
    path = _resolve_offer_path(offer.pdf_url, Path(__file__).resolve().parents[2])
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer PDF not found")
    filename = path.name
    return FileResponse(path, filename=filename, media_type="application/pdf")


@router.delete("/{offer_id}/document", response_model=OfferOut)
async def delete_offer_document(
    offer_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_superadmin()),
):
    offer = await session.get(RecCandidateOffer, offer_id)
    if not offer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found")
    root = Path(__file__).resolve().parents[2]
    removed = []
    if offer.pdf_url and str(offer.pdf_url).lower().startswith("http"):
        file_id = _drive_file_id_from_url(offer.pdf_url)
        if file_id:
            try:
                delete_drive_item(file_id)
                removed.append(offer.pdf_url)
            except Exception:
                pass
    for raw_path in (offer.docx_url, offer.pdf_url):
        if not raw_path:
            continue
        if str(raw_path).lower().startswith("http"):
            continue
        path = _resolve_offer_path(raw_path, root)
        if path.exists():
            try:
                path.unlink()
                removed.append(str(path))
            except Exception:
                pass
    offer.docx_url = None
    offer.pdf_url = None
    offer.updated_at = datetime.utcnow()
    await log_event(
        session,
        candidate_id=offer.candidate_id,
        action_type="offer_document_deleted",
        performed_by_person_id_platform=_platform_person_id(user),
        related_entity_type="offer",
        related_entity_id=offer.candidate_offer_id,
        meta_json={"offer_id": offer.candidate_offer_id, "removed": removed},
    )
    await session.commit()
    await session.refresh(offer)
    return OfferOut.model_validate(offer)


@router.get("/candidates/{candidate_id}", response_model=list[OfferOut])
async def list_candidate_offers(
    candidate_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    _user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.HIRING_MANAGER, Role.INTERVIEWER, Role.VIEWER])),
):
    rows = (
        await session.execute(
            select(RecCandidateOffer)
            .where(RecCandidateOffer.candidate_id == candidate_id)
            .order_by(RecCandidateOffer.created_at.desc(), RecCandidateOffer.candidate_offer_id.desc())
        )
    ).scalars().all()
    return [OfferOut.model_validate(row) for row in rows]


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
    await session.commit()
    await session.refresh(offer)
    return OfferOut.model_validate(offer)


@public_router.get("/{token}", response_model=OfferPublicOut)
async def get_public_offer(
    token: str,
    session: AsyncSession = Depends(deps.get_db_session),
):
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
    pdf_url = offer.pdf_url
    if pdf_url and not str(pdf_url).lower().startswith("http"):
        pdf_url = f"/offer/{token}/document"
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
        docx_url=offer.docx_url,
        pdf_url=pdf_url,
    )


@public_router.post("/{token}/decision", response_model=OfferPublicOut)
async def decide_public_offer(
    token: str,
    payload: OfferDecisionIn,
    session: AsyncSession = Depends(deps.get_db_session),
):
    offer = (
        await session.execute(select(RecCandidateOffer).where(RecCandidateOffer.public_token == token))
    ).scalars().first()
    if not offer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found")
    await record_candidate_response(session, offer=offer, decision=payload.decision, reason=payload.reason)

    candidate = await session.get(RecCandidate, offer.candidate_id)
    if candidate and payload.decision.strip().lower() == "decline":
        candidate.status = "rejected"
        candidate.final_decision = "not_hired"
        candidate.updated_at = datetime.utcnow()
        # Transition stage to rejected.
        current = (
            await session.execute(
                select(RecCandidateStage)
                .where(RecCandidateStage.candidate_id == candidate.candidate_id, RecCandidateStage.stage_status == "pending")
                .order_by(RecCandidateStage.started_at.desc(), RecCandidateStage.stage_id.desc())
                .limit(1)
            )
        ).scalars().first()
        now = datetime.utcnow()
        if current:
            current.stage_status = "completed"
            current.ended_at = now
        session.add(
            RecCandidateStage(
                candidate_id=candidate.candidate_id,
                stage_name="rejected",
                stage_status="pending",
                started_at=now,
                created_at=now,
            )
        )
        if candidate.drive_folder_id:
            try:
                move_candidate_folder(candidate.drive_folder_id, "Not Appointed")
                await log_event(
                    session,
                    candidate_id=candidate.candidate_id,
                    action_type="drive_folder_moved",
                    performed_by_person_id_platform=None,
                    related_entity_type="candidate",
                    related_entity_id=candidate.candidate_id,
                    meta_json={"bucket": "Not Appointed"},
                )
            except Exception:
                pass
    await session.commit()
    opening = await session.get(RecOpening, offer.opening_id) if offer.opening_id else None
    pdf_url = offer.pdf_url
    if pdf_url and not str(pdf_url).lower().startswith("http"):
        pdf_url = f"/offer/{token}/document"
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
        docx_url=offer.docx_url,
        pdf_url=pdf_url,
    )


@public_router.get("/{token}/document")
async def download_public_offer_pdf(
    token: str,
    session: AsyncSession = Depends(deps.get_db_session),
):
    offer = (
        await session.execute(select(RecCandidateOffer).where(RecCandidateOffer.public_token == token))
    ).scalars().first()
    if not offer or not offer.pdf_url:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer PDF not found")
    if str(offer.pdf_url).lower().startswith("http"):
        return RedirectResponse(offer.pdf_url)
    path = _resolve_offer_path(offer.pdf_url, Path(__file__).resolve().parents[2])
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer PDF not found")
    filename = path.name
    return FileResponse(path, filename=filename, media_type="application/pdf")
