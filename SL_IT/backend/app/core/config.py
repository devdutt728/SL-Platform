from __future__ import annotations

import json
import os
from typing import Literal

from pydantic import AliasChoices, Field

from pydantic_settings import BaseSettings, SettingsConfigDict


def _parse_role_map(value: str | None) -> dict[int, list[str]]:
    if not value:
        return {}
    try:
        raw = json.loads(value)
    except json.JSONDecodeError:
        return {}
    if not isinstance(raw, dict):
        return {}
    parsed: dict[int, list[str]] = {}
    for key, roles in raw.items():
        try:
            role_id = int(key)
        except (TypeError, ValueError):
            continue
        if isinstance(roles, str):
            parsed[role_id] = [roles]
        elif isinstance(roles, list):
            parsed[role_id] = [str(role) for role in roles]
    return parsed


def _env_files() -> list[str]:
    env = os.getenv("SL_ENVIRONMENT", "").strip().lower()
    files = [".env"]
    if env and env != "development":
        files.append(f".env.{env}")
    else:
        files.append(".env.local")
    return files


class Settings(BaseSettings):
    app_name: str = "Studio Lotus IMS"
    environment: str = "development"
    ims_module_enabled: bool = False

    database_url: str
    platform_database_url: str

    auth_mode: Literal["dev", "google"] = "google"
    auth_rate_limit_per_min: int = 60
    auth_rate_limit_window_seconds: int = 60
    internal_api_key: str = ""
    internal_api_allow_localhost: bool = True
    session_idle_minutes: int = 15
    session_table: str = "slp_user_session"

    google_client_id: str = ""
    google_client_secret: str = ""
    google_workspace_domain: str = ""
    google_application_credentials: str = Field(
        default="secrets/google-service-account.json",
        validation_alias=AliasChoices(
            "SL_GOOGLE_APPLICATION_CREDENTIALS",
            "GOOGLE_SERVICE_ACCOUNT_JSON_PATH",
            "GOOGLE_APPLICATION_CREDENTIALS",
        ),
    )
    google_oauth_secrets_path: str = Field(
        default="secrets/Oauth SL_Platform.json",
        validation_alias=AliasChoices("SL_GOOGLE_OAUTH_SECRETS_PATH", "GOOGLE_OAUTH_SECRETS_PATH"),
    )
    google_clock_skew_seconds: int = 180

    # Google Drive (invoice/bill auto-filing) — configured in a later phase.
    drive_root_folder_id: str = ""
    drive_timezone: str = "Asia/Kolkata"

    public_app_origin: str = ""

    role_map_json: str | None = None
    superadmin_email: str = Field(
        default="",
        validation_alias=AliasChoices("SL_SUPERADMIN_EMAIL", "SUPERADMIN_EMAIL"),
    )

    model_config = SettingsConfigDict(env_prefix="SL_", env_file=_env_files(), extra="ignore")

    @property
    def role_map(self) -> dict[int, list[str]]:
        return _parse_role_map(self.role_map_json)


settings = Settings()
