import os

from app.core.config import settings


def build_public_path(path: str) -> str:
    base_path = (settings.public_app_base_path or os.getenv("PUBLIC_APP_BASE_PATH") or "").strip()
    if base_path and not base_path.startswith("/"):
        base_path = f"/{base_path}"
    base_path = base_path.rstrip("/")
    if path and not path.startswith("/"):
        path = f"/{path}"
    full_path = f"{base_path}{path}" if base_path else path
    return full_path


def build_public_link(path: str) -> str:
    base = (settings.public_app_origin or os.getenv("PUBLIC_APP_ORIGIN") or os.getenv("SL_PUBLIC_APP_ORIGIN") or "").rstrip("/")
    full_path = build_public_path(path)
    return f"{base}{full_path}" if base else full_path
