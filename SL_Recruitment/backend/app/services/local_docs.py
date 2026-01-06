from __future__ import annotations

import json
from pathlib import Path

from app.core.paths import repo_root


def _root_dir() -> Path:
    return repo_root() / "local_uploads" / "recruitment"


def _application_dir(candidate_id: int) -> Path:
    return _root_dir() / "candidates" / str(candidate_id) / "application"


def _meta_path(candidate_id: int) -> Path:
    return _application_dir(candidate_id) / "meta.json"


def save_application_doc(
    candidate_id: int,
    *,
    kind: str,
    filename: str | None,
    content_type: str | None,
    data: bytes,
) -> Path:
    directory = _application_dir(candidate_id)
    directory.mkdir(parents=True, exist_ok=True)

    ext = ""
    if filename:
        try:
            ext = Path(filename).suffix
        except Exception:
            ext = ""
    if not ext or len(ext) > 10:
        ext = ".bin"

    target = directory / f"{kind}{ext}"
    target.write_bytes(data)

    meta: dict[str, dict[str, str]] = {}
    meta_path = _meta_path(candidate_id)
    if meta_path.exists():
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8")) or {}
        except Exception:
            meta = {}

    meta[kind] = {
        "stored_name": target.name,
        "filename": filename or target.name,
        "content_type": content_type or "application/octet-stream",
    }
    meta_path.write_text(json.dumps(meta, ensure_ascii=True), encoding="utf-8")

    return target


def find_application_doc(candidate_id: int, *, kind: str) -> tuple[Path, str, str] | None:
    """
    Returns (path, original_filename, content_type) if a local doc exists.
    """
    directory = _application_dir(candidate_id)
    if not directory.exists():
        return None

    meta_path = _meta_path(candidate_id)
    if meta_path.exists():
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8")) or {}
            entry = meta.get(kind)
            if entry:
                stored_name = entry.get("stored_name")
                if stored_name:
                    path = directory / stored_name
                    if path.exists():
                        return path, entry.get("filename") or path.name, entry.get("content_type") or "application/octet-stream"
        except Exception:
            pass

    # Fallback: find by prefix
    matches = sorted(directory.glob(f"{kind}.*"))
    if not matches:
        return None
    path = matches[0]
    return path, path.name, "application/octet-stream"

