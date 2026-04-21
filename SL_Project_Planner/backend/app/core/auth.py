from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timedelta
from typing import Optional

import urllib3
from fastapi import HTTPException, Request, status
from google.auth.transport.urllib3 import Request as GoogleAuthRequest
from google.oauth2 import id_token as google_id_token
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import settings
from app.core.paths import resolve_repo_path
from app.models.platform_person import DimPerson
from app.db.platform_session import PlatformSessionLocal
from app.schemas.user import UserContext
from app.services.platform_identity import resolve_identity_by_email
from app.services.platform_feature_access import PLANNER_APP_FEATURE_CODE, RECRUITMENT_APP_FEATURE_CODE, person_has_feature_access
from app.services.planner_policy import resolve_planner_roles
from app.services.planner_role_access import list_explicit_planner_roles

_session_table_ready = False
_session_table_ready_name = ""
_session_table_lock = asyncio.Lock()
logger = logging.getLogger(__name__)


async def get_current_user(request: Request) -> UserContext:
    try:
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
                    identity = await resolve_identity_by_email(platform_session, email)
                    if not identity:
                        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User not found in sl_platform.dim_person")
                    if identity.is_deleted:
                        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is deleted")
                    if identity.status and identity.status.lower() not in {"working", "active"}:
                        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is not active")

                    await _enforce_single_session(platform_session, request, email)
                    person = await platform_session.get(DimPerson, str(identity.person_id))
                    explicit_role_map = await list_explicit_planner_roles(platform_session, [str(identity.person_id)])
                    planner_roles = resolve_planner_roles(
                        UserContext(
                            user_id=email,
                            email=email,
                            roles=sorted({*(identity.role_codes or []), "authenticated"}),
                            person_id_platform=str(identity.person_id),
                            full_name=identity.full_name,
                            platform_role_id=identity.role_id,
                            platform_role_code=identity.role_code,
                            platform_role_name=identity.role_name,
                            platform_role_ids=identity.role_ids,
                            platform_role_codes=identity.role_codes,
                            platform_role_names=identity.role_names,
                        ),
                        person,
                        explicit_role_map.get(str(identity.person_id), []),
                    )
                    is_superadmin = "super_admin" in planner_roles
                    planner_role_eligible = any(role != "viewer" for role in planner_roles)
                    planner_feature_granted = is_superadmin or await person_has_feature_access(
                        platform_session,
                        person_id=str(identity.person_id),
                        feature_code=PLANNER_APP_FEATURE_CODE,
                    )
                    can_access_planner = bool(is_superadmin or planner_feature_granted or planner_role_eligible)
                    recruitment_tokens = {
                        str(value or "").strip().lower().replace(" ", "_").replace("-", "_")
                        for value in [
                            *(identity.role_codes or []),
                            *(identity.role_names or []),
                            identity.role_code,
                            identity.role_name,
                        ]
                        if str(value or "").strip()
                    }
                    recruitment_tokens.update(str(value or "").strip().lower() for value in sorted({*(identity.role_codes or []), "authenticated"}))
                    can_access_recruitment = (
                        bool({"hr_admin", "hr_exec", "interviewer", "gl", "group_lead", "grouplead", "hiring_manager", "approver", "superadmin", "s_admin", "super_admin"} & recruitment_tokens)
                        or 2 in (identity.role_ids or [])
                    ) and (is_superadmin or await person_has_feature_access(
                        platform_session,
                        person_id=str(identity.person_id),
                        feature_code=RECRUITMENT_APP_FEATURE_CODE,
                    ))
            except HTTPException:
                raise
            except SQLAlchemyError as exc:
                logger.exception("Planner auth platform DB error")
                detail = "Platform DB error"
                if settings.environment != "production":
                    detail = f"Platform DB error: {exc}"
                raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=detail)
            except Exception as exc:
                logger.exception("Planner auth identity lookup failed")
                detail = "Platform identity lookup failed"
                if settings.environment != "production":
                    detail = f"Platform identity lookup failed: {exc}"
                raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=detail)

            return UserContext(
                user_id=email,
                email=email,
                roles=sorted({*(identity.role_codes or []), "authenticated"}),
                person_id_platform=str(identity.person_id),
                full_name=identity.full_name,
                platform_role_id=identity.role_id,
                platform_role_code=identity.role_code,
                platform_role_name=identity.role_name,
                platform_role_ids=identity.role_ids,
                platform_role_codes=identity.role_codes,
                platform_role_names=identity.role_names,
                can_access_recruitment=can_access_recruitment,
                can_access_planner=can_access_planner,
            )

        if settings.auth_mode == "google":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")

        email = request.headers.get("x-user-email") or "demo@example.com"
        full_name = request.headers.get("x-user-name") or _derive_name_from_email(email)
        roles_header = request.headers.get("x-user-roles") or "viewer"
        roles = [value.strip() for value in roles_header.split(",") if value.strip()] or ["viewer"]
        return UserContext(
            user_id=email,
            email=email,
            roles=roles,
            full_name=full_name,
            can_access_recruitment=True,
            can_access_planner=True,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Planner auth unexpected failure")
        detail = "Planner auth failed"
        if settings.environment != "production":
            detail = f"Planner auth failed: {exc}"
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=detail)


