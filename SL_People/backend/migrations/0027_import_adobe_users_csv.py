"""Import Adobe team product assignments from an Admin Console users CSV.

The CSV contains product strings like:
    Photoshop (VIPMP - DAC0069BD2C8D87D460A)

Only the product name is stored in license_assignment. Blank Team Products rows
are ignored and do not create licenses.

Usage:
    python -m migrations.0027_import_adobe_users_csv --file "C:/Users/Dev/Downloads/users.csv"
    python -m migrations.0027_import_adobe_users_csv --file "..." --apply
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import re
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

from sqlalchemy import select

from app.db.session import SessionLocal, engine
from app.models.people import LicenseAssignment
from app.services.console_logic import short_name_for


ADOBE_PRODUCTS = {
    "Adobe Photoshop",
    "Adobe Illustrator",
    "Adobe InDesign",
    "Adobe Acrobat",
}
ADOBE_GROUP_SHORT = "Adobe Products"

PRODUCT_TOKENS = [
    ("photoshop", "Adobe Photoshop"),
    ("illustrator", "Adobe Illustrator"),
    ("indesign", "Adobe InDesign"),
    ("in design", "Adobe InDesign"),
    ("acrobat pro", "Adobe Acrobat"),
    ("acrobat", "Adobe Acrobat"),
]


@dataclass
class AdobeImportStats:
    csv_users_with_products: int = 0
    desired_assignments: int = 0
    created: int = 0
    deleted_old_rows: int = 0
    skipped_blank_products: int = 0
    unknown_products: list[str] = field(default_factory=list)


def _email(value: Any) -> str:
    return str(value or "").strip().lower()


def _product_names(value: Any) -> tuple[list[str], list[str]]:
    products: list[str] = []
    unknown: list[str] = []
    for raw_part in str(value or "").split(","):
        part = raw_part.strip()
        if not part:
            continue
        name = re.sub(r"\s*\([^)]*\)\s*", "", part).strip()
        lowered = name.lower()
        mapped = None
        for token, product in PRODUCT_TOKENS:
            if token in lowered:
                mapped = product
                break
        if mapped:
            if mapped not in products:
                products.append(mapped)
        else:
            unknown.append(name)
    return products, unknown


def _load_desired(path: Path) -> tuple[dict[str, set[str]], int, list[str]]:
    desired: dict[str, set[str]] = defaultdict(set)
    skipped_blank = 0
    unknown: list[str] = []
    with path.open(newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            email = _email(row.get("Email"))
            raw_products = row.get("Team Products")
            products, unknown_products = _product_names(raw_products)
            if unknown_products:
                unknown.extend(f"{email}: {product}" for product in unknown_products)
            if not email:
                continue
            if not products:
                skipped_blank += 1
                continue
            desired[email].update(products)
    return desired, skipped_blank, unknown


def _is_adobe(row: LicenseAssignment) -> bool:
    short = short_name_for(row.tool_short_name or row.tool_name)
    return (
        short in ADOBE_PRODUCTS
        or short == ADOBE_GROUP_SHORT
        or str(row.tool_short_name or "").strip() == ADOBE_GROUP_SHORT
        or str(row.tool_name or "").strip().startswith("Adobe")
    )


async def import_adobe_users(path: Path, *, apply: bool) -> AdobeImportStats:
    desired, skipped_blank, unknown = _load_desired(path)
    stats = AdobeImportStats(
        csv_users_with_products=len(desired),
        desired_assignments=len(desired),
        skipped_blank_products=skipped_blank,
        unknown_products=unknown,
    )
    now = datetime.utcnow()

    async with SessionLocal() as session:
        existing = (await session.execute(select(LicenseAssignment))).scalars().all()
        adobe_rows = [row for row in existing if _is_adobe(row)]
        for row in adobe_rows:
            await session.delete(row)
            stats.deleted_old_rows += 1

        for email, products in sorted(desired.items()):
            product_list = ", ".join(sorted(products))
            session.add(
                LicenseAssignment(
                    work_email=email,
                    tool_name=product_list,
                    tool_short_name=ADOBE_GROUP_SHORT,
                    plan="Team Product",
                    status="Assigned",
                    notes=f"Synced fresh from {path.name}; product names only, contract IDs stripped",
                    updated_at=now,
                )
            )
            stats.created += 1

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
    stats = await import_adobe_users(path, apply=args.apply)
    print(("APPLIED" if args.apply else "DRY RUN") + f" Adobe users import from {path}")
    print(f"  csv users with products: {stats.csv_users_with_products}")
    print(f"  desired assignments: {stats.desired_assignments}")
    print(f"  created: {stats.created}")
    print(f"  deleted old Adobe rows: {stats.deleted_old_rows}")
    print(f"  skipped blank Team Products rows: {stats.skipped_blank_products}")
    if stats.unknown_products:
        print("  unknown products:")
        for item in stats.unknown_products[:30]:
            print(f"    - {item}")


if __name__ == "__main__":
    async def _run() -> None:
        try:
            await main()
        finally:
            await engine.dispose()

    asyncio.run(_run())
