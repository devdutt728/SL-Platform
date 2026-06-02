"""Apply SL_People SQL migrations in order against the configured MySQL server.

Usage (from SL_People/backend):
    python -m migrations.run_migrations

Reads SPL_DATABASE_URL from the env files. The numbered *.sql files are applied
in filename order. Each file may contain multiple statements separated by ';'
and its own `USE sl_people;` / `CREATE DATABASE` headers, so we connect at the
server level (no default database) and let the scripts select it.

This is a deliberately small forward-only runner (the repo has no Alembic). It is
idempotent: every DDL statement uses IF NOT EXISTS, so re-running is safe. It does
NOT run the Python seed scripts (0022/0023) — invoke those separately once the
source spreadsheets are in place.
"""

from __future__ import annotations

import asyncio
import re
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import settings

MIGRATIONS_DIR = Path(__file__).resolve().parent


def _server_url(database_url: str) -> str:
    """Strip the trailing /<db> so CREATE DATABASE / USE work from a server connection."""
    return re.sub(r"/[^/?]+(\?.*)?$", lambda m: (m.group(1) or ""), database_url)


def _split_statements(sql: str) -> list[str]:
    statements: list[str] = []
    for chunk in sql.split(";"):
        stripped = "\n".join(
            line for line in chunk.splitlines() if not line.strip().startswith("--")
        ).strip()
        if stripped:
            statements.append(stripped)
    return statements


async def run() -> None:
    engine = create_async_engine(_server_url(settings.database_url), echo=False)
    files = sorted(MIGRATIONS_DIR.glob("0*.sql"))
    try:
        async with engine.begin() as conn:
            for path in files:
                print(f"→ applying {path.name}")
                for stmt in _split_statements(path.read_text(encoding="utf-8")):
                    await conn.exec_driver_sql(stmt)
        print(f"✓ applied {len(files)} migration file(s)")
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(run())
