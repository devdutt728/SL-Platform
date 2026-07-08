import base64
import hashlib
import hmac
import os
from datetime import datetime, timedelta, timezone

from app.core.config import settings


def _public_token_signature(namespace: str, token: str, expires_at: int) -> str:
    signing_key = (settings.public_link_signing_key or settings.secret_key).strip()
    payload = f"{namespace}:{token}:{int(expires_at)}"
    digest = hmac.new(signing_key.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")


def sign_public_token(namespace: str, token: str, *, ttl_hours: int | None = None) -> tuple[int, str]:
    """Return (expires_at, sig) for a namespaced public token, e.g. sprint/CAF links."""
    hours = ttl_hours if ttl_hours is not None else settings.public_link_ttl_hours
    expires_at = int((datetime.now(timezone.utc) + timedelta(hours=hours)).timestamp())
    return expires_at, _public_token_signature(namespace, token, expires_at)


def verify_public_token(namespace: str, token: str, exp: str | None, sig: str | None) -> bool:
    if not exp or not sig:
        return False
    try:
        exp_int = int(exp)
    except ValueError:
        return False
    if datetime.now(timezone.utc).timestamp() > exp_int:
        return False
    expected = _public_token_signature(namespace, token, exp_int)
    return hmac.compare_digest(expected, sig)


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
