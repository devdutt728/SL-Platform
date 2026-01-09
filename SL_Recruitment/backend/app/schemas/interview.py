from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, conint

Rating = conint(ge=1, le=5)
Decision = Literal["advance", "reject", "keep_warm"]


class InterviewCreate(BaseModel):
    round_type: str = Field(min_length=1, max_length=50)
    interviewer_person_id_platform: str = Field(min_length=1, max_length=64)
    scheduled_start_at: datetime
    scheduled_end_at: datetime
    location: Optional[str] = Field(default=None, max_length=200)
    meeting_link: Optional[str] = Field(default=None, max_length=500)


class InterviewUpdate(BaseModel):
    feedback_submitted: Optional[bool] = None
    rating_overall: Optional[Rating] = None
    rating_technical: Optional[Rating] = None
    rating_culture_fit: Optional[Rating] = None
    rating_communication: Optional[Rating] = None
    decision: Optional[Decision] = None
    notes_internal: Optional[str] = None
    notes_for_candidate: Optional[str] = None


class InterviewReschedule(BaseModel):
    scheduled_start_at: datetime
    scheduled_end_at: datetime


class InterviewOut(BaseModel):
    candidate_interview_id: int
    candidate_id: int
    stage_name: Optional[str] = None
    round_type: str
    interviewer_person_id_platform: Optional[str] = None
    interviewer_name: Optional[str] = None
    interviewer_email: Optional[str] = None
    scheduled_start_at: datetime
    scheduled_end_at: datetime
    location: Optional[str] = None
    meeting_link: Optional[str] = None
    calendar_event_id: Optional[str] = None
    feedback_submitted: bool
    rating_overall: Optional[int] = None
    rating_technical: Optional[int] = None
    rating_culture_fit: Optional[int] = None
    rating_communication: Optional[int] = None
    decision: Optional[str] = None
    notes_internal: Optional[str] = None
    notes_for_candidate: Optional[str] = None
    created_by_person_id_platform: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    candidate_name: Optional[str] = None
    candidate_code: Optional[str] = None
    opening_id: Optional[int] = None
    opening_title: Optional[str] = None
