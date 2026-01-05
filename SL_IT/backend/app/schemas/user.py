from __future__ import annotations

from datetime import date
from typing import List, Optional

from pydantic import BaseModel, EmailStr

from app.core.roles import Role


class UserContext(BaseModel):
    user_id: str
    email: EmailStr
    roles: List[Role]
    person_id_platform: Optional[str] = None
    full_name: Optional[str] = None
    platform_role_id: Optional[int] = None
    platform_role_code: Optional[str] = None
    platform_role_name: Optional[str] = None


class PlatformUserListItem(BaseModel):
    person_id: str
    email: EmailStr | None
    full_name: str
    role_id: int | None
    role_code: str | None
    role_name: str | None
    status: str | None
    is_deleted: int | None


class PlatformRoleOut(BaseModel):
    role_id: int
    role_code: str | None
    role_name: str | None


class PlatformUserUpdate(BaseModel):
    role_id: int | None = None
    status: str | None = None


class PlatformUserCreate(BaseModel):
    person_id: str | None = None
    person_code: str | None = None
    personal_id: str | None = None
    email: EmailStr | None = None
    first_name: str | None = None
    last_name: str | None = None
    role_id: int | None = None
    grade_id: int | None = None
    department_id: int | None = None
    manager_id: str | None = None
    employment_type: str | None = None
    join_date: date | None = None
    exit_date: date | None = None
    mobile_number: str | None = None
    status: str | None = None
    is_deleted: int | None = None
    full_name: str | None = None
    display_name: str | None = None
    source_system: str | None = None
