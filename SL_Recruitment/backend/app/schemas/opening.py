from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, field_validator


class OpeningCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    opening_code: Optional[str] = None
    title: str
    description: Optional[str] = None
    location_city: Optional[str] = None
    location_country: Optional[str] = None
    requested_by_person_id_platform: Optional[str] = None
    headcount_required: Optional[int] = None
    is_active: bool = True

    @field_validator("opening_code")
    @classmethod
    def _strip_code(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip()
        return v or None


class OpeningUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Optional[str] = None
    description: Optional[str] = None
    location_city: Optional[str] = None
    location_country: Optional[str] = None
    requested_by_person_id_platform: Optional[str] = None
    headcount_required: Optional[int] = None
    headcount_filled: Optional[int] = None
    is_active: Optional[bool] = None


class OpeningListItem(BaseModel):
    opening_id: int
    opening_code: Optional[str] = None
    title: Optional[str] = None
    location_city: Optional[str] = None
    is_active: Optional[bool] = None
    requested_by_person_id_platform: Optional[str] = None
    requested_by_name: Optional[str] = None
    requested_by_role_name: Optional[str] = None
    requested_by_role_code: Optional[str] = None
    requested_by_person_code: Optional[str] = None
    requested_by_email: Optional[str] = None
    requested_by_phone: Optional[str] = None
    headcount_required: Optional[int] = None
    headcount_filled: Optional[int] = None

    class Config:
        from_attributes = True


class OpeningDetail(OpeningListItem):
    description: Optional[str] = None
    location_country: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
