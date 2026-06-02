"""Fernet AES-256 encryption for PII at rest (PAN/Aadhaar/PF/UAN).

The key comes from SPL_ENCRYPTION_KEY (generated once with Fernet.generate_key()).
Compliance data is never stored in plaintext; only ciphertext lands in the
employee_compliance.*_enc columns.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings


class EncryptionUnavailable(RuntimeError):
    """Raised when an encrypt/decrypt is attempted without a configured key."""


@lru_cache(maxsize=1)
def _fernet() -> Optional[Fernet]:
    key = (settings.encryption_key or "").strip()
    if not key:
        return None
    return Fernet(key.encode("utf-8"))


def is_configured() -> bool:
    return _fernet() is not None


def encrypt(plaintext: Optional[str]) -> Optional[str]:
    """Encrypt a value. None / empty pass through as None (nothing to store)."""
    if plaintext is None or str(plaintext).strip() == "":
        return None
    f = _fernet()
    if f is None:
        raise EncryptionUnavailable("SPL_ENCRYPTION_KEY is not configured")
    return f.encrypt(str(plaintext).encode("utf-8")).decode("utf-8")


def decrypt(ciphertext: Optional[str]) -> Optional[str]:
    """Decrypt a stored value. Returns None for empty input; raises on bad token."""
    if ciphertext is None or str(ciphertext).strip() == "":
        return None
    f = _fernet()
    if f is None:
        raise EncryptionUnavailable("SPL_ENCRYPTION_KEY is not configured")
    try:
        return f.decrypt(str(ciphertext).encode("utf-8")).decode("utf-8")
    except InvalidToken as exc:
        raise EncryptionUnavailable("Ciphertext could not be decrypted (key mismatch)") from exc
