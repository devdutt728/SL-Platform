from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr


class CandidateCreate(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None
    opening_id: Optional[int] = None
    source_channel: Optional[str] = None
    cv_url: Optional[str] = None


class CandidateUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    opening_id: Optional[int] = None
    status: Optional[str] = None
    cv_url: Optional[str] = None


class CandidateListItem(BaseModel):
    candidate_id: int
    candidate_code: str
    name: str
    opening_id: Optional[int] = None
    opening_title: Optional[str] = None
    current_stage: Optional[str] = None
    status: str
    ageing_days: int
    caf_sent_at: Optional[datetime] = None
    caf_submitted_at: Optional[datetime] = None
    needs_hr_review: bool = False
    screening_result: Optional[str] = None


class CandidateDetailOut(BaseModel):
    candidate_id: int
    candidate_code: str
    name: str
    email: EmailStr
    phone: Optional[str] = None
    opening_id: Optional[int] = None
    opening_title: Optional[str] = None

    status: str
    current_stage: Optional[str] = None
    final_decision: Optional[str] = None
    hired_person_id_platform: Optional[int] = None

    cv_url: Optional[str] = None
    drive_folder_url: Optional[str] = None

    caf_sent_at: Optional[datetime] = None
    caf_submitted_at: Optional[datetime] = None
    needs_hr_review: bool = False

    application_docs_status: str
    joining_docs_status: str

    created_at: datetime
    updated_at: datetime
