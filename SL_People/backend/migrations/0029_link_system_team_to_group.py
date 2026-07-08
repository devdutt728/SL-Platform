"""Backfill system_inventory.group_key from the canonical org_group hierarchy.

system_inventory.team has always been a free-text string (see migration 0028).
This resolves each system's canonical team two ways, in priority order:

  1. Person-based (authoritative): assigned_email -> platform DimPerson.person_code
     -> people-db OrgEmployee.group_key. This is how migration 0026 already derives
     `team` text for newly-imported systems, so it is the most trustworthy signal.
  2. Name-based (fallback): exact, case-insensitive match of the existing free-text
     `team` value against org_group.name — for shared/stock/room PCs with no
     resolvable individual assignee.

Systems that match neither are left untouched and listed in the report so they can
be corrected by hand (typo'd team name, orphaned assignee, etc).

Usage (dry run, default — no writes):
    python -m migrations.0029_link_system_team_to_group

Usage (apply):
    python -m migrations.0029_link_system_team_to_group --apply

Usage (write an unmatched-rows report):
    python -m migrations.0029_link_system_team_to_group --report unmatched.csv
"""

from __future__ import annotations

import argparse
import asyncio
import csv
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from sqlalchemy import select

from app.db.platform_session import PlatformSessionLocal, platform_engine
from app.db.session import SessionLocal, engine
from app.models.people import OrgEmployee, OrgGroup, SystemInventory
from app.models.platform_person import DimPerson


def _norm(value: Optional[str]) -> str:
    return str(value or "").strip().lower()


@dataclass
class BackfillStats:
    systems_seen: int = 0
    matched_by_person: int = 0
    matched_by_team_name: int = 0
    already_linked: int = 0
    unmatched: int = 0
    unmatched_rows: list[dict[str, str]] = field(default_factory=list)


async def _run_backfill(*, apply: bool, report: Optional[Path]) -> BackfillStats:
    stats = BackfillStats()

    async with SessionLocal() as session, PlatformSessionLocal() as platform_session:
        systems = (await session.execute(select(SystemInventory))).scalars().all()
        stats.systems_seen = len(systems)

        org_rows = (await session.execute(select(OrgEmployee))).scalars().all()
        org_by_emp = {row.employee_no: row for row in org_rows if row.employee_no}

        groups = (await session.execute(select(OrgGroup))).scalars().all()
        group_by_name = {_norm(g.name): g.group_key for g in groups}

        emails = [_norm(s.assigned_email) for s in systems if s.assigned_email]
        identities: dict[str, DimPerson] = {}
        if emails:
            people = (
                await platform_session.execute(
                    select(DimPerson).where(DimPerson.email.in_(emails))
                )
            ).scalars().all()
            identities = {_norm(p.email): p for p in people if p.email}

        for system in systems:
            if system.group_key:
                stats.already_linked += 1
                continue

            resolved_key: Optional[str] = None

            email = _norm(system.assigned_email)
            person = identities.get(email) if email else None
            org = org_by_emp.get(str(person.person_code)) if person and person.person_code else None
            if org and org.group_key:
                resolved_key = org.group_key
                stats.matched_by_person += 1

            if not resolved_key and system.team:
                resolved_key = group_by_name.get(_norm(system.team))
                if resolved_key:
                    stats.matched_by_team_name += 1

            if resolved_key:
                system.group_key = resolved_key
            else:
                stats.unmatched += 1
                stats.unmatched_rows.append(
                    {
                        "system_id": system.system_id,
                        "assigned_email": system.assigned_email or "",
                        "team": system.team or "",
                    }
                )

        if report:
            report.parent.mkdir(parents=True, exist_ok=True)
            with report.open("w", newline="", encoding="utf-8") as fh:
                fieldnames = ["system_id", "assigned_email", "team"]
                writer = csv.DictWriter(fh, fieldnames=fieldnames)
                writer.writeheader()
                writer.writerows(stats.unmatched_rows)

        if apply:
            await session.commit()
        else:
            await session.rollback()

    return stats


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Write changes. Omit for a dry run.")
    parser.add_argument("--report", default="", help="Optional CSV path for unmatched rows.")
    args = parser.parse_args()

    report = Path(args.report).resolve() if args.report else None
    stats = await _run_backfill(apply=args.apply, report=report)
    mode = "APPLIED" if args.apply else "DRY RUN"
    print(f"{mode} system_inventory.group_key backfill")
    print(f"  systems seen: {stats.systems_seen}")
    print(f"  already linked: {stats.already_linked}")
    print(f"  matched via assignee's org group: {stats.matched_by_person}")
    print(f"  matched via exact team-name: {stats.matched_by_team_name}")
    print(f"  unmatched: {stats.unmatched}")
    if report:
        print(f"  unmatched report: {report}")


if __name__ == "__main__":
    async def _run() -> None:
        try:
            await main()
        finally:
            await engine.dispose()
            await platform_engine.dispose()

    asyncio.run(_run())
