from __future__ import annotations

import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def _decode_key(key_b64: str) -> bytes:
    if not key_b64:
        raise ValueError("missing_encryption_key")
    try:
        return base64.urlsafe_b64decode(key_b64)
    except Exception as exc:
        raise ValueError("invalid_encryption_key") from exc


def encrypt_secret(plaintext: str, key_b64: str) -> tuple[bytes, bytes]:
    key = _decode_key(key_b64)
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    cipher = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
    return cipher, nonce


def decrypt_secret(cipher: bytes, nonce: bytes, key_b64: str) -> str:
    key = _decode_key(key_b64)
    aesgcm = AESGCM(key)
    plaintext = aesgcm.decrypt(nonce, cipher, None)
    return plaintext.decode("utf-8")
