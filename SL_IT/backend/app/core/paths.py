from __future__ import annotations

from pathlib import Path


def repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def resolve_repo_path(path_value: str) -> Path:
    p = Path(path_value)
    if p.is_absolute() and p.exists():
        return p
    if p.exists():
        return p.resolve()

    root = repo_root() / path_value
    if root.exists():
        return root.resolve()

    return p.resolve()
