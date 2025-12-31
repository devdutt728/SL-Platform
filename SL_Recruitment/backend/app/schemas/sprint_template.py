from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class SprintTemplateOut(BaseModel):
    sprint_template_id: int
    sprint_template_code: Optional[str] = None
    name: str
    description: Optional[str] = None
    opening_id: Optional[int] = None
    role_id_platform: Optional[int] = None
    instructions_url: Optional[str] = None
    expected_duration_days: Optional[int] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SprintTemplateListItem(BaseModel):
    sprint_template_id: int
    sprint_template_code: Optional[str] = None
    name: str
    description: Optional[str] = None
    opening_id: Optional[int] = None
    role_id_platform: Optional[int] = None
    instructions_url: Optional[str] = None
    expected_duration_days: Optional[int] = None
    is_active: bool

    class Config:
        from_attributes = True


class SprintTemplateCreateIn(BaseModel):
    sprint_template_code: Optional[str] = None
    name: str
    description: Optional[str] = None
    opening_id: Optional[int] = None
    role_id_platform: Optional[int] = None
    instructions_url: Optional[str] = None
    expected_duration_days: Optional[int] = None
    is_active: Optional[bool] = True


class SprintTemplateUpdateIn(BaseModel):
    sprint_template_code: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    opening_id: Optional[int] = None
    role_id_platform: Optional[int] = None
    instructions_url: Optional[str] = None
    expected_duration_days: Optional[int] = None
    is_active: Optional[bool] = None
