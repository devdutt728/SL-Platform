from datetime import datetime
from typing import Literal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class OpeningRequestCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    opening_code: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    location_city: Optional[str] = None
    location_country: Optional[str] = None
    hiring_manager_person_id_platform: Optional[str] = None
    hiring_manager_email: Optional[str] = None
    gl_details: Optional[str] = None
    l2_details: Optional[str] = None
    headcount_delta: int = Field(default=1, ge=0, le=100)
    request_reason: Optional[str] = None
    source_portal: Optional[str] = None

    @model_validator(mode="after")
    def _validate_target(self):
        if not (self.opening_code or self.title):
            raise ValueError("Provide at least one of opening_code or title.")
        if self.headcount_delta == 0 and not self.hiring_manager_person_id_platform:
            raise ValueError("For zero headcount change, hiring_manager_person_id_platform is required.")
        return self


class OpeningRequestApprove(BaseModel):
    model_config = ConfigDict(extra="forbid")

    hiring_manager_person_id_platform: Optional[str] = None
    approval_note: Optional[str] = None


class OpeningRequestReject(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rejection_reason: str = Field(min_length=3, max_length=2000)


class OpeningRequestStatusUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["pending_hr_approval", "rejected", "applied"]
    rejection_reason: Optional[str] = Field(default=None, min_length=3, max_length=2000)
    approval_note: Optional[str] = None
    hiring_manager_person_id_platform: Optional[str] = None


class OpeningRequestOut(BaseModel):
    opening_request_id: int
    opening_id: Optional[int] = None
    opening_code: Optional[str] = None
    opening_title: Optional[str] = None
    opening_description: Optional[str] = None
    location_city: Optional[str] = None
    location_country: Optional[str] = None
    hiring_manager_person_id_platform: Optional[str] = None
    hiring_manager_email: Optional[str] = None
    gl_details: Optional[str] = None
    l2_details: Optional[str] = None
    request_type: str
    headcount_delta: int
    request_reason: Optional[str] = None
    requested_by_person_id_platform: Optional[str] = None
    requested_by_role: Optional[str] = None
    source_portal: Optional[str] = None
    status: str
    approved_by_person_id_platform: Optional[str] = None
    approved_at: Optional[datetime] = None
    rejected_reason: Optional[str] = None
    applied_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
