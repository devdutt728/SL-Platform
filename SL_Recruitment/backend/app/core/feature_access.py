from __future__ import annotations

from collections.abc import Iterable

from fastapi import Depends, HTTPException, status

from app.core.auth import get_current_user
from app.core.config import settings
from app.core.roles import Role
from app.schemas.user import UserContext

_SUPERADMIN_TOKENS = {"2", "superadmin", "s_admin", "super_admin"}
_REPORTS_ACCESS_TOKENS = {
    "recruitment_reports",
    "recruitment_reports_access",
    "reports_access",
}


def _normalize_role_token(value: object) -> str:
    return str(value or "").strip().lower().replace(" ", "_").replace("-", "_")


def _iter_role_tokens(user: UserContext) -> Iterable[str]:
    values = [
        *(user.platform_role_codes or []),
        *(user.platform_role_names or []),
        user.platform_role_code or "",
        user.platform_role_name or "",
    ]
    for value in values:
        token = _normalize_role_token(value)
        if token:
            yield token


def is_superadmin_user(user: UserContext) -> bool:
    if (user.platform_role_id or None) == 2:
        return True
    if user.platform_role_ids and 2 in user.platform_role_ids:
        return True
    if any(token in _SUPERADMIN_TOKENS for token in _iter_role_tokens(user)):
        return True
    return user.platform_role_id is None and Role.HR_ADMIN in user.roles and settings.environment != "production"


def has_reports_access(user: UserContext) -> bool:
    if is_superadmin_user(user):
        return True
    return any(token in _REPORTS_ACCESS_TOKENS for token in _iter_role_tokens(user))


def require_reports_access():
    async def dependency(user: UserContext = Depends(get_current_user)) -> UserContext:
        if not has_reports_access(user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return user

    return dependency
