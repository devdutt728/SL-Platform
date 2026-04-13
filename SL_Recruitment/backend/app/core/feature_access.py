from __future__ import annotations

from fastapi import Depends, HTTPException, status

from app.core.auth import get_current_user
from app.core.app_access import is_superadmin_user
from app.schemas.user import UserContext

def has_reports_access(user: UserContext) -> bool:
    if is_superadmin_user(user):
        return True
    return bool(getattr(user, "reports_access", False))


def require_reports_access():
    async def dependency(user: UserContext = Depends(get_current_user)) -> UserContext:
        if not has_reports_access(user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return user

    return dependency
