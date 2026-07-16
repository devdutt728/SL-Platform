"""Bulk asset import/export.

Provides the CSV template + full-register export (same column layout, so an
export round-trips back through import) and the matching + diff engine that
powers preview/commit: assets are matched by asset_tag first, serial_number
as a fallback, and a blank cell always means "leave this field as it is" on
an update (bulk import never blanks out an existing value) — only cells that
actually differ from what's stored get written.
"""
from __future__ import annotations

import csv
import io
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Optional

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.constants import IMS_ASSET_STATUS_VALUES, IMS_CONDITION_VALUES
from app.models.ims import ImsAsset, ImsCategory, ImsLocation, ImsManufacturer, ImsVendor
from app.models.platform import DimPerson
from app.request_context import RequestContext
from app.schemas.ims import AssetImportResult, AssetImportRowOut
from app.schemas.user import UserContext
from app.services import ims_inventory as inv
from app.services.audit_service import write_audit_log

TEMPLATE_HEADERS = [
    "asset_tag", "serial_number", "category", "manufacturer", "model_name",
    "status", "condition_rating", "location", "assigned_email", "vendor",
    "purchase_cost", "currency", "purchase_date", "warranty_start", "warranty_end",
    "in_service_date", "useful_life_years", "notes",
]

# Five varied example rows so admins can see exactly what goes in each column.
# They demonstrate: auto vs manual tag, assigned vs in-stock, blank serials,
# warranty windows, and which cells may simply be left empty.
_EXAMPLE_ROWS = [
    # 1. Laptop already handed to an employee — full purchase + warranty info.
    ["", "5CD1234XYZ", "Laptop", "Dell", "Latitude 5440",
     "ASSIGNED", "GOOD", "Studio Floor - Design", "employee.name@studiolotus.in", "Ingram Micro India",
     "96000", "INR", "2024-06-10", "2024-06-10", "2027-06-10", "2024-06-10", "4",
     "EXAMPLE ROW - delete before uploading. assigned_email must be a real staff email."],
    # 2. Desktop sitting in stock — tag left blank so the system generates it.
    ["", "DPRE-3660-1001", "Desktop", "Dell", "Precision 3660 Tower",
     "IN_STOCK", "NEW", "IT Store Room", "", "Acme Traders",
     "265000", "INR", "2026-05-02", "", "", "", "5",
     "EXAMPLE ROW - warranty dates left blank; fill them or leave empty."],
    # 3. Monitor with your own asset tag instead of an auto-generated one.
    ["SL-MON-2026-0001", "CN-ABC123", "Monitor", "LG", "27UP850 27 inch 4K",
     "IN_STOCK", "NEW", "Studio Floor - Design", "", "",
     "46000", "INR", "2026-04-15", "2026-04-15", "2029-04-15", "2026-04-15", "5",
     "EXAMPLE ROW - asset_tag filled manually; must be unique."],
    # 4. Keyboard with no printed serial number — serial simply left blank.
    ["", "", "Keyboard", "Logitech", "MX Keys",
     "IN_STOCK", "NEW", "IT Store Room", "", "",
     "9500", "INR", "2026-03-20", "", "", "", "3",
     "EXAMPLE ROW - no serial is fine; leave the cell empty."],
    # 5. Old UPS nearing end of life — shows FAIR condition and expired warranty.
    ["", "APC-3000-0007", "UPS", "APC", "Smart-UPS 3000VA",
     "IN_STOCK", "FAIR", "Server Room", "", "Secure Power Solutions",
     "82000", "INR", "2021-01-05", "2021-01-05", "2023-01-05", "2021-01-05", "6",
     "EXAMPLE ROW - condition_rating one of: NEW, GOOD, FAIR, POOR, DAMAGED."],
]

_ASSET_LOADERS = (
    selectinload(ImsAsset.category),
    selectinload(ImsAsset.manufacturer),
    selectinload(ImsAsset.location),
    selectinload(ImsAsset.vendor),
)

def _csv_text(rows: list[list[object]]) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf)
    for row in rows:
        writer.writerow(["" if v is None else v for v in row])
    return buf.getvalue()


def build_template_csv() -> str:
    return _csv_text([TEMPLATE_HEADERS, *_EXAMPLE_ROWS])


