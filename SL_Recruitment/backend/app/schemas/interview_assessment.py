from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class L2AssessmentPayload(BaseModel):
    data: dict[str, Any] = Field(default_factory=dict)


class L2AssessmentOut(BaseModel):
    candidate_interview_assessment_id: int | None = None
    candidate_interview_id: int
    candidate_id: int
    interviewer_person_id_platform: str | None = None
    status: str
    data: dict[str, Any] = Field(default_factory=dict)
    submitted_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    locked: bool = False
