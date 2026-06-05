"""Seed org + license + systems tables from `Org Data.xlsx`.

Usage:
    python -m migrations.0023_seed_org_data --file "../../Org Data (1).xlsx"
"""

from __future__ import annotations

import argparse
import asyncio
from pathlib import Path

from sqlalchemy import select

from app.db.platform_session import PlatformSessionLocal, platform_engine
from app.db.session import SessionLocal, engine
from app.models.people import OrgPrincipal
from app.services.workbook_import import import_org_workbook
from app.services.console_logic import ORG_PRINCIPALS

async def seed_principals() -> int:
    """Idempotently seed the 4 fixed principals. Safe to run on its own today."""
    inserted = 0
    async with SessionLocal() as session:
        for order, p in enumerate(ORG_PRINCIPALS, start=1):
            exists = (
                await session.execute(
                    select(OrgPrincipal.id).where(OrgPrincipal.name == p["name"])
                )
            ).first()
            if exists:
                continue
            session.add(OrgPrincipal(name=p["name"], color=p["color"], sort_order=order))
            inserted += 1
        await session.commit()
    return inserted


def _default_workbook() -> Path:
    return Path(__file__).resolve().parents[2].parent / "Org Data (1).xlsx"


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", default=str(_default_workbook()))
    args = parser.parse_args()
    workbook = Path(args.file).resolve()
    if not workbook.exists():
        raise FileNotFoundError(f"Workbook not found: {workbook}")

    async with SessionLocal() as session, PlatformSessionLocal() as platform_session:
        result = await import_org_workbook(session, platform_session, workbook, performed_by="migration:0023")

    print(f"OK org workbook imported from {workbook}")
    print(f"  employees: {result.employees}")
    print(f"  groups: {result.groups}")
    print(f"  org employees: {result.org_employees}")
    print(f"  license assignments: {result.license_assignments}")
    print(f"  license contracts: {result.license_contracts}")
    print(f"  systems: {result.systems}")
    print(f"  peripherals: {result.peripherals}")
    if result.warnings:
        print("  warnings:")
        for warning in result.warnings[:20]:
            print(f"    - {warning}")


if __name__ == "__main__":
    async def _run() -> None:
        try:
            await main()
        finally:
            await engine.dispose()
            await platform_engine.dispose()

    asyncio.run(_run())