async def build_export_csv(session: AsyncSession) -> str:
    rows = (
        await session.execute(
            select(ImsAsset).options(*_ASSET_LOADERS).where(ImsAsset.is_deleted.is_(False)).order_by(ImsAsset.asset_tag)
        )
    ).scalars().all()
    out = [TEMPLATE_HEADERS]
    for a in rows:
        out.append([
            a.asset_tag, a.serial_number, a.category.name if a.category else "",
            a.manufacturer.name if a.manufacturer else "", a.model_name,
            a.status, a.condition_rating, a.location.name if a.location else "",
            a.assigned_email, a.vendor.name if a.vendor else "",
            a.purchase_cost, a.currency, a.purchase_date, a.warranty_start, a.warranty_end,
            a.in_service_date, a.useful_life_years, a.notes,
        ])
    return _csv_text(out)


def parse_csv(raw: bytes) -> list[dict[str, str]]:
    text = raw.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    rows: list[dict[str, str]] = []
    for row in reader:
        rows.append({(k or "").strip(): (v or "").strip() for k, v in row.items() if k})
    return rows


@dataclass
class RowResult:
    row_number: int
    action: str  # CREATE | UPDATE | UNCHANGED | ERROR
    asset_tag: Optional[str] = None
    changes: dict[str, list[Optional[str]]] = field(default_factory=dict)
    error: Optional[str] = None


class _RowError(Exception):
    pass


def _parse_decimal(raw: str, label: str) -> Decimal:
    try:
        return Decimal(raw)
    except InvalidOperation:
        raise _RowError(f"'{raw}' is not a valid number for {label}")


def _parse_date(raw: str, label: str) -> date:
    try:
        return date.fromisoformat(raw)
    except ValueError:
        raise _RowError(f"'{raw}' is not a valid date for {label} (expected YYYY-MM-DD)")


def _parse_int(raw: str, label: str) -> int:
    try:
        return int(raw)
    except ValueError:
        raise _RowError(f"'{raw}' is not a valid integer for {label}")


def _asset_display_row(asset: ImsAsset) -> dict[str, Optional[str]]:
    return {
        "serial_number": asset.serial_number,
        "category": asset.category.name if asset.category else None,
        "manufacturer": asset.manufacturer.name if asset.manufacturer else None,
        "model_name": asset.model_name,
        "status": asset.status,
        "condition_rating": asset.condition_rating,
        "location": asset.location.name if asset.location else None,
        "assigned_email": asset.assigned_email,
        "vendor": asset.vendor.name if asset.vendor else None,
        "purchase_cost": str(asset.purchase_cost) if asset.purchase_cost is not None else None,
        "currency": asset.currency,
        "purchase_date": asset.purchase_date.isoformat() if asset.purchase_date else None,
        "warranty_start": asset.warranty_start.isoformat() if asset.warranty_start else None,
        "warranty_end": asset.warranty_end.isoformat() if asset.warranty_end else None,
        "in_service_date": asset.in_service_date.isoformat() if asset.in_service_date else None,
        "useful_life_years": str(asset.useful_life_years) if asset.useful_life_years is not None else None,
        "notes": asset.notes,
    }


@dataclass
class _Caches:
    categories: dict[str, ImsCategory]
    manufacturers: dict[str, ImsManufacturer]
    vendors: dict[str, ImsVendor]
    locations: dict[str, ImsLocation]
    people_by_email: dict[str, DimPerson]


async def _load_caches(session: AsyncSession, platform_session: AsyncSession, rows: list[dict[str, str]]) -> _Caches:
    categories = {c.name.lower(): c for c in (await session.execute(select(ImsCategory))).scalars().all()}
    manufacturers = {m.name.lower(): m for m in (await session.execute(select(ImsManufacturer))).scalars().all()}
    vendors = {v.name.lower(): v for v in (await session.execute(select(ImsVendor))).scalars().all()}
    locations = {l.name.lower(): l for l in (await session.execute(select(ImsLocation))).scalars().all()}

    emails = {r.get("assigned_email", "").strip().lower() for r in rows if r.get("assigned_email", "").strip()}
    people_by_email: dict[str, DimPerson] = {}
    if emails:
        people = (
            await platform_session.execute(
                select(DimPerson).where(
                    func.lower(DimPerson.email).in_(emails),
                    or_(DimPerson.is_deleted.is_(None), DimPerson.is_deleted == 0),
                )
            )
        ).scalars().all()
        people_by_email = {p.email.lower(): p for p in people if p.email}

    return _Caches(categories, manufacturers, vendors, locations, people_by_email)


