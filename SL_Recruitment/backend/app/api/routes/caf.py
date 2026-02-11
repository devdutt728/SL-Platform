from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.models.candidate import RecCandidate
from app.models.opening import RecOpening
from app.models.screening import RecCandidateScreening
from app.schemas.screening import CafPrefillOut, ScreeningOut, ScreeningUpsertIn
from app.services.events import log_event
from app.core.config import settings
from app.services.opening_config import get_opening_config
from app.services.screening_rules import evaluate_screening
from app.services.stage_transitions import apply_stage_transition

router = APIRouter(prefix="/caf", tags=["caf"])


def _caf_expiry_window() -> timedelta | None:
    hours = max(int(settings.caf_expiry_hours or 0), 0)
    if hours <= 0:
        hours = max(int(settings.caf_expiry_days or 0), 0) * 24
    if hours <= 0:
        return None
    return timedelta(hours=hours)


def _caf_expired(candidate: RecCandidate) -> bool:
    if candidate.caf_submitted_at is not None:
        return False
    if candidate.caf_sent_at is None:
        return False
    window = _caf_expiry_window()
    if window is None:
        return False
    return datetime.utcnow() > (candidate.caf_sent_at + window)


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
    if _caf_expired(candidate):
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="CAF link expired")

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
        name=(candidate.full_name or " ".join([part for part in [candidate.first_name, candidate.last_name] if part]).strip() or candidate.email),
        first_name=candidate.first_name,
        last_name=candidate.last_name,
        email=candidate.email,
        phone=candidate.phone,
        years_of_experience=candidate.years_of_experience,
        city=candidate.city,
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
    if _caf_expired(candidate):
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="CAF link expired")
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

    if candidate.l2_owner_email:
        try:
            transition = await apply_stage_transition(
                session,
                candidate=candidate,
                to_stage="hr_screening",
                decision="advance",
                note="caf_screening",
                source="caf_submit",
                allow_noop=True,
            )
            if transition.changed:
                await log_event(
                    session,
                    candidate_id=candidate.candidate_id,
                    action_type="screening_needs_review",
                    performed_by_person_id_platform=None,
                    related_entity_type="candidate",
                    related_entity_id=candidate.candidate_id,
                    meta_json={"stage": "hr_screening"},
                )
        except HTTPException as exc:
            await log_event(
                session,
                candidate_id=candidate.candidate_id,
                action_type="stage_blocked",
                performed_by_person_id_platform=None,
                related_entity_type="candidate",
                related_entity_id=candidate.candidate_id,
                meta_json={
                    "stage": "hr_screening",
                    "reason": "transition_guard_rejected",
                    "detail": str(exc.detail),
                },
            )
    else:
        await log_event(
            session,
            candidate_id=candidate.candidate_id,
            action_type="stage_blocked",
            performed_by_person_id_platform=None,
            related_entity_type="candidate",
            related_entity_id=candidate.candidate_id,
            meta_json={"stage": "hr_screening", "reason": "missing_l2_owner_email"},
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
