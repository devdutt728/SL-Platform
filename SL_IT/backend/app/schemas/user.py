from __future__ import annotations

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
    person_id: str
    person_code: str
    email: EmailStr | None = None
    first_name: str
    last_name: str | None = None
    role_id: int | None = None
    status: str | None = None
