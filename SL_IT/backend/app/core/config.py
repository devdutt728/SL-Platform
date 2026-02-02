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
    app_name: str = "Studio Lotus Platform"
    environment: str = "development"

    database_url: str
    platform_database_url: str

    auth_mode: Literal["dev", "google"] = "google"

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

    enable_gmail: bool = False
    enable_calendar: bool = False
    gmail_sender_email: str = ""
    gmail_sender_name: str = "SLP Helpdesk"
    calendar_id: str = "primary"
    calendar_timezone: str = "Asia/Kolkata"

    public_app_origin: str = ""

    role_map_json: str | None = None
    superadmin_email: str = Field(
        default="",
        validation_alias=AliasChoices("SL_SUPERADMIN_EMAIL", "SUPERADMIN_EMAIL"),
    )

    reopen_window_days: int = 7
    rate_limit_ticket_per_minute: int = 5

    model_config = SettingsConfigDict(env_prefix="SL_", env_file=_env_files(), extra="ignore")

    @property
    def role_map(self) -> dict[int, list[str]]:
        return _parse_role_map(self.role_map_json)


settings = Settings()
