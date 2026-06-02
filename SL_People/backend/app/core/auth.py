from __future__ import annotations

import json
import logging
from typing import Optional

import urllib3
from fastapi import HTTPException, Request, status
from google.auth.transport.urllib3 import Request as GoogleAuthRequest
from google.oauth2 import id_token as google_id_token
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import settings
from app.core.paths import resolve_repo_path
from app.db.platform_session import PlatformSessionLocal
from app.db.session import SessionLocal
from app.schemas.user import AccessLevel, UserContext
from app.services.people_access import default_access_for_identity, resolve_access_level
from app.services.platform_identity import is_active_status, resolve_identity_by_email

logger = logging.getLogger("slp.people.auth")


async def get_current_user(request: Request) -> UserContext:
    bearer = _read_bearer_token(request)
    if bearer:
        token_info = _verify_google_id_token(bearer)
        email = str(token_info.get("email", "")).lower()
        if not email:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token (missing email)")

        if settings.google_workspace_domain:
            if token_info.get("hd") != settings.google_workspace_domain:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User not in allowed workspace domain")

        try:
            async with PlatformSessionLocal() as platform_session:
                identity = await resolve_identity_by_email(platform_session, email)
            if not identity:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User not found in sl_platform.dim_person")
            if identity.is_deleted:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is deleted")
            if not is_active_status(identity.status):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is not active")

            async with SessionLocal() as people_session:
                access_level = await resolve_access_level(people_session, identity)
        except HTTPException:
            raise
        except SQLAlchemyError as exc:
            detail = "Platform DB error" if settings.environment == "production" else f"Platform DB error: {exc}"
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=detail)
        except Exception as exc:  # noqa: BLE001
            logger.exception("People auth identity lookup failed")
            detail = "Identity lookup failed" if settings.environment == "production" else f"Identity lookup failed: {exc}"
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=detail)

        return UserContext(
            user_id=email,
            email=email,
            person_id_platform=str(identity.person_id),
            person_code=identity.person_code,
            full_name=identity.full_name,
            roles=sorted({*(identity.role_codes or []), "authenticated"}),
            platform_role_id=identity.role_id,
            platform_role_code=identity.role_code,
            platform_role_name=identity.role_name,
            platform_role_ids=identity.role_ids,
            platform_role_codes=identity.role_codes,
            platform_role_names=identity.role_names,
            access_level=access_level,
        )

    if settings.auth_mode == "google":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")

    # Dev mode — trust headers, default to admin so local work is unblocked.
    email = request.headers.get("x-user-email") or "demo@example.com"
    full_name = request.headers.get("x-user-name") or email
    level_header = (request.headers.get("x-people-access") or "admin").strip().lower()
    try:
        access_level = AccessLevel(level_header)
    except ValueError:
        access_level = AccessLevel.ADMIN
    return UserContext(
        user_id=email,
        email=email,
        person_id_platform=request.headers.get("x-user-person-id"),
        full_name=full_name,
        roles=["authenticated"],
        access_level=access_level,
    )


def _read_bearer_token(request: Request) -> Optional[str]:
    auth = request.headers.get("authorization") or ""
    prefix = "bearer "
    if auth.lower().startswith(prefix):
        return auth[len(prefix):].strip()
    return None


def _load_oauth_client_id() -> Optional[str]:
    if settings.google_client_id:
        return settings.google_client_id
    path = resolve_repo_path(settings.google_oauth_secrets_path)
    if not path.exists():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    for key in ("web", "installed"):
        if isinstance(data, dict) and isinstance(data.get(key), dict):
            return data[key].get("client_id")
    return None


def _verify_google_id_token(token: str) -> dict:
    client_id = _load_oauth_client_id()
    if not client_id:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Missing Google OAuth client_id")
    try:
        req = GoogleAuthRequest(urllib3.PoolManager())
        return google_id_token.verify_oauth2_token(
            token, req, audience=client_id, clock_skew_in_seconds=int(settings.google_clock_skew_seconds)
        )
    except Exception as exc:  # noqa: BLE001
        detail = "Invalid Google token" if settings.environment == "production" else f"Invalid Google token: {exc}"
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)
