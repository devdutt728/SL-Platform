from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import urlparse

from fastapi import HTTPException, UploadFile, status

MAX_FILENAME_LENGTH = 150
OCTET_STREAM_MIME_TYPES = {"application/octet-stream", "binary/octet-stream"}

DOC_EXTENSIONS = {
    ".csv",
    ".doc",
    ".docx",
    ".jpeg",
    ".jpg",
    ".pdf",
    ".png",
    ".ppt",
    ".pptx",
    ".rtf",
    ".txt",
    ".xls",
    ".xlsx",
}
DOC_MIME_TYPES = {
    "application/x-pdf",
    "application/msword",
    "application/pdf",
    "application/rtf",
    "application/vnd.ms-excel",
    "application/vnd.ms-powerpoint",
    "application/vnd.ms-word",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/jpg",
    "image/jpeg",
    "image/pjpeg",
    "image/png",
    "text/csv",
    "text/rtf",
    "text/plain",
}

SPRINT_EXTENSIONS = DOC_EXTENSIONS | {".7z", ".rar", ".zip"}
SPRINT_MIME_TYPES = DOC_MIME_TYPES | {
    "application/x-7z-compressed",
    "application/x-rar",
    "application/x-rar-compressed",
    "application/rar",
    "application/vnd.comicbook-rar",
    "application/vnd.rar",
    "application/zip",
}

_SAFE_NAME_RE = re.compile(r"[^A-Za-z0-9._-]+")


def sanitize_filename(raw: str | None, *, default: str = "file") -> str:
    name = (raw or "").strip() or default
    name = name.replace("/", "_").replace("\\", "_")
    name = _SAFE_NAME_RE.sub("_", name).strip("._") or default

    if len(name) > MAX_FILENAME_LENGTH:
        base, ext = _split_name_ext(name)
        keep = max(1, MAX_FILENAME_LENGTH - len(ext))
        name = f"{base[:keep]}{ext}"
    return name


def validate_upload(
    upload: UploadFile,
    *,
    allowed_extensions: set[str],
    allowed_mime_types: set[str],
    allow_unknown_content_type: bool = False,
) -> str:
    filename = sanitize_filename(upload.filename)
    ext = Path(filename).suffix.lower()
    if ext and ext not in allowed_extensions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file type.",
        )

    content_type = (upload.content_type or "").strip().lower()
    if ";" in content_type:
        content_type = content_type.split(";", 1)[0].strip()
    if content_type and content_type not in allowed_mime_types and content_type not in OCTET_STREAM_MIME_TYPES:
        if allow_unknown_content_type:
            return filename
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file content type.",
        )
    return filename


def normalize_submission_url(raw: str | None) -> str | None:
    cleaned = (raw or "").strip() or None
    if cleaned is None:
        return None
    if len(cleaned) > 2048:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Submission URL is too long.",
        )
    if "://" not in cleaned and " " not in cleaned and "." in cleaned and not cleaned.startswith("/"):
        cleaned = f"https://{cleaned}"
    parsed = urlparse(cleaned)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Submission URL must start with http or https.",
        )
    return cleaned


def _split_name_ext(name: str) -> tuple[str, str]:
    ext = Path(name).suffix
    if ext:
        return name[: -len(ext)], ext
    return name, ""
