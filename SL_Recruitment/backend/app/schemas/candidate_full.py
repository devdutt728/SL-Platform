from __future__ import annotations

from typing import Optional

from pydantic import BaseModel

from app.schemas.candidate import CandidateDetailOut
from app.schemas.candidate_assessment import CandidateAssessmentOut
from app.schemas.event import CandidateEventOut
from app.schemas.screening import ScreeningOut
from app.schemas.stage import CandidateStageOut


class CandidateFullOut(BaseModel):
    candidate: CandidateDetailOut
    stages: list[CandidateStageOut]
    events: list[CandidateEventOut]
    screening: Optional[ScreeningOut] = None
    assessment: Optional[CandidateAssessmentOut] = None

