from typing import Optional

from pydantic import BaseModel


class PlatformRoleOut(BaseModel):
    role_id: int
    role_code: str
    role_name: Optional[str] = None

    class Config:
        from_attributes = True


class PlatformRoleCreateIn(BaseModel):
    role_id: int | None = None
    role_code: str
    role_name: str | None = None


class PlatformRoleUpdateIn(BaseModel):
    role_code: str | None = None
    role_name: str | None = None


class PlatformRoleAssignIn(BaseModel):
    role_id: int | None = None
