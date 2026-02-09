from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel


ScreeningResult = Literal["green", "amber", "red"]


class ScreeningUpsertIn(BaseModel):
    willing_to_relocate: Optional[bool] = None

    gender_identity: Optional[str] = None
    gender_self_describe: Optional[str] = None

    screening_notes: Optional[str] = None


class ScreeningOut(BaseModel):
    candidate_id: int
    salary_band_fit: Optional[str] = None

    willing_to_relocate: Optional[bool] = None

    gender_identity: Optional[str] = None
    gender_self_describe: Optional[str] = None

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
