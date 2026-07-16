"""IMS inventory business logic: asset-tag generation and computed fields."""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ims import ImsAsset, ImsCategory
from app.schemas.ims import AssetOut

TAG_PREFIX = "SL"


def financial_year(d: date | None = None) -> int:
    """Indian FY starting year (April–March). Apr 2026–Mar 2027 -> 2026."""
    d = d or date.today()
    return d.year if d.month >= 4 else d.year - 1


async def peek_next_tag(session: AsyncSession, category: ImsCategory) -> tuple[int, str]:
    """Preview the next tag for a category without consuming the sequence."""
    fy = financial_year()
    row = (
        await session.execute(
            text(
                "SELECT last_number FROM ims_asset_sequence "
                "WHERE category_code = :code AND fy = :fy"
            ),
            {"code": category.code, "fy": fy},
        )
    ).first()
    nxt = (row[0] if row else 0) + 1
    return fy, _format_tag(category.code, fy, nxt)


async def generate_asset_tag(session: AsyncSession, category: ImsCategory) -> str:
    """Atomically consume the next number in the (category, FY) sequence."""
    fy = financial_year()
    await session.execute(
        text(
            "INSERT INTO ims_asset_sequence (category_code, fy, last_number) "
            "VALUES (:code, :fy, 1) "
            "ON DUPLICATE KEY UPDATE last_number = last_number + 1"
        ),
        {"code": category.code, "fy": fy},
    )
    row = (
        await session.execute(
            text(
                "SELECT last_number FROM ims_asset_sequence "
                "WHERE category_code = :code AND fy = :fy"
            ),
            {"code": category.code, "fy": fy},
        )
    ).first()
    return _format_tag(category.code, fy, int(row[0]))


def _format_tag(code: str, fy: int, number: int) -> str:
    return f"{TAG_PREFIX}-{code.upper()}-{fy}-{number:04d}"


def add_months(start: date, months: int) -> date:
    """Add whole months to a date, clamping the day to the target month's end."""
    month_index = start.month - 1 + months
    year = start.year + month_index // 12
    month = month_index % 12 + 1
    # clamp day (e.g. Jan 31 + 1 month -> Feb 28/29)
    if month == 2:
        last_day = 29 if (year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)) else 28
    elif month in (4, 6, 9, 11):
        last_day = 30
    else:
        last_day = 31
    return date(year, month, min(start.day, last_day))


def _to_float(value) -> float | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    return float(value)


def compute_asset_metrics(asset: ImsAsset, today: date | None = None) -> dict:
    """Warranty status/days-left, age, and straight-line current book value."""
    today = today or date.today()
    out: dict = {
        "warranty_status": None,
        "warranty_days_left": None,
        "age_years": None,
        "current_book_value": None,
        "qr_payload": asset.asset_tag,
    }

    if asset.warranty_end:
        days_left = (asset.warranty_end - today).days
        out["warranty_days_left"] = days_left
        if days_left < 0:
            out["warranty_status"] = "EXPIRED"
        elif days_left <= 30:
            out["warranty_status"] = "EXPIRING_SOON"
        else:
            out["warranty_status"] = "IN_WARRANTY"

    ref_date = asset.in_service_date or asset.purchase_date
    if ref_date:
        age_years = max(0.0, (today - ref_date).days / 365.25)
        out["age_years"] = round(age_years, 2)
        cost = _to_float(asset.purchase_cost)
        life = asset.useful_life_years
        if cost is not None and life and life > 0:
            remaining = max(0.0, 1.0 - (age_years / life))
            out["current_book_value"] = round(cost * remaining, 2)
        elif cost is not None:
            out["current_book_value"] = round(cost, 2)

    return out


def asset_to_out(asset: ImsAsset) -> AssetOut:
    """Serialize an asset (with relationships loaded) + computed metrics."""
    metrics = compute_asset_metrics(asset)
    return AssetOut(
        asset_id=asset.asset_id,
        asset_tag=asset.asset_tag,
        serial_number=asset.serial_number,
        category_id=asset.category_id,
        category_name=asset.category.name if asset.category else None,
        category_code=asset.category.code if asset.category else None,
        product_id=asset.product_id,
        manufacturer_id=asset.manufacturer_id,
        manufacturer_name=asset.manufacturer.name if asset.manufacturer else None,
        model_name=asset.model_name,
        status=asset.status,
        condition_rating=asset.condition_rating,
        location_id=asset.location_id,
        location_name=asset.location.name if asset.location else None,
        assigned_person_id=asset.assigned_person_id,
        assigned_email=asset.assigned_email,
        assigned_name=asset.assigned_name,
        vendor_id=asset.vendor_id,
        vendor_name=asset.vendor.name if asset.vendor else None,
        purchase_cost=asset.purchase_cost,
        currency=asset.currency,
        purchase_date=asset.purchase_date,
        warranty_start=asset.warranty_start,
        warranty_end=asset.warranty_end,
        in_service_date=asset.in_service_date,
        retirement_date=asset.retirement_date,
        useful_life_years=asset.useful_life_years,
        specs=asset.specs,
        notes=asset.notes,
        created_at=asset.created_at,
        updated_at=asset.updated_at,
        **metrics,
    )
