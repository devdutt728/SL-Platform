from __future__ import annotations

import hmac

from fastapi import HTTPException, status
from starlette.requests import Request

from app.core.auth import get_current_user
from app.core.config import settings
from app.core.roles import Role
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


def _is_sheet_ingest_path(path: str, method: str) -> bool:
    if method.upper() != "POST":
        return False
    normalized = (path or "").rstrip("/").lower()
    return normalized.endswith("/rec/candidates/import/google-sheet") or normalized.endswith(
        "/rec/candidates/import/google-sheet/repair-documents"
    )


def _has_valid_sheet_ingest_token(request: Request) -> bool:
    configured = (settings.sheet_ingest_token or "").strip()
    if not configured:
        return False
    supplied = (request.headers.get("x-sheet-ingest-token") or "").strip()
    return bool(supplied) and hmac.compare_digest(supplied, configured)


def require_recruitment_app_access():
    async def dependency(request: Request) -> UserContext:
        if _is_sheet_ingest_path(request.url.path, request.method) and _has_valid_sheet_ingest_token(request):
            return UserContext(
                user_id="google-sheet-import",
                email="google-sheet-import@studiolotus.in",
                roles=[Role.HR_ADMIN],
                can_access_recruitment=True,
            )

        user = await get_current_user(request)
        if not has_recruitment_app_access(user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Recruitment access is restricted")
        return user

    return dependency
