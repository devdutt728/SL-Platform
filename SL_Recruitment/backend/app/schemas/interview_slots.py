from datetime import date, datetime

from pydantic import BaseModel, EmailStr, Field


class InterviewSlotProposalIn(BaseModel):
    round_type: str = Field(min_length=1, max_length=50)
    interviewer_person_id_platform: str | None = Field(default=None, min_length=1, max_length=64)
    interviewer_email: EmailStr | None = None
    start_date: date | None = None


class InterviewSlotOut(BaseModel):
    candidate_interview_slot_id: int
    slot_start_at: datetime
    slot_end_at: datetime
    selection_token: str
    status: str


class InterviewSlotPreviewOut(BaseModel):
    slot_start_at: datetime
    slot_end_at: datetime
    label: str