async def _find_existing_asset(session: AsyncSession, asset_tag: str, serial_number: str) -> Optional[ImsAsset]:
    if asset_tag:
        row = (
            await session.execute(
                select(ImsAsset).options(*_ASSET_LOADERS).where(
                    func.lower(ImsAsset.asset_tag) == asset_tag.lower(), ImsAsset.is_deleted.is_(False)
                )
            )
        ).scalar_one_or_none()
        if row:
            return row
    if serial_number:
        row = (
            await session.execute(
                select(ImsAsset).options(*_ASSET_LOADERS).where(
                    func.lower(ImsAsset.serial_number) == serial_number.lower(), ImsAsset.is_deleted.is_(False)
                )
            )
        ).scalar_one_or_none()
        if row:
            return row
    return None


async def _resolve_lookup(
    session: AsyncSession, name: str, cache: dict[str, object], *, dry_run: bool, factory,
) -> tuple[Optional[object], bool]:
    """Case-insensitive name lookup with auto-create. Returns (row_or_None, is_new)."""
    if not name:
        return None, False
    key = name.lower()
    existing = cache.get(key)
    if existing is not None:
        return existing, False
    if dry_run:
        return None, True
    created = factory(name)
    session.add(created)
    await session.flush()  # assign the PK so callers can read *_id immediately
    cache[key] = created
    return created, True


