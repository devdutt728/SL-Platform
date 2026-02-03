import os
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.paths import resolve_repo_path


def _env_files() -> list[str]:
    base = resolve_repo_path("backend/.env")
    env = os.getenv("SL_ENVIRONMENT", "").strip().lower()
    files = [str(base)]
    if env and env != "development":
        files.append(str(resolve_repo_path(f"backend/.env.{env}")))
    else:
        files.append(str(resolve_repo_path("backend/.env.local")))
    return files


class Settings(BaseSettings):
    app_name: str = "SL Recruitment"
    environment: str = "development"

    database_url: str
    platform_database_url: str
    secret_key: str = "change-me"

    auth_mode: Literal["dev", "google"] = "dev"
    auth_rate_limit_per_min: int = 60
    auth_rate_limit_window_seconds: int = 60
    internal_api_key: str = ""
    internal_api_allow_localhost: bool = True

    google_client_id: str = ""
    google_client_secret: str = ""
    google_workspace_domain: str = ""
    google_application_credentials: str = "secrets/google-service-account.json"
    google_oauth_secrets_path: str = "secrets/Oauth SL_Platform.json"
    google_clock_skew_seconds: int = 180

    drive_root_folder_id: str = ""
    drive_ongoing_folder_id: str = ""
    drive_appointed_folder_id: str = ""
    drive_not_appointed_folder_id: str = ""
    drive_sprint_assets_folder_id: str = ""
    enable_gmail: bool = False
    enable_calendar: bool = False
    gmail_sender_email: str = "hr@studiolotus.in"
    gmail_sender_name: str = "SL Recruitment"
    calendar_id: str = "primary"
    calendar_timezone: str = "Asia/Kolkata"
    public_app_origin: str = ""
    public_app_base_path: str = "/recruitment"
    public_link_ttl_hours: int = 168
    public_link_signing_key: str = ""
    public_link_skip_signature: bool = False
    caf_reminder_days: int = 3
    feedback_reminder_hours: int = 24
    feedback_escalation_hours: int = 48
    sprint_reminder_hours: int = 24
    sprint_overdue_days: int = 2
    offer_followup_days: int = 5
    stale_stage_days: int = 5

    model_config = SettingsConfigDict(env_prefix="SL_", env_file=_env_files(), extra="ignore")


settings = Settings()
