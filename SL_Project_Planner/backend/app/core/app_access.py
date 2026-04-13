from __future__ import annotations

from fastapi import Depends, HTTPException, status

from app.core.auth import get_current_user
from app.schemas.user import UserContext
from app.services.planner_policy import is_superadmin_user


def has_planner_app_access(user: UserContext) -> bool:
    return is_superadmin_user(user) or bool(getattr(user, "can_access_planner", False))


def require_planner_app_access():
    async def dependency(user: UserContext = Depends(get_current_user)) -> UserContext:
        if not has_planner_app_access(user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Project Planner access is restricted")
        return user

    return dependency