async def _process_row(
    session: AsyncSession,
    caches: _Caches,
    raw: dict[str, str],
    row_number: int,
    *,
    dry_run: bool,
    seen_tags: set[str],
    seen_serials: set[str],
) -> RowResult:
    def get(col: str) -> str:
        return (raw.get(col) or "").strip()

    tag_in = get("asset_tag")
    serial_in = get("serial_number")
    category_in = get("category")

    try:
        if not category_in:
            raise _RowError("Category is required")
        category = caches.categories.get(category_in.lower())
        if category is None:
            raise _RowError(f"Unknown category '{category_in}'")

        if tag_in and tag_in.lower() in seen_tags:
            raise _RowError(f"Asset tag '{tag_in}' repeated earlier in this file")
        if serial_in and serial_in.lower() in seen_serials:
            raise _RowError(f"Serial number '{serial_in}' repeated earlier in this file")

        existing = await _find_existing_asset(session, tag_in, serial_in)

        manufacturer_in = get("manufacturer")
        vendor_in = get("vendor")
        location_in = get("location")
        assigned_email_in = get("assigned_email")
        status_in = get("status").upper()
        condition_in = get("condition_rating").upper()
        purchase_cost_in = get("purchase_cost")
        currency_in = get("currency")
        purchase_date_in = get("purchase_date")
        warranty_start_in = get("warranty_start")
        warranty_end_in = get("warranty_end")
        in_service_date_in = get("in_service_date")
        useful_life_in = get("useful_life_years")
        model_name_in = get("model_name")
        notes_in = get("notes")

        if status_in and status_in not in IMS_ASSET_STATUS_VALUES:
            raise _RowError(f"Unknown status '{status_in}'")
        if condition_in and condition_in not in IMS_CONDITION_VALUES:
            raise _RowError(f"Unknown condition '{condition_in}'")

        person = None
        if assigned_email_in:
            person = caches.people_by_email.get(assigned_email_in.lower())
            if person is None:
                raise _RowError(f"No matching person for email '{assigned_email_in}'")

        purchase_cost = _parse_decimal(purchase_cost_in, "purchase_cost") if purchase_cost_in else None
        purchase_date = _parse_date(purchase_date_in, "purchase_date") if purchase_date_in else None
        warranty_start = _parse_date(warranty_start_in, "warranty_start") if warranty_start_in else None
        warranty_end = _parse_date(warranty_end_in, "warranty_end") if warranty_end_in else None
        in_service_date = _parse_date(in_service_date_in, "in_service_date") if in_service_date_in else None
        useful_life_years = _parse_int(useful_life_in, "useful_life_years") if useful_life_in else None

        manufacturer, manufacturer_new = await _resolve_lookup(
            session, manufacturer_in, caches.manufacturers, dry_run=dry_run,
            factory=lambda n: ImsManufacturer(name=n),
        )
        vendor, vendor_new = await _resolve_lookup(
            session, vendor_in, caches.vendors, dry_run=dry_run, factory=lambda n: ImsVendor(name=n),
        )
        location, location_new = await _resolve_lookup(
            session, location_in, caches.locations, dry_run=dry_run,
            factory=lambda n: ImsLocation(name=n, kind="OTHER"),
        )

        # ── CREATE ──────────────────────────────────────────────────────────
        if existing is None:
            changes: dict[str, list[Optional[str]]] = {
                "category": [None, category.name],
            }
            if serial_in:
                changes["serial_number"] = [None, serial_in]
            if manufacturer_in:
                changes["manufacturer"] = [None, f"(new) {manufacturer_in}" if manufacturer_new else manufacturer_in]
            if model_name_in:
                changes["model_name"] = [None, model_name_in]
            changes["status"] = [None, status_in or ("ASSIGNED" if person else "IN_STOCK")]
            changes["condition_rating"] = [None, condition_in or "NEW"]
            if location_in:
                changes["location"] = [None, f"(new) {location_in}" if location_new else location_in]
            if person:
                changes["assigned_email"] = [None, person.email]
            if vendor_in:
                changes["vendor"] = [None, f"(new) {vendor_in}" if vendor_new else vendor_in]
            if purchase_cost is not None:
                changes["purchase_cost"] = [None, str(purchase_cost)]
            changes["currency"] = [None, currency_in or "INR"]
            if purchase_date:
                changes["purchase_date"] = [None, purchase_date.isoformat()]
            if warranty_start:
                changes["warranty_start"] = [None, warranty_start.isoformat()]
            if warranty_end:
                changes["warranty_end"] = [None, warranty_end.isoformat()]
            if in_service_date:
                changes["in_service_date"] = [None, in_service_date.isoformat()]
            if useful_life_years is not None:
                changes["useful_life_years"] = [None, str(useful_life_years)]
            if notes_in:
                changes["notes"] = [None, notes_in]

            if tag_in:
                seen_tags.add(tag_in.lower())
            if serial_in:
                seen_serials.add(serial_in.lower())

            if dry_run:
                return RowResult(row_number, "CREATE", asset_tag=tag_in or "(auto)", changes=changes)

            asset = ImsAsset(
                asset_tag=tag_in or await inv.generate_asset_tag(session, category),
                serial_number=serial_in or None,
                category_id=category.category_id,
                manufacturer_id=manufacturer.manufacturer_id if manufacturer else None,
                model_name=model_name_in or None,
                status=status_in or ("ASSIGNED" if person else "IN_STOCK"),
                condition_rating=condition_in or "NEW",
                location_id=location.location_id if location else None,
                assigned_person_id=person.person_id if person else None,
                assigned_email=person.email if person else None,
                assigned_name=(person.display_name or person.full_name) if person else None,
                vendor_id=vendor.vendor_id if vendor else None,
                purchase_cost=purchase_cost,
                currency=currency_in or "INR",
                purchase_date=purchase_date,
                warranty_start=warranty_start,
                warranty_end=warranty_end,
                in_service_date=in_service_date,
                useful_life_years=useful_life_years,
                notes=notes_in or None,
            )
            session.add(asset)
            await session.flush()
            return RowResult(row_number, "CREATE", asset_tag=asset.asset_tag, changes=changes)

        # ── UPDATE / UNCHANGED ─────────────────────────────────────────────
        current = _asset_display_row(existing)
        updates: dict[str, object] = {}
        changes = {}

        def maybe(col: str, new_display: Optional[str], attr: str, value) -> None:
            if new_display is None:
                return
            if (current.get(col) or None) != (new_display or None):
                changes[col] = [current.get(col), new_display]
                updates[attr] = value

        maybe("serial_number", serial_in or None, "serial_number", serial_in or None)
        maybe("category", category.name, "category_id", category.category_id)
        if manufacturer_in:
            maybe(
                "manufacturer", f"(new) {manufacturer_in}" if manufacturer_new else manufacturer_in,
                "manufacturer_id", manufacturer.manufacturer_id if manufacturer else None,
            )
        maybe("model_name", model_name_in or None, "model_name", model_name_in or None)
        maybe("status", status_in or None, "status", status_in or None)
        maybe("condition_rating", condition_in or None, "condition_rating", condition_in or None)
        if location_in:
            maybe(
                "location", f"(new) {location_in}" if location_new else location_in,
                "location_id", location.location_id if location else None,
            )
        if person:
            maybe("assigned_email", person.email, "assigned_email", person.email)
            if changes.get("assigned_email"):
                updates["assigned_person_id"] = person.person_id
                updates["assigned_name"] = person.display_name or person.full_name
        if vendor_in:
            maybe(
                "vendor", f"(new) {vendor_in}" if vendor_new else vendor_in,
                "vendor_id", vendor.vendor_id if vendor else None,
            )
        if purchase_cost is not None:
            maybe("purchase_cost", str(purchase_cost), "purchase_cost", purchase_cost)
        maybe("currency", currency_in or None, "currency", currency_in or None)
        if purchase_date:
            maybe("purchase_date", purchase_date.isoformat(), "purchase_date", purchase_date)
        if warranty_start:
            maybe("warranty_start", warranty_start.isoformat(), "warranty_start", warranty_start)
        if warranty_end:
            maybe("warranty_end", warranty_end.isoformat(), "warranty_end", warranty_end)
        if in_service_date:
            maybe("in_service_date", in_service_date.isoformat(), "in_service_date", in_service_date)
        if useful_life_years is not None:
            maybe("useful_life_years", str(useful_life_years), "useful_life_years", useful_life_years)
        maybe("notes", notes_in or None, "notes", notes_in or None)

        if tag_in:
            seen_tags.add(tag_in.lower())
        if serial_in:
            seen_serials.add(serial_in.lower())

        if not changes:
            return RowResult(row_number, "UNCHANGED", asset_tag=existing.asset_tag)

        if dry_run:
            return RowResult(row_number, "UPDATE", asset_tag=existing.asset_tag, changes=changes)

        for attr, value in updates.items():
            setattr(existing, attr, value)
        await session.flush()
        return RowResult(row_number, "UPDATE", asset_tag=existing.asset_tag, changes=changes)

    except _RowError as exc:
        return RowResult(row_number, "ERROR", asset_tag=tag_in or None, error=str(exc))


