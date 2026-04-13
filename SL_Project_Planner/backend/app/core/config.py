import os
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.paths import resolve_repo_path


def _env_files() -> list[str]:
    base = resolve_repo_path("backend/.env")
    env = os.getenv("SPP_ENVIRONMENT", "").strip().lower()
    files = [str(base)]
    if env and env != "development":
        files.append(str(resolve_repo_path(f"backend/.env.{env}")))
    else:
        files.append(str(resolve_repo_path("backend/.env.local")))
    return files


class Settings(BaseSettings):
    app_name: str = "SL Project Planner"
    environment: str = "development"

    database_url: str
    platform_database_url: str
    secret_key: str = "change-me"

    auth_mode: Literal["dev", "google"] = "dev"
    session_idle_minutes: int = 15
    session_table: str = "slp_planner_session"

    google_client_id: str = ""
    google_workspace_domain: str = ""
    google_oauth_secrets_path: str = "secrets/Oauth SL_Platform.json"
    google_clock_skew_seconds: int = 180
    storage_root: str = "storage"

    model_config = SettingsConfigDict(env_prefix="SPP_", env_file=_env_files(), extra="ignore")


settings = Settings()
