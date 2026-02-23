from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.exc import OperationalError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.stage_machine import (
    DECLINED,
    ENQUIRY,
    HIRED,
    HR_SCREENING,
    JOINING_DOCUMENTS,
    L2_SHORTLIST,
    REJECTED,
    can_transition,
    normalize_stage_name,
)
from app.models.candidate_assessment import RecCandidateAssessment
from app.models.candidate import RecCandidate
from app.models.stage import RecCandidateStage
from app.schemas.user import UserContext
from app.services.events import log_event

_CAF_BYPASS_STAGES = {ENQUIRY, HR_SCREENING, L2_SHORTLIST}
_TERMINAL_STATUS_STAGES = {REJECTED, HIRED, DECLINED}


@dataclass(frozen=True)
class StageTransitionResult:
    candidate_id: int
    from_stage: str | None
    to_stage: str
    status: str
    changed: bool


def _user_person_id_int(user: UserContext | None) -> int | None:
    if not user:
        return None
    raw = (user.person_id_platform or "").strip()
    if not raw:
        return None
    try:
        return int(raw)
    except Exception:
        return None


def _is_superadmin(user: UserContext | None) -> bool:
    return bool(user and (user.platform_role_id or None) == 2)


def _candidate_status_for_stage(stage: str) -> str:
    if stage in _TERMINAL_STATUS_STAGES:
        return stage
    if stage == JOINING_DOCUMENTS:
        return "offer"
    if stage == ENQUIRY:
        return ENQUIRY
    return "in_process"


async def _current_stage_row(session: AsyncSession, *, candidate_id: int) -> RecCandidateStage | None:
    return (
        await session.execute(
            select(RecCandidateStage)
            .where(RecCandidateStage.candidate_id == candidate_id, RecCandidateStage.stage_status == "pending")
            .order_by(RecCandidateStage.started_at.desc(), RecCandidateStage.stage_id.desc())
            .limit(1)
        )
    ).scalars().first()


async def _assessment_gate_state(session: AsyncSession, *, candidate_id: int) -> tuple[bool, bool]:
    try:
        assessment = (
            await session.execute(
                select(RecCandidateAssessment)
                .where(RecCandidateAssessment.candidate_id == candidate_id)
                .limit(1)
            )
        ).scalars().first()
    except OperationalError:
        return False, False
    except SQLAlchemyError:
        return False, False
    if not assessment:
        return False, False
    return assessment.assessment_sent_at is not None, assessment.assessment_submitted_at is not None


async def apply_stage_transition(
    session: AsyncSession,
    *,
    candidate: RecCandidate,
    to_stage: str,
    decision: str | None = None,
    reason: str | None = None,
    note: str | None = None,
    user: UserContext | None = None,
    performed_by_person_id_platform: int | None = None,
    source: str | None = None,
    allow_noop: bool = False,
    enforce_caf_gate: bool = True,
    require_l2_owner_for_hr_screening: bool = True,
    skip_requested: bool | None = None,
    skip_requires_superadmin: bool = True,
    allow_terminal_reopen: bool | None = None,
    extra_meta: dict[str, Any] | None = None,
) -> StageTransitionResult:
    normalized_to_stage = normalize_stage_name(to_stage)
    if not normalized_to_stage:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid target stage.")

    skip_flag = skip_requested
    if skip_flag is None:
        skip_flag = (decision or "").lower() == "skip" or (note or "").lower() == "superadmin_skip"

    is_superadmin = _is_superadmin(user)
    if skip_flag and skip_requires_superadmin and not is_superadmin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Skip is restricted to Superadmin.")

    if enforce_caf_gate and normalized_to_stage not in _CAF_BYPASS_STAGES and not is_superadmin:
        assessment_shared, assessment_submitted = await _assessment_gate_state(
            session,
            candidate_id=candidate.candidate_id,
        )
        caf_submitted = candidate.caf_submitted_at is not None or assessment_submitted
        if assessment_shared and not caf_submitted:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="CAF must be submitted before advancing to further rounds.",
            )

    if require_l2_owner_for_hr_screening and normalized_to_stage == HR_SCREENING and not candidate.l2_owner_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Assign GL/L2 email before moving to HR screening.",
        )

    current_stage = await _current_stage_row(session, candidate_id=candidate.candidate_id)
    from_stage = current_stage.stage_name if current_stage else None
    normalized_from_stage = normalize_stage_name(from_stage)

    if normalized_from_stage == normalized_to_stage:
        if allow_noop:
            return StageTransitionResult(
                candidate_id=candidate.candidate_id,
                from_stage=from_stage,
                to_stage=normalized_to_stage,
                status=candidate.status or _candidate_status_for_stage(normalized_to_stage),
                changed=False,
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Candidate is already in '{normalized_to_stage}' stage.",
        )

    if not skip_flag and normalized_from_stage is not None:
        reopen_allowed = allow_terminal_reopen if allow_terminal_reopen is not None else is_superadmin
        if not can_transition(normalized_from_stage, normalized_to_stage, allow_terminal_reopen=reopen_allowed):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid stage transition from '{normalized_from_stage}' to '{normalized_to_stage}'.",
            )

    now = datetime.utcnow()
    if current_stage:
        await session.execute(
            update(RecCandidateStage)
            .where(
                RecCandidateStage.candidate_id == candidate.candidate_id,
                RecCandidateStage.stage_status == "pending",
            )
            .values(stage_status="completed", ended_at=now)
        )

    session.add(
        RecCandidateStage(
            candidate_id=candidate.candidate_id,
            stage_name=normalized_to_stage,
            stage_status="pending",
            started_at=now,
            created_at=now,
        )
    )

    new_status = _candidate_status_for_stage(normalized_to_stage)
    candidate.status = new_status
    candidate.updated_at = now

    event_meta: dict[str, Any] = {
        "from_stage": from_stage,
        "to_stage": normalized_to_stage,
    }
    if decision is not None:
        event_meta["decision"] = decision
    if reason or decision:
        event_meta["reason"] = reason or decision
    if note:
        event_meta["note"] = note
    if source:
        event_meta["source"] = source
    if user and user.email:
        event_meta["performed_by_email"] = user.email
    if extra_meta:
        event_meta.update(extra_meta)

    performer = performed_by_person_id_platform
    if performer is None:
        performer = _user_person_id_int(user)

    await log_event(
        session,
        candidate_id=candidate.candidate_id,
        action_type="stage_change",
        performed_by_person_id_platform=performer,
        related_entity_type="candidate",
        related_entity_id=candidate.candidate_id,
        from_status=from_stage,
        to_status=normalized_to_stage,
        meta_json=event_meta,
    )

    return StageTransitionResult(
        candidate_id=candidate.candidate_id,
        from_stage=from_stage,
        to_stage=normalized_to_stage,
        status=new_status,
        changed=True,
    )