async def run_import(
    session: AsyncSession,
    platform_session: AsyncSession,
    user: UserContext,
    rows: list[dict[str, str]],
    *,
    dry_run: bool,
    context: Optional[RequestContext] = None,
) -> AssetImportResult:
    caches = await _load_caches(session, platform_session, rows)
    seen_tags: set[str] = set()
    seen_serials: set[str] = set()
    results: list[RowResult] = []

    for i, raw in enumerate(rows, start=2):  # row 1 is the header
        if dry_run:
            result = await _process_row(
                session, caches, raw, i, dry_run=True, seen_tags=seen_tags, seen_serials=seen_serials
            )
            results.append(result)
            continue

        savepoint = await session.begin_nested()
        try:
            result = await _process_row(
                session, caches, raw, i, dry_run=False, seen_tags=seen_tags, seen_serials=seen_serials
            )
            if result.action == "ERROR":
                await savepoint.rollback()
            else:
                await savepoint.commit()
                if result.action in ("CREATE", "UPDATE"):
                    await write_audit_log(
                        session,
                        actor=user,
                        action=f"asset.import_{result.action.lower()}",
                        entity_type="ims_asset",
                        entity_id=result.asset_tag or "",
                        before={k: v[0] for k, v in result.changes.items()} or None,
                        after={k: v[1] for k, v in result.changes.items()} or None,
                        context=context,
                    )
        except IntegrityError as exc:
            await savepoint.rollback()
            result = RowResult(i, "ERROR", asset_tag=(raw.get("asset_tag") or "").strip() or None, error=str(exc.orig or exc))
        results.append(result)

    if not dry_run:
        await session.commit()

    created = sum(1 for r in results if r.action == "CREATE")
    updated = sum(1 for r in results if r.action == "UPDATE")
    unchanged = sum(1 for r in results if r.action == "UNCHANGED")
    errors = sum(1 for r in results if r.action == "ERROR")

    return AssetImportResult(
        rows=[
            AssetImportRowOut(
                row_number=r.row_number, action=r.action, asset_tag=r.asset_tag,
                changes=r.changes, error=r.error,
            )
            for r in results
        ],
        created=created, updated=updated, unchanged=unchanged, errors=errors,
    )
