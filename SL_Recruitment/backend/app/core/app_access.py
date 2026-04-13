from __future__ import annotations

from fastapi import Depends, HTTPException, status

from app.core.auth import get_current_user
from app.schemas.user import UserContext
from app.services.app_access import is_superadmin_identity


def is_superadmin_user(user: UserContext) -> bool:
    return is_superadmin_identity(
        role_ids=[*(user.platform_role_ids or []), user.platform_role_id],
        role_values=[
            *(user.roles or []),
            *(user.platform_role_codes or []),
            *(user.platform_role_names or []),
            user.platform_role_code,
            user.platform_role_name,
        ],
    )


def has_recruitment_app_access(user: UserContext) -> bool:
    return is_superadmin_user(user) or bool(getattr(user, "can_access_recruitment", False))


def has_planner_app_access(user: UserContext) -> bool:
    return is_superadmin_user(user) or bool(getattr(user, "can_access_planner", False))


def require_recruitment_app_access():
    async def dependency(user: UserContext = Depends(get_current_user)) -> UserContext:
        if not has_recruitment_app_access(user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Recruitment access is restricted")
        return user

    return dependency
