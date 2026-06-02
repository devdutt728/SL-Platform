"""Seed org + license + systems tables from `Org Data.xlsx`.

Phase 0 status: STRUCTURE ONLY.

Documents the seed order from SL_PEOPLE_PLAN.md §6 "0023" and wires the ported
Code.gs logic. Full sheet ingestion lands in Phase 3/4/5 against the confirmed
workbook layout; this stub fixes the contract and seeds the one thing that is
fully known today — the 4 fixed principals.

Seed order (plan §6):
  1. org_principal     <- ORG_PRINCIPALS (4 rows, from Code.gs ORG_CONFIG)
  2. org_group         <- Groups sheet
  3. org_employee      <- Master_Employees; compute designation_level/color/order
                          via level_for(); compute sl/o exp via compute_experience()
  4. license_assignment<- Licenses sheet (short_name via short_name_for())
  5. license_contract  <- License_Inventory sheet (+ renewal status)
  6. system_inventory  <- Systems sheet; run grade_pc() for composite_score + tier
  7. peripheral_inventory <- Peripherals sheet
  8. org_change_log    <- first row, action='initial_import', snapshot_after=full org

Usage (once implemented + Org Data.xlsx is in place):
    python -m migrations.0023_seed_org_data --file "../../Org Data (1).xlsx"
"""

from __future__ import annotations

import asyncio

from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.people import OrgPrincipal
from app.services.console_logic import ORG_PRINCIPALS

# Other helpers the full implementation uses:
# from app.services.console_logic import level_for, compute_experience, grade_pc, short_name_for
# from app.models.people import OrgGroup, OrgEmployee, LicenseAssignment, ...


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


async def main() -> None:
    count = await seed_principals()
    print(f"✓ org_principal: seeded {count} new principal(s)")
    print(
        "ℹ groups / employees / licenses / systems / peripherals ingestion is "
        "implemented in the org & inventory phases."
    )


if __name__ == "__main__":
    asyncio.run(main())
