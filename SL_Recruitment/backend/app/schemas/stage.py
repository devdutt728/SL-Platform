from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class CandidateStageOut(BaseModel):
    stage_id: int
    candidate_id: int
    stage_name: str
    stage_status: str
    started_at: datetime
    ended_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class StageTransitionRequest(BaseModel):
    to_stage: str
    # UI-friendly fields. `decision` is the preferred client field; `reason` kept for backward compatibility.
    decision: Optional[str] = None
    reason: Optional[str] = None
    note: Optional[str] = None
