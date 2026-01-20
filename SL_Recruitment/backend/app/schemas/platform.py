from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class PlatformPersonSuggestion(BaseModel):
    person_id: str
    person_code: str
    full_name: str
    email: EmailStr
    role_name: Optional[str] = None
    role_code: Optional[str] = None
    role_ids: list[int] = Field(default_factory=list)
    role_codes: list[str] = Field(default_factory=list)
    role_names: list[str] = Field(default_factory=list)


class PlatformPersonBase(BaseModel):
    person_id: str
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
    employment_type: Optional[str] = None
    join_date: Optional[date] = None
    exit_date: Optional[date] = None
    status: Optional[str] = None
    is_deleted: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    source_system: Optional[str] = None
    full_name: Optional[str] = None
    display_name: Optional[str] = None


class PlatformPersonCreate(PlatformPersonBase):
    person_id: Optional[str] = None


class PlatformPersonUpdate(BaseModel):
    person_code: Optional[str] = None
    personal_id: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[EmailStr] = None
    mobile_number: Optional[str] = None
    role_id: Optional[int] = None
    grade_id: Optional[int] = None
    department_id: Optional[int] = None
    manager_id: Optional[str] = None
    employment_type: Optional[str] = None
    join_date: Optional[date] = None
    exit_date: Optional[date] = None
    status: Optional[str] = None
    is_deleted: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    source_system: Optional[str] = None
    full_name: Optional[str] = None
    display_name: Optional[str] = None


class PlatformPersonOut(PlatformPersonBase):
    role_name: Optional[str] = None
    role_code: Optional[str] = None


class BulkUploadError(BaseModel):
    row: int
    message: str
    person_id: Optional[str] = None


class BulkUploadResult(BaseModel):
    total: int
    created: int
    updated: int
    skipped: int
    errors: list[BulkUploadError] = Field(default_factory=list)