def _read_session_id(request: Request) -> Optional[str]:
    header = request.headers.get("x-spp-session") or ""
    if header:
        return header.strip()
    return request.cookies.get("spp_sid")


async def _ensure_session_table(platform_session) -> None:
    global _session_table_ready, _session_table_ready_name

    table = settings.session_table
    if _session_table_ready and _session_table_ready_name == table:
        return

    async with _session_table_lock:
        if _session_table_ready and _session_table_ready_name == table:
            return

        await platform_session.execute(
            text(
                f"""
                CREATE TABLE IF NOT EXISTS {table} (
                  email VARCHAR(255) PRIMARY KEY,
                  session_id VARCHAR(64) NOT NULL,
                  last_activity DATETIME NOT NULL,
                  created_at DATETIME NOT NULL,
                  updated_at DATETIME NOT NULL
                )
                """
            )
        )
        await platform_session.commit()
        _session_table_ready = True
        _session_table_ready_name = table


async def _enforce_single_session(platform_session, request: Request, email: str) -> None:
    session_id = _read_session_id(request)
    if not session_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing session")

    await _ensure_session_table(platform_session)
    table = settings.session_table
    now = datetime.utcnow()
    idle_cutoff = now - timedelta(minutes=int(settings.session_idle_minutes or 15))

    row = (
        await platform_session.execute(
            text(f"SELECT session_id, last_activity FROM {table} WHERE email = :email"),
            {"email": email},
        )
    ).first()

    if row:
        current_id, last_activity = row[0], row[1]
        if last_activity and last_activity < idle_cutoff:
            await platform_session.execute(text(f"DELETE FROM {table} WHERE email = :email"), {"email": email})
            await platform_session.commit()
            allow_override = (request.headers.get("x-spp-session-init") or "").strip() == "1"
            if allow_override:
                await platform_session.execute(
                    text(
                        f"INSERT INTO {table} (email, session_id, last_activity, created_at, updated_at) VALUES (:email, :sid, :now, :now, :now)"
                    ),
                    {"email": email, "sid": session_id, "now": now},
                )
                await platform_session.commit()
                return
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")

        if current_id != session_id:
            allow_override = (request.headers.get("x-spp-session-init") or "").strip() == "1"
            if not allow_override:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session replaced by another login")
            await platform_session.execute(
                text(f"UPDATE {table} SET session_id = :sid, last_activity = :now, updated_at = :now WHERE email = :email"),
                {"sid": session_id, "now": now, "email": email},
            )
            await platform_session.commit()
            return

        await platform_session.execute(
            text(f"UPDATE {table} SET last_activity = :now, updated_at = :now WHERE email = :email"),
            {"now": now, "email": email},
        )
        await platform_session.commit()
        return

    await platform_session.execute(
        text(
            f"INSERT INTO {table} (email, session_id, last_activity, created_at, updated_at) VALUES (:email, :sid, :now, :now, :now)"
        ),
        {"email": email, "sid": session_id, "now": now},
    )
    await platform_session.commit()


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


def _derive_name_from_email(email: str) -> str:
    local = email.split("@", 1)[0].strip()
    if not local:
        return email
    parts = [part for part in local.replace("_", ".").split(".") if part]
    if not parts:
        return local
    return " ".join(part[:1].upper() + part[1:] for part in parts)
