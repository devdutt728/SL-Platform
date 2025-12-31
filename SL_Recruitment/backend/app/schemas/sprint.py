from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

from app.schemas.sprint_attachment import SprintAttachmentPublicOut
SprintStatus = Literal["assigned", "submitted", "under_review", "completed", "cancelled"]
SprintDecision = Literal["advance", "reject", "keep_warm"]


class SprintAssignIn(BaseModel):
    sprint_template_id: int
    due_at: Optional[datetime] = None


class SprintUpdateIn(BaseModel):
    status: Optional[SprintStatus] = None
    score_overall: Optional[float] = Field(default=None, ge=0, le=10)
    comments_internal: Optional[str] = None
    comments_for_candidate: Optional[str] = None
    decision: Optional[SprintDecision] = None


class CandidateSprintOut(BaseModel):
    candidate_sprint_id: int
    candidate_id: int
    sprint_template_id: int
    assigned_by_person_id_platform: Optional[str] = None
    assigned_at: datetime
    due_at: Optional[datetime] = None
    status: str
    submission_url: Optional[str] = None
    submitted_at: Optional[datetime] = None
    reviewed_by_person_id_platform: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    score_overall: Optional[float] = None
    comments_internal: Optional[str] = None
    comments_for_candidate: Optional[str] = None
    decision: Optional[str] = None
    public_token: str
    created_at: datetime
    updated_at: datetime

    template_name: Optional[str] = None
    template_description: Optional[str] = None
    instructions_url: Optional[str] = None
    expected_duration_days: Optional[int] = None

    candidate_name: Optional[str] = None
    candidate_code: Optional[str] = None
    opening_title: Optional[str] = None

    class Config:
        from_attributes = True


class SprintPublicOut(BaseModel):
    candidate_id: int
    candidate_name: str
    opening_title: Optional[str] = None
    sprint_template_id: int
    template_name: Optional[str] = None
    template_description: Optional[str] = None
    instructions_url: Optional[str] = None
    due_at: Optional[datetime] = None
    status: str
    submission_url: Optional[str] = None
    submitted_at: Optional[datetime] = None
    attachments: list[SprintAttachmentPublicOut] = []
