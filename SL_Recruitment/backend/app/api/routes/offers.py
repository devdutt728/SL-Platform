from __future__ import annotations

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from urllib.parse import urlparse, parse_qs
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core.auth import require_roles, require_superadmin
from app.core.roles import Role
from app.models.candidate import RecCandidate
from app.models.candidate_offer import RecCandidateOffer
from app.models.opening import RecOpening
from app.models.stage import RecCandidateStage
from app.schemas.offer import OfferCreateIn, OfferDecisionIn, OfferOut, OfferPublicOut, OfferUpdateIn
from app.schemas.user import UserContext
from app.services.offers import (
    approve_offer,
    convert_candidate_to_employee,
    create_offer,
    record_candidate_response,
    reject_offer,
    _resolve_candidate_address,
    _resolve_reporting_to,
    _ensure_offer_pdf,
    _offer_public_link,
    _offer_public_pdf_link,
    offer_pdf_signed_url,
    verify_offer_pdf_signature,
    render_offer_letter,
    send_offer,
    submit_for_approval,
    update_offer_details,
)
from app.services.events import log_event
from app.services.drive import move_candidate_folder, download_drive_file
from app.services.email import render_template, send_email

router = APIRouter(prefix="/rec/offers", tags=["offers"])
public_router = APIRouter(prefix="/offer", tags=["offers-public"])


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
        out.append(
            OfferOut(
                **OfferOut.model_validate(offer).model_dump(),
                candidate_name=row[1],
                candidate_code=row[2],
                opening_title=row[3],
                pdf_download_url=offer_pdf_signed_url(offer.public_token),
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
    return OfferOut(
        **OfferOut.model_validate(offer).model_dump(),
        candidate_name=row[1],
        candidate_code=row[2],
        opening_title=row[3],
        pdf_download_url=offer_pdf_signed_url(offer.public_token),
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
                "offer_link": _offer_public_link(offer.public_token),
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
    return OfferOut.model_validate(offer)


@router.get("/{offer_id}/preview")
async def preview_offer_letter(
    offer_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.HIRING_MANAGER, Role.INTERVIEWER, Role.VIEWER])),
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
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.HIRING_MANAGER, Role.INTERVIEWER, Role.VIEWER])),
):
    offer = await session.get(RecCandidateOffer, offer_id)
    if not offer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found")
    candidate = await session.get(RecCandidate, offer.candidate_id)
    opening = await session.get(RecOpening, offer.opening_id) if offer.opening_id else None
    offer_link = _offer_public_link(offer.public_token)
    offer_pdf_link = offer_pdf_signed_url(offer.public_token)
    await _ensure_offer_pdf(
        session=session,
        offer=offer,
        candidate=candidate,
        opening=opening,
        sender_name="Studio Lotus Team",
        candidate_address=await _resolve_candidate_address(session, candidate, opening),
        reporting_to=await _resolve_reporting_to(opening),
        unit_name=opening.title if opening and opening.title else "Studio Lotus",
    )
    html = render_template(
        "offer_sent",
        {
            "candidate_name": candidate.full_name if candidate else "",
            "opening_title": opening.title if opening else "",
            "offer_link": offer_link,
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
    _user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.HIRING_MANAGER, Role.INTERVIEWER, Role.VIEWER])),
):
    rows = (
        await session.execute(
            select(RecCandidateOffer)
            .where(RecCandidateOffer.candidate_id == candidate_id)
            .order_by(RecCandidateOffer.created_at.desc(), RecCandidateOffer.candidate_offer_id.desc())
        )
    ).scalars().all()
    return [
        OfferOut(**OfferOut.model_validate(row).model_dump(), pdf_download_url=offer_pdf_signed_url(row.public_token))
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
        pdf_url=offer.pdf_url,
        pdf_download_url=offer_pdf_signed_url(offer.public_token),
    )


@public_router.get("/{token}/pdf")
async def get_public_offer_pdf(
    token: str,
    request: Request,
    session: AsyncSession = Depends(deps.get_db_session),
):
    exp = request.query_params.get("exp")
    sig = request.query_params.get("sig")
    if not verify_offer_pdf_signature(token, exp, sig):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid or expired link")
    download_flag = request.query_params.get("download", "1")
    offer = (
        await session.execute(select(RecCandidateOffer).where(RecCandidateOffer.public_token == token))
    ).scalars().first()
    if not offer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found")
    candidate = await session.get(RecCandidate, offer.candidate_id)
    opening = await session.get(RecOpening, offer.opening_id) if offer.opening_id else None
    await _ensure_offer_pdf(
        session=session,
        offer=offer,
        candidate=candidate,
        opening=opening,
        sender_name="Studio Lotus Team",
        candidate_address=await _resolve_candidate_address(session, candidate, opening),
        reporting_to=await _resolve_reporting_to(opening),
        unit_name=opening.title if opening and opening.title else "Studio Lotus",
    )
    if not offer.pdf_url:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer file not available")
    file_id = _extract_drive_file_id(offer.pdf_url)
    if not file_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer file not available")
    data, content_type, filename = download_drive_file(file_id)
    disposition = "attachment" if download_flag == "1" else "inline"
    headers = {"Content-Disposition": f'{disposition}; filename="{filename}"'}
    return Response(content=data, media_type=content_type, headers=headers)


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
        pdf_url=offer.pdf_url,
        pdf_download_url=offer_pdf_signed_url(offer.public_token),
    )
