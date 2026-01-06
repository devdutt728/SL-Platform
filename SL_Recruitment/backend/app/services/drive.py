from __future__ import annotations

from typing import Literal

import os
import io

import google.auth
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload, MediaIoBaseUpload

from app.core.config import settings
from app.core.paths import resolve_repo_path

DriveBucket = Literal["Ongoing", "Appointed", "Not Appointed"]


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


def _find_folder_id(service, *, name: str, parent_id: str) -> str | None:
    escaped = name.replace("'", "\\'")
    query = (
        "mimeType='application/vnd.google-apps.folder' "
        f"and name='{escaped}' "
        f"and '{parent_id}' in parents "
        "and trashed=false"
    )
    resp = (
        service.files()
        .list(
            q=query,
            fields="files(id,name)",
            pageSize=1,
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
            corpora="allDrives",
        )
        .execute()
    )
    files = resp.get("files", [])
    if not files:
        return None
    return files[0]["id"]


def _ensure_folder(service, *, name: str, parent_id: str) -> str:
    existing = _find_folder_id(service, name=name, parent_id=parent_id)
    if existing:
        return existing
    file_metadata = {
        "name": name,
        "mimeType": "application/vnd.google-apps.folder",
        "parents": [parent_id],
    }
    created = service.files().create(body=file_metadata, fields="id", supportsAllDrives=True).execute()
    return created["id"]


def _bucket_folder_id(service, bucket: DriveBucket) -> str:
    root_id = settings.drive_root_folder_id or os.environ.get("ROOT_FOLDER_ID", "")
    if not root_id:
        raise ValueError("Missing ROOT_FOLDER_ID (or SL_DRIVE_ROOT_FOLDER_ID)")

    if bucket == "Ongoing":
        ongoing_id = settings.drive_ongoing_folder_id or os.environ.get("ONGOING_FOLDER_ID", "")
        if ongoing_id:
            return ongoing_id
        return _ensure_folder(service, name="Ongoing", parent_id=root_id)
    if bucket == "Appointed":
        appointed_id = settings.drive_appointed_folder_id or os.environ.get("APPOINTED_FOLDER_ID", "")
        if appointed_id:
            return appointed_id
        return _ensure_folder(service, name="Appointed", parent_id=root_id)
    if bucket == "Not Appointed":
        not_appointed_id = settings.drive_not_appointed_folder_id or os.environ.get("NOT_APPOINTED_FOLDER_ID", "")
        if not_appointed_id:
            return not_appointed_id
        return _ensure_folder(service, name="Not Appointed", parent_id=root_id)
    raise ValueError(f"Unknown bucket: {bucket}")


def create_candidate_folder(candidate_code: str, full_name: str) -> tuple[str, str]:
    """
    Creates /SL_Recruitment/Ongoing/{candidate_code} - {full_name} with subfolders:
    - Application
    - Joining
    """
    service = _drive_client()
    ongoing_id = _bucket_folder_id(service, "Ongoing")

    safe_name = (full_name or "Candidate").replace("/", "_").replace("\\", "_").strip()
    candidate_folder_name = f"{candidate_code} - {safe_name}"
    candidate_folder_id = _ensure_folder(service, name=candidate_folder_name, parent_id=ongoing_id)

    _ensure_folder(service, name="Application", parent_id=candidate_folder_id)
    _ensure_folder(service, name="Joining", parent_id=candidate_folder_id)

    return candidate_folder_id, _folder_url(candidate_folder_id)


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


def delete_drive_item(item_id: str) -> None:
    """
    Deletes a Drive file/folder by id. Best-effort; suppresses 404s.
    """
    service = _drive_client()
    try:
        service.files().delete(fileId=item_id).execute()
    except Exception:
        # Ignore failures (missing permission, already deleted, etc.)
        return


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
        resp = (
            service.files()
            .list(q=query, fields="files(id), nextPageToken", pageSize=100, pageToken=page_token)
            .execute()
        )
        files = resp.get("files", [])
        for f in files:
            try:
                service.files().delete(fileId=f["id"]).execute()
                deleted += 1
            except Exception:
                # best-effort; continue
                continue
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
    sprint_assets_id = settings.drive_sprint_assets_folder_id or os.environ.get("SPRINT_ASSETS_FOLDER_ID", "")
    if sprint_assets_id:
        return sprint_assets_id
    root_id = settings.drive_root_folder_id or os.environ.get("ROOT_FOLDER_ID", "")
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
