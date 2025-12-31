from datetime import datetime

from pydantic import BaseModel, Field


class InterviewSlotProposalIn(BaseModel):
    round_type: str = Field(min_length=1, max_length=50)
    interviewer_person_id_platform: int = Field(ge=1)


class InterviewSlotOut(BaseModel):
    candidate_interview_slot_id: int
    slot_start_at: datetime
    slot_end_at: datetime
    selection_token: str
    status: str
