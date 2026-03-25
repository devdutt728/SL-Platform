from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.candidate import RecCandidate
from app.models.interview import RecCandidateInterview
from app.models.opening import RecOpening

STANDARD_WORKFLOW = "standard"
INTERN_L2_ONLY_WORKFLOW = "intern_l2_only"
INTERN_OPENING_CODES = frozenset({"INTR-8299B8", "CMIN-8299B0"})
INTERN_DISABLED_STAGES = frozenset(
    {
        "sprint",
        "l1_shortlist",
        "l1_interview",
        "l1_feedback",
        "offer",
        "joining_documents",
    }
)


@dataclass(frozen=True)
class WorkflowPolicy:
    workflow_variant: str = STANDARD_WORKFLOW
    opening_code: str | None = None

    @property
    def is_intern_l2_only(self) -> bool:
        return self.workflow_variant == INTERN_L2_ONLY_WORKFLOW

    @property
    def allow_l1(self) -> bool:
        return not self.is_intern_l2_only

    @property
    def allow_sprint(self) -> bool:
        return not self.is_intern_l2_only

    @property
    def allow_offers(self) -> bool:
        return not self.is_intern_l2_only

    @property
    def requires_caf(self) -> bool:
        return not self.is_intern_l2_only

    @property
    def requires_candidate_assessment(self) -> bool:
        return not self.is_intern_l2_only


def normalize_opening_code(raw: str | None) -> str | None:
    value = (raw or "").strip().upper()
    return value or None


def workflow_variant_for_opening_code(opening_code: str | None) -> str:
    normalized = normalize_opening_code(opening_code)
    if normalized in INTERN_OPENING_CODES:
        return INTERN_L2_ONLY_WORKFLOW
    return STANDARD_WORKFLOW


def workflow_policy_for_opening(opening: RecOpening | None) -> WorkflowPolicy:
    opening_code = normalize_opening_code(opening.opening_code if opening else None)
    return WorkflowPolicy(
        workflow_variant=workflow_variant_for_opening_code(opening_code),
        opening_code=opening_code,
    )


async def get_candidate_workflow_policy(session: AsyncSession, candidate: RecCandidate | None) -> WorkflowPolicy:
    if not candidate or not candidate.opening_id:
        return WorkflowPolicy()
    opening = await session.get(RecOpening, candidate.opening_id)
    return workflow_policy_for_opening(opening)


async def get_interview_workflow_policy(session: AsyncSession, interview: RecCandidateInterview | None) -> WorkflowPolicy:
    if not interview:
        return WorkflowPolicy()
    candidate = await session.get(RecCandidate, interview.candidate_id)
    return await get_candidate_workflow_policy(session, candidate)


def is_stage_disabled_for_policy(policy: WorkflowPolicy, stage_name: str | None) -> bool:
    if not policy.is_intern_l2_only:
        return False
    return (stage_name or "").strip().lower() in INTERN_DISABLED_STAGES


def is_l1_round(round_type: str | None) -> bool:
    return "l1" in (round_type or "").strip().lower()


def _safe_dict(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except Exception:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


def extract_intern_hiring_recommendation(data: Any) -> str | None:
    payload = _safe_dict(data)
    block = _safe_dict(payload.get("intern_recommendation"))
    value = str(block.get("suitable_for_hiring") or "").strip().upper()
    if value in {"YES", "NO"}:
        return value
    return None
