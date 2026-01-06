from __future__ import annotations

from typing import Literal
from functools import lru_cache

import os
import io
import json
import logging

import google.auth
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaIoBaseDownload, MediaIoBaseUpload

from app.core.config import settings
from app.core.paths import resolve_repo_path

DriveBucket = Literal["Ongoing", "Appointed", "Not Appointed"]
logger = logging.getLogger("slr.drive")


@lru_cache(maxsize=1)
def _drive_config() -> dict:
    path = resolve_repo_path("config/drive.json")
    try:
        if not path.exists():
            return {}
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _drive_config_value(key: str) -> str:
    value = _drive_config().get(key)
    if value is None:
        return ""
    return str(value).strip()


def _format_drive_error(exc: Exception) -> str:
    if not isinstance(exc, HttpError):
        return repr(exc)
    status = getattr(exc.resp, "status", None)
    reason = ""
    message = ""
    try:
        payload = json.loads(exc.content.decode("utf-8")) if exc.content else {}
        error = payload.get("error", {})
        message = error.get("message", "") or ""
        errors = error.get("errors", [])
        if errors:
            reason = errors[0].get("reason", "") or ""
    except Exception:
        pass
    return f"status={status} reason={reason} message={message}".strip()


def _shared_drive_id() -> str | None:
    root_id = (
        settings.drive_root_folder_id
        or os.environ.get("ROOT_FOLDER_ID", "")
        or _drive_config_value("root_folder_id")
    )
    if root_id.startswith("0A"):
        return root_id
    return None


def _drive_client():
    scopes = ["https://www.googleapis.com/auth/drive"]

    service_account_path = settings.google_application_credentials or os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if service_account_path:
        credentials = Credentials.from_service_account_file(str(resolve_repo_path(service_account_path)), scopes=scopes)
    else:
        credentials, _ = google.auth.default(scopes=scopes)

    return build("drive", "v3", credentials=credentials, cache_discovery=False)


def _folder_url(folder_id: str) -> str:
    return f"https://drive.google.com/drive/folders/{folder_id}"


def _file_url(file_id: str) -> str:
    return f"https://drive.google.com/file/d/{file_id}/view"


def _find_folder_id(service, *, name: str, parent_id: str, drive_id: str | None = None) -> str | None:
    escaped = name.replace("'", "\\'")
    query = (
        "mimeType='application/vnd.google-apps.folder' "
        f"and name='{escaped}' "
        f"and '{parent_id}' in parents "
        "and trashed=false"
    )
    drive_id = drive_id or _shared_drive_id()
    list_kwargs = {
        "q": query,
        "fields": "files(id,name)",
        "pageSize": 1,
        "supportsAllDrives": True,
        "includeItemsFromAllDrives": True,
    }
    if drive_id:
        list_kwargs["driveId"] = drive_id
        list_kwargs["corpora"] = "drive"
    else:
        list_kwargs["corpora"] = "allDrives"
    resp = (
        service.files()
        .list(**list_kwargs)
        .execute()
    )
    files = resp.get("files", [])
    if not files:
        return None
    return files[0]["id"]


def _ensure_folder(service, *, name: str, parent_id: str, drive_id: str | None = None) -> str:
    existing = _find_folder_id(service, name=name, parent_id=parent_id, drive_id=drive_id)
    if existing:
        return existing
    file_metadata = {
        "name": name,
        "mimeType": "application/vnd.google-apps.folder",
        "parents": [parent_id],
    }
    try:
        created = service.files().create(body=file_metadata, fields="id", supportsAllDrives=True).execute()
    except Exception as exc:
        logger.exception(
            "Drive folder create failed: name=%s parent_id=%s drive_id=%s error=%s",
            name,
            parent_id,
            drive_id or _shared_drive_id(),
            _format_drive_error(exc),
        )
        raise
    return created["id"]


