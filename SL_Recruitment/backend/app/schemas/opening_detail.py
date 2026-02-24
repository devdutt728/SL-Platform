from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class OpeningDetailOut(BaseModel):
    opening_id: int
    opening_code: str | None = None
    title: str | None = None
    description: str | None = None
    location_city: str | None = None
    location_country: str | None = None
    is_active: bool | None = None
    requested_by_person_id_platform: str | None = None
    hiring_manager_person_id_platform: str | None = None
    headcount_required: int | None = None
    headcount_filled: int | None = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
