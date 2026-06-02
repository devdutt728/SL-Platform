from __future__ import annotations

import os
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.paths import resolve_repo_path


def _env_files() -> list[str]:
    base = resolve_repo_path("backend/.env")
    env = os.getenv("SPL_ENVIRONMENT", "").strip().lower()
    files = [str(base)]
    if env and env != "development":
        files.append(str(resolve_repo_path(f"backend/.env.{env}")))
    else:
        files.append(str(resolve_repo_path("backend/.env.local")))
    return files


class Settings(BaseSettings):
    app_name: str = "SL People"
    environment: str = "development"
    people_module_enabled: bool = True

    # sl_people database (this module's own tables)
    database_url: str
    # shared sl_platform database (dim_person, read-only identity anchor)
    platform_database_url: str
    secret_key: str = "change-me"

    auth_mode: Literal["dev", "google"] = "dev"
    session_idle_minutes: int = 15
    session_table: str = "slp_people_session"

    google_client_id: str = ""
    google_workspace_domain: str = ""
    google_oauth_secrets_path: str = "secrets/Oauth SL_Platform.json"
    google_clock_skew_seconds: int = 180

    # Fernet AES-256 key for PAN/Aadhaar/PF/UAN encryption at rest.
    encryption_key: str = ""

    # Google Sheets live-sync ingest (deferred — wired in a later phase).
    sheet_ingest_token: str = ""
    sheet_ingest_max_rows: int = 0

    model_config = SettingsConfigDict(env_prefix="SPL_", env_file=_env_files(), extra="ignore")


settings = Settings()
