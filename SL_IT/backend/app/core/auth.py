from __future__ import annotations

import json
from typing import Iterable, Optional

from fastapi import Depends, HTTPException, Request, status
import urllib3
from google.auth.transport.urllib3 import Request as GoogleAuthRequest
from google.oauth2 import id_token as google_id_token
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import settings
from app.core.paths import resolve_repo_path
from app.core.roles import Role, has_required_role
from app.db.platform_session import PlatformSessionLocal
from app.schemas.user import UserContext
from app.services.platform_identity import resolve_identity_by_email
from app.services.user_service import ensure_superadmin_for_email, is_active_status


async def get_current_user(request: Request) -> UserContext:
    bearer = _read_bearer_token(request)
    if bearer:
        token_info = _verify_google_id_token(bearer)
        email = str(token_info.get("email", "")).lower()
        if not email:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token (missing email)")

        if settings.google_workspace_domain:
            hosted_domain = token_info.get("hd")
            if hosted_domain != settings.google_workspace_domain:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User not in allowed workspace domain")

        try:
            async with PlatformSessionLocal() as platform_session:
                await ensure_superadmin_for_email(platform_session, email)
                identity = await resolve_identity_by_email(platform_session, email)
        except SQLAlchemyError as exc:
            detail = "Platform DB error"
            if settings.environment != "production":
                detail = f"Platform DB error: {exc}"
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=detail)
        except Exception as exc:
            detail = "Platform identity lookup failed"
            if settings.environment != "production":
                detail = f"Platform identity lookup failed: {exc}"
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=detail)

        if not identity:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User not found in sl_platform.dim_person")

        if identity.is_deleted:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is deleted")
        if identity.status and not is_active_status(identity.status):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is not active")

        roles = _map_platform_roles_to_app_roles(identity.role_ids, identity.role_codes)
        if Role.VIEWER in roles and len(roles) == 1:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access restricted")

        return UserContext(
            user_id=email,
            email=email,
            person_id_platform=str(identity.person_id),
            roles=roles,
            full_name=identity.full_name,
            platform_role_id=identity.role_id,
            platform_role_code=identity.role_code,
            platform_role_name=identity.role_name,
            platform_role_ids=identity.role_ids,
            platform_role_codes=identity.role_codes,
        )

    if settings.auth_mode == "google":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")

    email = request.headers.get("x-user-email") or "demo@example.com"
    full_name = request.headers.get("x-user-name") or _derive_name_from_email(email)
    roles_header = request.headers.get("x-user-roles") or Role.ADMIN.value
    roles: list[Role] = []
    for raw in roles_header.split(","):
        raw = raw.strip()
        if not raw:
            continue
        try:
            roles.append(Role(raw))
        except Exception:
            continue

    if not roles:
        roles = [Role.VIEWER]

    return UserContext(
        user_id=email,
        email=email,
        person_id_platform=email,
        roles=roles,
        full_name=full_name,
        platform_role_id=None,
        platform_role_code=None,
        platform_role_name=None,
    )


def _read_bearer_token(request: Request) -> Optional[str]:
    auth = request.headers.get("authorization") or ""
    prefix = "bearer "
    if auth.lower().startswith(prefix):
        return auth[len(prefix) :].strip()
    return None


def _load_oauth_client_id() -> Optional[str]:
    if settings.google_client_id:
        return settings.google_client_id
    path = resolve_repo_path(settings.google_oauth_secrets_path)
    if not path.exists():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, dict) and "web" in data and isinstance(data["web"], dict):
        return data["web"].get("client_id")
    if isinstance(data, dict) and "installed" in data and isinstance(data["installed"], dict):
        return data["installed"].get("client_id")
    return None


def _verify_google_id_token(token: str) -> dict:
    client_id = _load_oauth_client_id()
    if not client_id:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Missing Google OAuth client_id")
    try:
        req = GoogleAuthRequest(urllib3.PoolManager())
        return google_id_token.verify_oauth2_token(
            token,
            req,
            audience=client_id,
            clock_skew_in_seconds=int(settings.google_clock_skew_seconds),
        )
    except Exception as exc:
        detail = "Invalid Google token"
        if settings.environment != "production":
            detail = f"Invalid Google token: {exc}"
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)


def _map_platform_roles_to_app_roles(role_ids: list[int], role_codes: list[str]) -> list[Role]:
    role_map = settings.role_map
    roles: list[Role] = []
    for role_id in role_ids:
        if role_id in role_map:
            for role_name in role_map[role_id]:
                try:
                    roles.append(Role(role_name))
                except Exception:
                    continue

    if not roles:
        for code in role_codes:
            normalized = code.strip().lower()
            try:
                roles.append(Role(normalized))
            except Exception:
                continue

    return roles or [Role.VIEWER]


def _derive_name_from_email(email: str) -> str:
    local = email.split("@", 1)[0].strip()
    if not local:
        return email
    parts = [p for p in local.replace("_", ".").split(".") if p]
    if not parts:
        return local
    return " ".join(p[:1].upper() + p[1:] for p in parts)


def require_roles(required: Iterable[Role]):
    async def dependency(user: UserContext = Depends(get_current_user)) -> UserContext:
        if not has_required_role(user.roles, required):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return user

    return dependency
