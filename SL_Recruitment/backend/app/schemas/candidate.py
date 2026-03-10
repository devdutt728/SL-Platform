from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, field_validator, model_validator


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
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[EmailStr] = None
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
    willing_to_relocate: Optional[bool] = None
    cv_url: Optional[str] = None
    resume_url: Optional[str] = None
    portfolio_url: Optional[str] = None
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
    duplicate_tag: bool = False
    duplicate_application_count: int = 0
    latest_reapplication_at: Optional[datetime] = None

    created_at: datetime
    updated_at: datetime


class CandidateEmployeeProfileIn(BaseModel):
    person_code: str
    personal_id: Optional[str] = None
    first_name: str
    last_name: Optional[str] = None
    email: EmailStr
    mobile_number: Optional[str] = None
    role_id: Optional[int] = None
    grade_id: Optional[int] = None
    department_id: Optional[int] = None
    manager_id: Optional[str] = None
    employment_type: str
    join_date: Optional[date] = None
    exit_date: Optional[date] = None
    status: Optional[str] = "working"
    source_system: Optional[str] = "recruitment"
    full_name: Optional[str] = None
    display_name: Optional[str] = None

    @field_validator(
        "person_code",
        "personal_id",
        "first_name",
        "last_name",
        "mobile_number",
        "manager_id",
        "employment_type",
        "status",
        "source_system",
        "full_name",
        "display_name",
        mode="before",
    )
    @classmethod
    def _strip_text(cls, value):
        if value is None:
            return None
        if isinstance(value, str):
            cleaned = value.strip()
            return cleaned or None
        return value

    @field_validator("person_code", "first_name", "employment_type")
    @classmethod
    def _required_text(cls, value: str | None):
        if not value:
            raise ValueError("This field is required.")
        return value


class CandidateConvertIn(BaseModel):
    employee_profile: CandidateEmployeeProfileIn
