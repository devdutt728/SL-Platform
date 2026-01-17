from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel


ScreeningResult = Literal["green", "amber", "red"]


class ScreeningUpsertIn(BaseModel):
    total_experience_years: Optional[float] = None
    relevant_experience_years: Optional[float] = None
    current_ctc_annual: Optional[float] = None
    expected_ctc_annual: Optional[float] = None

    willing_to_relocate: Optional[bool] = None
    two_year_commitment: Optional[bool] = None
    notice_period_days: Optional[int] = None
    expected_joining_date: Optional[date] = None

    current_city: Optional[str] = None
    current_employer: Optional[str] = None

    gender_identity: Optional[str] = None
    gender_self_describe: Optional[str] = None

    reason_for_job_change: Optional[str] = None

    relocation_notes: Optional[str] = None
    questions_from_candidate: Optional[str] = None

    screening_notes: Optional[str] = None


class ScreeningOut(BaseModel):
    candidate_id: int
    total_experience_years: Optional[float] = None
    relevant_experience_years: Optional[float] = None
    current_ctc_annual: Optional[float] = None
    expected_ctc_annual: Optional[float] = None
    salary_band_fit: Optional[str] = None

    willing_to_relocate: Optional[bool] = None
    two_year_commitment: Optional[bool] = None
    notice_period_days: Optional[int] = None
    expected_joining_date: Optional[date] = None

    current_city: Optional[str] = None
    current_employer: Optional[str] = None

    gender_identity: Optional[str] = None
    gender_self_describe: Optional[str] = None

    reason_for_job_change: Optional[str] = None

    relocation_notes: Optional[str] = None
    questions_from_candidate: Optional[str] = None

    screening_result: Optional[str] = None
    screening_notes: Optional[str] = None

    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CafPrefillOut(BaseModel):
    candidate_id: int
    candidate_code: str
    name: str
    email: str
    phone: Optional[str] = None
    cv_url: Optional[str] = None
    caf_sent_at: Optional[datetime] = None
    caf_submitted_at: Optional[datetime] = None
    opening_id: Optional[int] = None
    opening_title: Optional[str] = None
    opening_description: Optional[str] = None
