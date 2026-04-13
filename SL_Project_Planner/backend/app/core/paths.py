from __future__ import annotations

from pathlib import Path


def repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def resolve_repo_path(path_value: str) -> Path:
    path = Path(path_value)
    if path.is_absolute() and path.exists():
        return path
    if path.exists():
        return path.resolve()
    candidate = repo_root() / path_value
    if candidate.exists():
        return candidate.resolve()
    return path.resolve()
