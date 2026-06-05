from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Optional

import urllib3
from fastapi import HTTPException, Request, status
from google.auth.transport.urllib3 import Request as GoogleAuthRequest
from google.oauth2 import id_token as google_id_token
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import settings
from app.core.paths import repo_root, resolve_repo_path
from app.db.platform_session import PlatformSessionLocal
from app.db.session import SessionLocal
from app.schemas.user import AccessLevel, UserContext
from app.services.people_access import default_access_for_identity, resolve_access_level
from app.services.platform_identity import is_active_status, resolve_identity_by_email

logger = logging.getLogger("slp.people.auth")
OAUTH_SECRET_FILENAME = "Oauth SL_Platform.json"


async def get_current_user(request: Request) -> UserContext:
    proxy_verified_superadmin = request.headers.get("x-platform-superadmin") == "1"
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

        role_ids = list(identity.role_ids or [])
        role_codes = list(identity.role_codes or [])
        role_names = list(identity.role_names or [])
        primary_role_id = identity.role_id
        primary_role_code = identity.role_code
        primary_role_name = identity.role_name
        if proxy_verified_superadmin:
            if 2 not in role_ids:
                role_ids.append(2)
            if "superadmin" not in role_codes:
                role_codes.append("superadmin")
            if "Superadmin" not in role_names:
                role_names.append("Superadmin")
            primary_role_id = primary_role_id or 2
            primary_role_code = primary_role_code or "superadmin"
            primary_role_name = primary_role_name or "Superadmin"

        return UserContext(
            user_id=email,
            email=email,
            person_id_platform=str(identity.person_id),
            person_code=identity.person_code,
            full_name=identity.full_name,
            roles=sorted({*role_codes, "authenticated"}),
            platform_role_id=primary_role_id,
            platform_role_code=primary_role_code,
            platform_role_name=primary_role_name,
            platform_role_ids=role_ids,
            platform_role_codes=role_codes,
            platform_role_names=role_names,
            access_level=access_level,
        )

    proxy_email = request.headers.get("x-user-email")
    if proxy_email:
        return _user_from_trusted_proxy_headers(request, proxy_verified_superadmin)

    if settings.auth_mode == "google":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")

    # Dev mode — trust headers, default to admin so local work is unblocked.
    email = "demo@example.com"
    return _user_from_headers(
        email=email,
        full_name=email,
        person_id_platform=None,
        access_level=AccessLevel.ADMIN,
        proxy_verified_superadmin=proxy_verified_superadmin,
    )


def _user_from_trusted_proxy_headers(request: Request, proxy_verified_superadmin: bool) -> UserContext:
    email = request.headers.get("x-user-email") or "demo@example.com"
    full_name = request.headers.get("x-user-name") or email
    level_header = (request.headers.get("x-people-access") or "admin").strip().lower()
    try:
        access_level = AccessLevel(level_header)
    except ValueError:
        access_level = AccessLevel.ADMIN

    return _user_from_headers(
        email=email,
        full_name=full_name,
        person_id_platform=request.headers.get("x-user-person-id"),
        access_level=access_level,
        proxy_verified_superadmin=proxy_verified_superadmin,
    )


def _user_from_headers(
    email: str,
    full_name: str,
    person_id_platform: Optional[str],
    access_level: AccessLevel,
    proxy_verified_superadmin: bool,
) -> UserContext:
    role_ids = [2] if proxy_verified_superadmin else None
    role_codes = ["superadmin"] if proxy_verified_superadmin else None
    role_names = ["Superadmin"] if proxy_verified_superadmin else None
    return UserContext(
        user_id=email,
        email=email,
        person_id_platform=person_id_platform,
        full_name=full_name,
        roles=["authenticated", *(role_codes or [])],
        platform_role_id=2 if proxy_verified_superadmin else None,
        platform_role_code="superadmin" if proxy_verified_superadmin else None,
        platform_role_name="Superadmin" if proxy_verified_superadmin else None,
        platform_role_ids=role_ids,
        platform_role_codes=role_codes,
        platform_role_names=role_names,
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

    path = _resolve_oauth_secrets_path()
    if path is None:
        return None

    data = json.loads(path.read_text(encoding="utf-8"))
    for key in ("web", "installed"):
        if isinstance(data, dict) and isinstance(data.get(key), dict):
            return data[key].get("client_id")
    return None


def _resolve_oauth_secrets_path() -> Optional[Path]:
    configured_path = resolve_repo_path(settings.google_oauth_secrets_path)
    if configured_path.exists():
        return configured_path

    platform_root = repo_root().parent
    fallback_paths = [
        platform_root / "SL_Workbook" / "secrets" / OAUTH_SECRET_FILENAME,
        platform_root / "SL_Recruitment" / "secrets" / OAUTH_SECRET_FILENAME,
        platform_root / "SL_IT" / "secrets" / OAUTH_SECRET_FILENAME,
    ]
    return next((path for path in fallback_paths if path.exists()), None)


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
