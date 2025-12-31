from __future__ import annotations

from pathlib import Path


def repo_root() -> Path:
    # backend/app/core/paths.py -> core -> app -> backend -> repo
    return Path(__file__).resolve().parents[3]


def resolve_repo_path(path_value: str) -> Path:
    """
    Resolves a path that may be relative to the repo root.
    - If absolute and exists: returns as-is.
    - Else tries CWD-relative.
    - Else tries repo-root-relative.
    """
    p = Path(path_value)
    if p.is_absolute() and p.exists():
        return p
    if p.exists():
        return p.resolve()

    rr = repo_root() / path_value
    if rr.exists():
        return rr.resolve()

    return p.resolve()

