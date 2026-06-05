from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, EmailStr


class AccessLevel(str, Enum):
    """Resolved People-module access level for the current user."""

    VIEW = "view"
    EDIT = "edit"
    PUBLISHER = "publisher"  # edit + publish/revert, but not group/grant admin
    ADMIN = "admin"


_LEVEL_RANK = {
    AccessLevel.VIEW: 0,
    AccessLevel.EDIT: 1,
    AccessLevel.PUBLISHER: 2,
    AccessLevel.ADMIN: 3,
}


def at_least(level: AccessLevel, required: AccessLevel) -> bool:
    return _LEVEL_RANK[level] >= _LEVEL_RANK[required]


class UserContext(BaseModel):
    user_id: str
    email: EmailStr
    person_id_platform: str | None = None
    person_code: str | None = None
    full_name: str | None = None
    roles: list[str] = []
    platform_role_id: int | None = None
    platform_role_code: str | None = None
    platform_role_name: str | None = None
    platform_role_ids: list[int] | None = None
    platform_role_codes: list[str] | None = None
    platform_role_names: list[str] | None = None
    access_level: AccessLevel = AccessLevel.VIEW

    @property
    def is_admin(self) -> bool:
        return self.access_level == AccessLevel.ADMIN

    @property
    def is_platform_superadmin(self) -> bool:
        values = [
            self.platform_role_code,
            self.platform_role_name,
            *(self.platform_role_codes or []),
            *(self.platform_role_names or []),
            *self.roles,
        ]
        tokens = {
            str(value or "").strip().lower().replace(" ", "_").replace("-", "_")
            for value in values
            if str(value or "").strip()
        }
        return (
            bool(tokens & {"superadmin", "super_admin", "s_admin"})
            or self.platform_role_id == 2
            or 2 in (self.platform_role_ids or [])
        )

    @property
    def can_edit(self) -> bool:
        return at_least(self.access_level, AccessLevel.EDIT)
