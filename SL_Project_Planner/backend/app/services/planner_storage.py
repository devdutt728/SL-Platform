from __future__ import annotations

import hashlib
from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile

from app.core.config import settings
from app.core.paths import repo_root


def storage_root_path() -> Path:
    root = Path(settings.storage_root)
    if root.is_absolute():
        return root
    return (repo_root() / root).resolve()


async def store_document_file(project_code: str, planner_row_id: int | None, upload: UploadFile) -> dict[str, str | int | None]:
    ext = Path(upload.filename or "").suffix
    stored_filename = f"{uuid4().hex}{ext}"
    target_dir = storage_root_path() / "planner_documents" / project_code / (str(planner_row_id) if planner_row_id is not None else "unlinked")
    target_dir.mkdir(parents=True, exist_ok=True)
    target_file = target_dir / stored_filename

    hasher = hashlib.sha256()
    size = 0

    with target_file.open("wb") as handle:
        while True:
            chunk = await upload.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            hasher.update(chunk)
            handle.write(chunk)

    return {
        "stored_filename": stored_filename,
        "storage_path": str(target_file),
        "file_size_bytes": size,
        "checksum_sha256": hasher.hexdigest(),
    }