def _bucket_folder_id(service, bucket: DriveBucket) -> str:
    root_id = (
        settings.drive_root_folder_id
        or os.environ.get("ROOT_FOLDER_ID", "")
        or _drive_config_value("root_folder_id")
    )
    if not root_id:
        raise ValueError("Missing ROOT_FOLDER_ID (or SL_DRIVE_ROOT_FOLDER_ID)")

    # If the root_id already points at the bucket folder, avoid creating a nested folder.
    try:
        meta = service.files().get(
            fileId=root_id,
            fields="id,name,mimeType",
            supportsAllDrives=True,
        ).execute()
        if meta.get("mimeType") == "application/vnd.google-apps.folder":
            root_name = (meta.get("name") or "").strip()
            if root_name.lower() == bucket.lower():
                return root_id
    except Exception:
        # Best-effort; fall back to normal behavior.
        pass

    drive_id = _shared_drive_id()
    if bucket == "Ongoing":
        ongoing_id = (
            settings.drive_ongoing_folder_id
            or os.environ.get("ONGOING_FOLDER_ID", "")
            or _drive_config_value("ongoing_folder_id")
        )
        if ongoing_id:
            return ongoing_id
        existing = _find_folder_id(service, name="Ongoing", parent_id=root_id, drive_id=drive_id)
        if existing:
            return existing
        return _ensure_folder(service, name="Ongoing", parent_id=root_id, drive_id=drive_id)
    if bucket == "Appointed":
        appointed_id = (
            settings.drive_appointed_folder_id
            or os.environ.get("APPOINTED_FOLDER_ID", "")
            or _drive_config_value("appointed_folder_id")
        )
        if appointed_id:
            return appointed_id
        existing = _find_folder_id(service, name="Appointed", parent_id=root_id, drive_id=drive_id)
        if existing:
            return existing
        return _ensure_folder(service, name="Appointed", parent_id=root_id, drive_id=drive_id)
    if bucket == "Not Appointed":
        not_appointed_id = (
            settings.drive_not_appointed_folder_id
            or os.environ.get("NOT_APPOINTED_FOLDER_ID", "")
            or _drive_config_value("not_appointed_folder_id")
        )
        if not_appointed_id:
            return not_appointed_id
        existing = _find_folder_id(service, name="Not Appointed", parent_id=root_id, drive_id=drive_id)
        if existing:
            return existing
        return _ensure_folder(service, name="Not Appointed", parent_id=root_id, drive_id=drive_id)
    raise ValueError(f"Unknown bucket: {bucket}")


def create_candidate_folder(candidate_code: str, full_name: str) -> tuple[str, str]:
    """
    Creates /SL_Recruitment/Ongoing/{candidate_code} - {full_name} with subfolders:
    - Application
    - Joining
    """
    try:
        service = _drive_client()
        ongoing_id = _bucket_folder_id(service, "Ongoing")

        safe_name = (full_name or "Candidate").replace("/", "_").replace("\\", "_").strip()
        candidate_folder_name = f"{candidate_code} - {safe_name}"
        drive_id = _shared_drive_id()
        candidate_folder_id = _ensure_folder(service, name=candidate_folder_name, parent_id=ongoing_id, drive_id=drive_id)

        _ensure_folder(service, name="Application", parent_id=candidate_folder_id, drive_id=drive_id)
        _ensure_folder(service, name="Joining", parent_id=candidate_folder_id, drive_id=drive_id)

        return candidate_folder_id, _folder_url(candidate_folder_id)
    except Exception as exc:
        root_id = (
            settings.drive_root_folder_id
            or os.environ.get("ROOT_FOLDER_ID", "")
            or _drive_config_value("root_folder_id")
        )
        logger.exception(
            "Drive candidate folder flow failed: root_id=%s drive_id=%s candidate_code=%s full_name=%s error=%s",
            root_id,
            _shared_drive_id(),
            candidate_code,
            full_name,
            _format_drive_error(exc),
        )
        raise


def move_candidate_folder(folder_id: str, target_bucket: DriveBucket) -> None:
    service = _drive_client()
    target_parent_id = _bucket_folder_id(service, target_bucket)

    current = service.files().get(fileId=folder_id, fields="parents").execute()
    current_parents: list[str] = current.get("parents", [])

    bucket_ids = {
        _bucket_folder_id(service, "Ongoing"),
        _bucket_folder_id(service, "Appointed"),
        _bucket_folder_id(service, "Not Appointed"),
    }
    remove_parents = [parent for parent in current_parents if parent in bucket_ids]

    update_kwargs = {
        "fileId": folder_id,
        "addParents": target_parent_id,
        "fields": "id, parents",
    }
    if remove_parents:
        update_kwargs["removeParents"] = ",".join(remove_parents)
    service.files().update(**update_kwargs).execute()


