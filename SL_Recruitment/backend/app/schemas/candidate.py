from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, model_validator


class CandidateCreate(BaseModel):
    name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: EmailStr
    phone: Optional[str] = None
    opening_id: Optional[int] = None
    source_channel: Optional[str] = None
    cv_url: Optional[str] = None
    resume_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    educational_qualification: Optional[str] = None
    years_of_experience: Optional[float] = None
    city: Optional[str] = None
    terms_consent: Optional[bool] = None
    l2_owner_email: Optional[EmailStr] = None
    l2_owner_name: Optional[str] = None

    @model_validator(mode="after")
    def _ensure_name(self):
        if self.first_name:
            return self
        if self.name:
            return self
        raise ValueError("Either `first_name` or `name` is required.")


class CandidateUpdate(BaseModel):
    name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    opening_id: Optional[int] = None
    status: Optional[str] = None
    cv_url: Optional[str] = None
    resume_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    educational_qualification: Optional[str] = None
    years_of_experience: Optional[float] = None
    city: Optional[str] = None
    terms_consent: Optional[bool] = None
    l2_owner_email: Optional[EmailStr] = None
    l2_owner_name: Optional[str] = None


class CandidateListItem(BaseModel):
    candidate_id: int
    candidate_code: str
    name: str
    opening_id: Optional[int] = None
    opening_title: Optional[str] = None
    l2_owner_email: Optional[EmailStr] = None
    l2_owner_name: Optional[str] = None
    source_channel: Optional[str] = None
    source_origin: Optional[str] = None
    external_source_ref: Optional[str] = None
    current_stage: Optional[str] = None
    status: str
    ageing_days: int
    applied_ageing_days: int
    created_at: Optional[datetime] = None
    caf_sent_at: Optional[datetime] = None
    caf_submitted_at: Optional[datetime] = None
    needs_hr_review: bool = False
    screening_result: Optional[str] = None
    l1_interview_count: int = 0
    l1_feedback_submitted: bool = False
    l2_interview_count: int = 0
    l2_feedback_submitted: bool = False


class CandidateDetailOut(BaseModel):
    candidate_id: int
    candidate_code: str
    name: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: EmailStr
    phone: Optional[str] = None
    opening_id: Optional[int] = None
    opening_title: Optional[str] = None
    l2_owner_email: Optional[EmailStr] = None
    l2_owner_name: Optional[str] = None
    source_channel: Optional[str] = None
    source_origin: Optional[str] = None
    external_source_ref: Optional[str] = None
    educational_qualification: Optional[str] = None
    years_of_experience: Optional[float] = None
    city: Optional[str] = None
    terms_consent: Optional[bool] = None
    terms_consent_at: Optional[datetime] = None

    status: str
    current_stage: Optional[str] = None
    final_decision: Optional[str] = None
    hired_person_id_platform: Optional[int] = None

    cv_url: Optional[str] = None
    resume_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    portfolio_not_uploaded_reason: Optional[str] = None
    questions_from_candidate: Optional[str] = None
    drive_folder_url: Optional[str] = None

    caf_sent_at: Optional[datetime] = None
    caf_submitted_at: Optional[datetime] = None
    needs_hr_review: bool = False

    application_docs_status: str
    joining_docs_status: str

    created_at: datetime
    updated_at: datetime
