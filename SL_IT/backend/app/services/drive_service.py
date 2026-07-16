from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from pathlib import Path

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload

from app.core.config import settings

DRIVE_SCOPE = "https://www.googleapis.com/auth/drive"


@dataclass(frozen=True)
class DriveUploadResult:
    drive_file_id: str | None
    web_view_link: str | None
    folder_id: str | None


def _drive_client():
    if not settings.drive_root_folder_id:
        raise RuntimeError("SL_DRIVE_ROOT_FOLDER_ID is not configured")
    credentials_path = Path(settings.google_application_credentials)
    if not credentials_path.is_absolute():
        credentials_path = Path.cwd() / credentials_path
    if not credentials_path.exists():
        raise RuntimeError(f"Google service account file not found: {credentials_path}")
    credentials = service_account.Credentials.from_service_account_file(
        str(credentials_path),
        scopes=[DRIVE_SCOPE],
    )
    return build("drive", "v3", credentials=credentials, cache_discovery=False)


def _find_child_folder(service, parent_id: str, name: str) -> str | None:
    escaped = name.replace("'", "\\'")
    query = (
        "mimeType = 'application/vnd.google-apps.folder' "
        f"and name = '{escaped}' and '{parent_id}' in parents and trashed = false"
    )
    result = service.files().list(q=query, fields="files(id,name)", supportsAllDrives=True, includeItemsFromAllDrives=True).execute()
    files = result.get("files", [])
    return files[0]["id"] if files else None


def ensure_folder_path(parts: list[str]) -> str:
    service = _drive_client()
    parent_id = settings.drive_root_folder_id
    for raw_part in parts:
        part = raw_part.strip()
        if not part:
            continue
        existing = _find_child_folder(service, parent_id, part)
        if existing:
            parent_id = existing
            continue
        body = {
            "name": part,
            "mimeType": "application/vnd.google-apps.folder",
            "parents": [parent_id],
        }
        created = service.files().create(body=body, fields="id", supportsAllDrives=True).execute()
        parent_id = created["id"]
    return parent_id


def upload_file(parts: list[str], filename: str, content_type: str | None, data: bytes) -> DriveUploadResult:
    service = _drive_client()
    folder_id = ensure_folder_path(parts)
    media = MediaIoBaseUpload(BytesIO(data), mimetype=content_type or "application/octet-stream", resumable=False)
    body = {"name": filename, "parents": [folder_id]}
    uploaded = (
        service.files()
        .create(body=body, media_body=media, fields="id,webViewLink", supportsAllDrives=True)
        .execute()
    )
    return DriveUploadResult(
        drive_file_id=uploaded.get("id"),
        web_view_link=uploaded.get("webViewLink"),
        folder_id=folder_id,
    )