def _delete_drive_item_with_service(service, item_id: str) -> bool:
    try:
        service.files().delete(fileId=item_id, supportsAllDrives=True).execute()
        return True
    except Exception as exc:
        logger.exception("Drive delete failed: item_id=%s error=%s", item_id, _format_drive_error(exc))
        return False


def delete_drive_item(item_id: str) -> bool:
    """
    Deletes a Drive file/folder by id. Best-effort; suppresses 404s.
    """
    service = _drive_client()
    return _delete_drive_item_with_service(service, item_id)


def delete_all_candidate_folders(bucket: DriveBucket = "Ongoing") -> int:
    """
    Deletes all folders directly under the given bucket (Ongoing/Appointed/Not Appointed).
    Returns the number of delete attempts made.
    """
    service = _drive_client()
    parent_id = _bucket_folder_id(service, bucket)
    deleted = 0
    page_token = None
    query = f"'{parent_id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false"
    while True:
        drive_id = _shared_drive_id()
        list_kwargs = {
            "q": query,
            "fields": "files(id), nextPageToken",
            "pageSize": 100,
            "pageToken": page_token,
            "supportsAllDrives": True,
            "includeItemsFromAllDrives": True,
        }
        if drive_id:
            list_kwargs["driveId"] = drive_id
            list_kwargs["corpora"] = "drive"
        else:
            list_kwargs["corpora"] = "allDrives"
        resp = service.files().list(**list_kwargs).execute()
        files = resp.get("files", [])
        for f in files:
            if _delete_drive_item_with_service(service, f["id"]):
                deleted += 1
        page_token = resp.get("nextPageToken")
        if not page_token:
            break
    return deleted


def delete_candidate_folder(
    *, candidate_code: str | None, folder_id: str | None = None, bucket: DriveBucket = "Ongoing"
) -> int:
    """
    Deletes the candidate folder and any matching folders under the bucket.
    Returns the number of delete attempts that succeeded.
    """
    deleted = 0
    service = _drive_client()
    if folder_id:
        if _delete_drive_item_with_service(service, folder_id):
            deleted += 1

    if not candidate_code:
        return deleted

    parent_id = _bucket_folder_id(service, bucket)
    escaped = candidate_code.replace("'", "\\'")
    query = (
        "mimeType='application/vnd.google-apps.folder' "
        f"and name contains '{escaped}' "
        f"and '{parent_id}' in parents "
        "and trashed=false"
    )
    drive_id = _shared_drive_id()
    page_token = None
    while True:
        list_kwargs = {
            "q": query,
            "fields": "files(id,name), nextPageToken",
            "pageSize": 100,
            "pageToken": page_token,
            "supportsAllDrives": True,
            "includeItemsFromAllDrives": True,
        }
        if drive_id:
            list_kwargs["driveId"] = drive_id
            list_kwargs["corpora"] = "drive"
        else:
            list_kwargs["corpora"] = "allDrives"
        resp = service.files().list(**list_kwargs).execute()
        for f in resp.get("files", []):
            if _delete_drive_item_with_service(service, f["id"]):
                deleted += 1
        page_token = resp.get("nextPageToken")
        if not page_token:
            break
    return deleted


def _ensure_child_folder(service, *, parent_id: str, name: str) -> str:
    return _ensure_folder(service, name=name, parent_id=parent_id)


def upload_application_doc(candidate_folder_id: str, *, filename: str, content_type: str, data: bytes) -> tuple[str, str]:
    """
    Uploads a file into the Application subfolder of the candidate folder.
    Returns (file_id, file_url).
    """
    service = _drive_client()
    application_id = _ensure_child_folder(service, parent_id=candidate_folder_id, name="Application")

    media = MediaIoBaseUpload(io.BytesIO(data), mimetype=content_type or "application/octet-stream", resumable=False)
    file_metadata = {"name": filename, "parents": [application_id]}
    created = (
        service.files()
        .create(body=file_metadata, media_body=media, fields="id", supportsAllDrives=True)
        .execute()
    )
    file_id = created["id"]
    return file_id, _file_url(file_id)


def upload_joining_doc(candidate_folder_id: str, *, filename: str, content_type: str, data: bytes) -> tuple[str, str]:
    service = _drive_client()
    joining_id = _ensure_child_folder(service, parent_id=candidate_folder_id, name="Joining")
    media = MediaIoBaseUpload(io.BytesIO(data), mimetype=content_type or "application/octet-stream", resumable=False)
    file_metadata = {"name": filename, "parents": [joining_id]}
    created = (
        service.files()
        .create(body=file_metadata, media_body=media, fields="id", supportsAllDrives=True)
        .execute()
    )
    file_id = created["id"]
    return file_id, _file_url(file_id)


