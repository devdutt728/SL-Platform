from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.models.candidate import RecCandidate
from app.models.opening import RecOpening
from app.models.screening import RecCandidateScreening
from app.models.stage import RecCandidateStage
from app.schemas.screening import CafPrefillOut, ScreeningOut, ScreeningUpsertIn
from app.services.events import log_event
from app.services.opening_config import get_opening_config
from app.services.screening_rules import evaluate_screening

router = APIRouter(prefix="/caf", tags=["caf"])


@router.get("/{token}", response_model=CafPrefillOut)
async def get_caf_prefill(
    token: str,
    session: AsyncSession = Depends(deps.get_db_session),
):
    candidate = (
        await session.execute(select(RecCandidate).where(RecCandidate.caf_token == token))
    ).scalars().first()
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid CAF token")

    opening_title = None
    opening_description = None
    if candidate.opening_id is not None:
        row = (
            await session.execute(
                select(RecOpening.title, RecOpening.description).where(RecOpening.opening_id == candidate.opening_id)
            )
        ).first()
        if row:
            opening_title = row.title
            opening_description = row.description

    return CafPrefillOut(
        candidate_id=candidate.candidate_id,
        candidate_code=candidate.candidate_code or f"SLR-{candidate.candidate_id:04d}",
        name=candidate.full_name,
        email=candidate.email,
        phone=candidate.phone,
        cv_url=candidate.cv_url,
        caf_sent_at=candidate.caf_sent_at,
        caf_submitted_at=candidate.caf_submitted_at,
        opening_id=candidate.opening_id,
        opening_title=opening_title,
        opening_description=opening_description,
    )


@router.get("/{token}/screening", response_model=ScreeningOut)
async def get_caf_screening(
    token: str,
    session: AsyncSession = Depends(deps.get_db_session),
):
    candidate = (
        await session.execute(select(RecCandidate).where(RecCandidate.caf_token == token))
    ).scalars().first()
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid CAF token")

    screening = (
        await session.execute(
            select(RecCandidateScreening).where(RecCandidateScreening.candidate_id == candidate.candidate_id)
        )
    ).scalars().first()
    if not screening:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No screening data yet")
    return ScreeningOut.model_validate(screening)


@router.post("/{token}", response_model=ScreeningOut, status_code=status.HTTP_201_CREATED)
async def submit_caf(
    token: str,
    payload: ScreeningUpsertIn,
    session: AsyncSession = Depends(deps.get_db_session),
):
    candidate = (
        await session.execute(select(RecCandidate).where(RecCandidate.caf_token == token))
    ).scalars().first()
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid CAF token")
    if candidate.caf_submitted_at is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="CAF already submitted")

    now = datetime.utcnow()

    screening = (
        await session.execute(
            select(RecCandidateScreening).where(RecCandidateScreening.candidate_id == candidate.candidate_id)
        )
    ).scalars().first()

    if screening is None:
        screening = RecCandidateScreening(candidate_id=candidate.candidate_id, created_at=now, updated_at=now)
        session.add(screening)

    data = payload.model_dump(exclude_none=True)
    for key, value in data.items():
        if key in {"current_ctc_annual", "expected_ctc_annual"} and value is not None:
            if abs(value) > 9_999_999_999.99:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"{key.replace('_',' ').title()} is too large. Please enter a realistic amount (max 9,999,999,999.99).",
                )
        setattr(screening, key, value)
    screening.updated_at = now

    candidate.caf_submitted_at = now

    opening_config = get_opening_config(candidate.opening_id)
    decision = evaluate_screening(payload, opening_config)
    screening.screening_result = decision

    candidate.needs_hr_review = decision == "amber"
    candidate.status = "in_process"

    current_stage = (
        await session.execute(
            select(RecCandidateStage.stage_name)
            .where(RecCandidateStage.candidate_id == candidate.candidate_id, RecCandidateStage.stage_status == "pending")
            .order_by(RecCandidateStage.started_at.desc(), RecCandidateStage.stage_id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if current_stage != "hr_screening":
        await _transition_from_caf(session, candidate_id=candidate.candidate_id, to_stage="hr_screening")
        await log_event(
            session,
            candidate_id=candidate.candidate_id,
            action_type="screening_needs_review",
            performed_by_person_id_platform=None,
            related_entity_type="candidate",
            related_entity_id=candidate.candidate_id,
            meta_json={"stage": "hr_screening"},
        )

    await log_event(
        session,
        candidate_id=candidate.candidate_id,
        action_type="caf_submitted",
        performed_by_person_id_platform=None,
        related_entity_type="candidate",
        related_entity_id=candidate.candidate_id,
        meta_json={"screening_result": decision},
    )

    await session.commit()
    await session.refresh(screening)
    return ScreeningOut.model_validate(screening)


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
