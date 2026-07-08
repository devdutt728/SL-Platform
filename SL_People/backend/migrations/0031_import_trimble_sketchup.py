"""Import SketchUp Pro contracts and members from Trimble exports.

The users CSV is expected to contain the Trimble Account member export columns:
First Name, Last Name, Email, Role, Last Sign-In (UTC), Status, License Assignments,
Available Applications.

Usage:
    python -m migrations.0031_import_trimble_sketchup --file "C:/Users/Dev/Downloads/users_data_export_....csv"
    python -m migrations.0031_import_trimble_sketchup --file "..." --apply
"""

from __future__ import annotations

import argparse
import asyncio
import csv
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import select

from app.db.session import SessionLocal, engine
from app.models.people import LicenseAssignment, LicenseContract
from app.services.console_logic import short_name_for


SKETCHUP_TOOL = "SketchUp Pro"

SKETCHUP_CONTRACTS = [
    (date(2026, 8, 21), 12),
    (date(2026, 9, 15), 3),
    (date(2026, 9, 26), 6),
    (date(2026, 10, 27), 5),
    (date(2026, 12, 17), 4),
    (date(2026, 12, 18), 1),
    (date(2027, 3, 25), 4),
    (date(2027, 6, 5), 19),
]


@dataclass
class SketchUpImportStats:
    users: int = 0
    skipped_users: int = 0
    deleted_assignments: int = 0
    created_assignments: int = 0
    deleted_contracts: int = 0
    created_contracts: int = 0
    active_contract_seats: int = 0
    expired_contract_seats: int = 0


def _text(value: Any) -> str:
    return str(value or "").strip()


def _email(value: Any) -> str:
    return _text(value).lower()


def _load_users(path: Path) -> tuple[list[dict[str, str]], int]:
    users_by_email: dict[str, dict[str, str]] = {}
    skipped = 0
    with path.open(newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            email = _email(row.get("Email"))
            status = _text(row.get("Status")).upper()
            if not email or status not in {"ACTIVE", "PENDING"}:
                skipped += 1
                continue
            users_by_email[email] = row
    return [users_by_email[email] for email in sorted(users_by_email)], skipped


def _contract_status(end_date: date) -> str:
    return "Expired" if end_date < date.today() else "Active"


async def import_trimble_sketchup(path: Path, *, apply: bool) -> SketchUpImportStats:
    users, skipped = _load_users(path)
    stats = SketchUpImportStats(users=len(users), skipped_users=skipped)
    now = datetime.utcnow()

    async with SessionLocal() as session:
        existing_assignments = (await session.execute(select(LicenseAssignment))).scalars().all()
        for row in existing_assignments:
            if SKETCHUP_TOOL in {short_name_for(row.tool_name), short_name_for(row.tool_short_name)}:
                await session.delete(row)
                stats.deleted_assignments += 1

        existing_contracts = (await session.execute(select(LicenseContract))).scalars().all()
        for row in existing_contracts:
            if SKETCHUP_TOOL in {short_name_for(row.software), short_name_for(row.short_name)}:
                await session.delete(row)
                stats.deleted_contracts += 1

        await session.flush()

        for row in users:
            name = " ".join(part for part in [_text(row.get("First Name")), _text(row.get("Last Name"))] if part)
            session.add(
                LicenseAssignment(
                    work_email=_email(row.get("Email")),
                    tool_name=SKETCHUP_TOOL,
                    tool_short_name=SKETCHUP_TOOL,
                    plan="Channel annual termed contract",
                    status="Assigned",
                    cost_centre="IT Support",
                    notes=f"Synced from {path.name}; Trimble status {_text(row.get('Status'))}; role {_text(row.get('Role'))}; name {name}",
                    updated_at=now,
                )
            )
            stats.created_assignments += 1

        for index, (end_date, seats) in enumerate(SKETCHUP_CONTRACTS, start=1):
            status = _contract_status(end_date)
            if status == "Expired":
                stats.expired_contract_seats += seats
            else:
                stats.active_contract_seats += seats
            session.add(
                LicenseContract(
                    contract_key=f"TRIMBLE-SKETCHUP-{end_date.strftime('%Y%m%d')}-{seats}-{index:02d}",
                    entity="TAC DESIGN PVT LTD",
                    software=SKETCHUP_TOOL,
                    short_name=SKETCHUP_TOOL,
                    category="Design Software",
                    contract_type="Channel annual termed contract",
                    seats=seats,
                    vendor="MICROGENESIS CADSOFT PVT. LTD.",
                    end_date=end_date,
                    status=status,
                    user_type="Single User",
                    notes=f"Synced from Trimble Plan Settings on {date.today().isoformat()}",
                    updated_at=now,
                )
            )
            stats.created_contracts += 1

        if apply:
            await session.commit()
        else:
            await session.rollback()

    return stats


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    path = Path(args.file).resolve()
    if not path.exists():
        raise FileNotFoundError(path)

    stats = await import_trimble_sketchup(path, apply=args.apply)
    print(("APPLIED" if args.apply else "DRY RUN") + f" SketchUp import from {path}")
    print(f"  users: {stats.users}")
    print(f"  skipped users: {stats.skipped_users}")
    print(f"  deleted old SketchUp assignments: {stats.deleted_assignments}")
    print(f"  created SketchUp assignments: {stats.created_assignments}")
    print(f"  deleted old SketchUp contracts: {stats.deleted_contracts}")
    print(f"  created SketchUp contracts: {stats.created_contracts}")
    print(f"  active contract seats: {stats.active_contract_seats}")
    print(f"  expired contract seats: {stats.expired_contract_seats}")


if __name__ == "__main__":
    async def _run() -> None:
        try:
            await main()
        finally:
            await engine.dispose()

    asyncio.run(_run())