def upload_sprint_doc(candidate_folder_id: str, *, filename: str, content_type: str, data: bytes) -> tuple[str, str]:
    service = _drive_client()
    sprint_id = _ensure_child_folder(service, parent_id=candidate_folder_id, name="Sprint")
    media = MediaIoBaseUpload(io.BytesIO(data), mimetype=content_type or "application/octet-stream", resumable=False)
    file_metadata = {"name": filename, "parents": [sprint_id]}
    created = (
        service.files()
        .create(body=file_metadata, media_body=media, fields="id", supportsAllDrives=True)
        .execute()
    )
    file_id = created["id"]
    return file_id, _file_url(file_id)


def _sprint_assets_root_id(service) -> str:
    sprint_assets_id = (
        settings.drive_sprint_assets_folder_id
        or os.environ.get("SPRINT_ASSETS_FOLDER_ID", "")
        or _drive_config_value("sprint_assets_folder_id")
    )
    if sprint_assets_id:
        return sprint_assets_id
    root_id = (
        settings.drive_root_folder_id
        or os.environ.get("ROOT_FOLDER_ID", "")
        or _drive_config_value("root_folder_id")
    )
    if not root_id:
        raise ValueError("Missing ROOT_FOLDER_ID (or SL_DRIVE_ROOT_FOLDER_ID)")
    return _ensure_folder(service, name="SprintAssets", parent_id=root_id)


def _sprint_assets_templates_id(service) -> str:
    return _ensure_folder(service, name="Templates", parent_id=_sprint_assets_root_id(service))


def _sprint_assets_candidates_id(service) -> str:
    return _ensure_folder(service, name="Candidates", parent_id=_sprint_assets_root_id(service))


def _sprint_template_folder_id(service, sprint_template_id: int) -> str:
    templates_id = _sprint_assets_templates_id(service)
    return _ensure_folder(service, name=str(sprint_template_id), parent_id=templates_id)


def _candidate_sprint_folder_id(service, candidate_id: int, candidate_sprint_id: int) -> str:
    candidates_id = _sprint_assets_candidates_id(service)
    candidate_folder_id = _ensure_folder(service, name=str(candidate_id), parent_id=candidates_id)
    return _ensure_folder(service, name=str(candidate_sprint_id), parent_id=candidate_folder_id)


def upload_sprint_template_attachment(
    sprint_template_id: int, *, filename: str, content_type: str, data: bytes
) -> tuple[str, str]:
    service = _drive_client()
    template_id = _sprint_template_folder_id(service, sprint_template_id)
    media = MediaIoBaseUpload(io.BytesIO(data), mimetype=content_type or "application/octet-stream", resumable=False)
    file_metadata = {"name": filename, "parents": [template_id]}
    created = (
        service.files()
        .create(body=file_metadata, media_body=media, fields="id", supportsAllDrives=True)
        .execute()
    )
    file_id = created["id"]
    return file_id, _file_url(file_id)


def copy_sprint_attachment_to_candidate(
    *, candidate_id: int, candidate_sprint_id: int, source_file_id: str, filename: str
) -> str:
    service = _drive_client()
    target_id = _candidate_sprint_folder_id(service, candidate_id, candidate_sprint_id)
    file_metadata = {"name": filename, "parents": [target_id]}
    created = (
        service.files()
        .copy(fileId=source_file_id, body=file_metadata, fields="id", supportsAllDrives=True)
        .execute()
    )
    return created["id"]


def download_drive_file(file_id: str) -> tuple[bytes, str, str]:
    service = _drive_client()
    meta = (
        service.files()
        .get(fileId=file_id, fields="id,name,mimeType,size", supportsAllDrives=True)
        .execute()
    )
    request = service.files().get_media(fileId=file_id, supportsAllDrives=True)
    buffer = io.BytesIO()
    downloader = MediaIoBaseDownload(buffer, request)
    done = False
    while not done:
        _, done = downloader.next_chunk()
    return buffer.getvalue(), meta.get("mimeType") or "application/octet-stream", meta.get("name") or "attachment"
