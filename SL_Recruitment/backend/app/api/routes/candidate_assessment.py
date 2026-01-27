from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.models.candidate import RecCandidate
from app.models.candidate_assessment import RecCandidateAssessment
from app.models.opening import RecOpening
from app.schemas.candidate_assessment import CandidateAssessmentOut, CandidateAssessmentPrefillOut, CandidateAssessmentUpsertIn
from app.services.email import send_email
from app.services.events import log_event

router = APIRouter(prefix="/assessment", tags=["candidate-assessment"])


@router.get("/{token}", response_model=CandidateAssessmentPrefillOut)
async def get_candidate_assessment_prefill(
    token: str,
    session: AsyncSession = Depends(deps.get_db_session),
):
    assessment = (
        await session.execute(
            select(RecCandidateAssessment).where(RecCandidateAssessment.assessment_token == token)
        )
    ).scalars().first()
    if not assessment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid assessment token")

    candidate = await session.get(RecCandidate, assessment.candidate_id)
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

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

    name = candidate.full_name
    if not name:
        parts = [candidate.first_name, candidate.last_name]
        name = " ".join([part for part in parts if part])

    return CandidateAssessmentPrefillOut(
        candidate_id=candidate.candidate_id,
        candidate_code=candidate.candidate_code or f"SLR-{candidate.candidate_id:04d}",
        name=name or "",
        email=candidate.email,
        phone=candidate.phone,
        assessment_sent_at=assessment.assessment_sent_at,
        assessment_submitted_at=assessment.assessment_submitted_at,
        opening_id=candidate.opening_id,
        opening_title=opening_title,
        opening_description=opening_description,
    )


@router.post("/{token}", response_model=CandidateAssessmentOut, status_code=status.HTTP_201_CREATED)
async def submit_candidate_assessment(
    token: str,
    payload: CandidateAssessmentUpsertIn,
    session: AsyncSession = Depends(deps.get_db_session),
):
    assessment = (
        await session.execute(
            select(RecCandidateAssessment).where(RecCandidateAssessment.assessment_token == token)
        )
    ).scalars().first()
    if not assessment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid assessment token")
    if assessment.assessment_submitted_at is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Assessment already submitted")

    rating_fields = [
        "skill_auto_cad",
        "skill_sketch_up",
        "skill_revit",
        "skill_photoshop",
        "skill_illustrator",
        "skill_ms_office",
        "skill_3d_max",
        "skill_indesign",
        "skill_presentation",
        "skill_rhino",
        "skill_boqs",
        "skill_analytical_writing",
        "skill_graphics",
        "skill_drafting",
        "skill_hand_sketching",
        "skill_estimation",
        "skill_specifications",
        "skill_enscape",
        "proficiency_execution_action_orientation",
        "proficiency_execution_self_discipline",
        "proficiency_execution_independent_decision",
        "proficiency_process_time_management",
        "proficiency_process_following_processes",
        "proficiency_process_new_processes",
        "proficiency_strategic_long_term_thinking",
        "proficiency_strategic_ideation_creativity",
        "proficiency_strategic_risk_taking",
        "proficiency_people_collaboration",
        "proficiency_people_coaching",
        "proficiency_people_feedback",
        "proficiency_people_conflict_resolution",
    ]
    for field in rating_fields:
        value = getattr(payload, field)
        if value is not None and not 1 <= value <= 10:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{field} must be between 1 and 10")

    candidate = await session.get(RecCandidate, assessment.candidate_id)
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    now = datetime.utcnow()
    data = payload.model_dump(exclude_none=True)
    for key, value in data.items():
        setattr(assessment, key, value)
    assessment.assessment_submitted_at = now
    assessment.updated_at = now

    await log_event(
        session,
        candidate_id=assessment.candidate_id,
        action_type="candidate_assessment_submitted",
        performed_by_person_id_platform=None,
        related_entity_type="candidate",
        related_entity_id=assessment.candidate_id,
        meta_json={"assessment_token": assessment.assessment_token},
    )

    await send_email(
        session,
        candidate_id=assessment.candidate_id,
        to_emails=[candidate.email],
        subject="Your Candidate Assessment Form (CAF) is complete",
        template_name="assessment_completed",
        context={"candidate_name": candidate.full_name},
        email_type="assessment_completed",
        meta_extra={"assessment_token": assessment.assessment_token},
    )

    await session.commit()
    await session.refresh(assessment)
    return CandidateAssessmentOut.model_validate(assessment)
