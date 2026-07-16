from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ims import (
    ImsAsset,
    ImsAssetAssignment,
    ImsBudget,
    ImsCategory,
    ImsConsumable,
    ImsCostEvent,
    ImsLicense,
    ImsLicenseSeat,
    ImsRepair,
)
from app.schemas.ims import AlertOut, CostEventOut
from app.services.ims_inventory import compute_asset_metrics, financial_year


def _float(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, Decimal):
        return float(value)
    return float(value)


def _fy_month(d: date) -> tuple[int, int]:
    return financial_year(d), d.month


async def derived_cost_events(session: AsyncSession) -> list[CostEventOut]:
    events: list[CostEventOut] = []

    purchase_rows = (
        await session.execute(
            select(
                ImsAsset.asset_id,
                ImsAsset.asset_tag,
                ImsAsset.purchase_cost,
                ImsAsset.currency,
                ImsAsset.purchase_date,
                ImsAsset.category_id,
                ImsCategory.name,
                ImsAsset.vendor_id,
            )
            .join(ImsCategory, ImsCategory.category_id == ImsAsset.category_id)
            .where(ImsAsset.is_deleted.is_(False), ImsAsset.purchase_cost.is_not(None), ImsAsset.purchase_date.is_not(None))
        )
    ).all()
    for row in purchase_rows:
        fy, month = _fy_month(row.purchase_date)
        events.append(
            CostEventOut(
                fy=fy,
                month=month,
                cost_type="PURCHASE",
                source="ACTUAL",
                category_id=row.category_id,
                category_name=row.name,
                vendor_id=row.vendor_id,
                amount=row.purchase_cost,
                currency=row.currency or "INR",
                event_date=row.purchase_date,
                description=f"Asset purchase {row.asset_tag}",
            )
        )

    repair_rows = (
        await session.execute(
            select(
                ImsRepair.repair_id,
                ImsRepair.final_cost,
                ImsRepair.returned_at,
                ImsRepair.vendor_id,
                ImsAsset.asset_tag,
                ImsAsset.category_id,
                ImsCategory.name,
            )
            .join(ImsAsset, ImsAsset.asset_id == ImsRepair.asset_id)
            .join(ImsCategory, ImsCategory.category_id == ImsAsset.category_id)
            .where(ImsRepair.final_cost.is_not(None), ImsRepair.returned_at.is_not(None))
        )
    ).all()
    for row in repair_rows:
        event_date = row.returned_at.date()
        fy, month = _fy_month(event_date)
        events.append(
            CostEventOut(
                fy=fy,
                month=month,
                cost_type="REPAIR",
                source="ACTUAL",
                category_id=row.category_id,
                category_name=row.name,
                vendor_id=row.vendor_id,
                amount=row.final_cost,
                event_date=event_date,
                description=f"Repair {row.asset_tag}",
            )
        )

    license_rows = (
        await session.execute(
            select(ImsLicense.license_id, ImsLicense.name, ImsLicense.cost, ImsLicense.currency, ImsLicense.renewal_date, ImsLicense.vendor_id)
            .where(ImsLicense.is_active.is_(True), ImsLicense.cost.is_not(None), ImsLicense.renewal_date.is_not(None))
        )
    ).all()
    for row in license_rows:
        fy, month = _fy_month(row.renewal_date)
        events.append(
            CostEventOut(
                fy=fy,
                month=month,
                cost_type="LICENSE_RENEWAL",
                source="ACTUAL",
                vendor_id=row.vendor_id,
                amount=row.cost,
                currency=row.currency or "INR",
                event_date=row.renewal_date,
                description=f"License renewal {row.name}",
            )
        )
    return events


async def ledger_events(session: AsyncSession) -> list[CostEventOut]:
    stored = (
        await session.execute(
            select(ImsCostEvent, ImsCategory.name)
            .outerjoin(ImsCategory, ImsCategory.category_id == ImsCostEvent.category_id)
            .order_by(ImsCostEvent.event_date.desc())
        )
    ).all()
    if stored:
        return [
            CostEventOut(
                cost_event_id=row.ImsCostEvent.cost_event_id,
                fy=row.ImsCostEvent.fy,
                month=row.ImsCostEvent.month,
                cost_type=row.ImsCostEvent.cost_type,
                source=row.ImsCostEvent.source,
                category_id=row.ImsCostEvent.category_id,
                category_name=row.name,
                vendor_id=row.ImsCostEvent.vendor_id,
                amount=row.ImsCostEvent.amount,
                currency=row.ImsCostEvent.currency,
                event_date=row.ImsCostEvent.event_date,
                description=row.ImsCostEvent.description,
            )
            for row in stored
        ]
    return await derived_cost_events(session)


async def finance_summary(session: AsyncSession, fy: int | None = None) -> dict[str, Any]:
    fy = fy or financial_year()
    events = await ledger_events(session)
    current = [e for e in events if e.fy == fy]
    actual = [e for e in current if e.source == "ACTUAL"]
    forecast = [e for e in current if e.source == "FORECAST"]

    budget_total = _float((await session.execute(select(func.coalesce(func.sum(ImsBudget.planned_amount), 0)).where(ImsBudget.fy == fy))).scalar_one())
    actual_total = sum(_float(e.amount) for e in actual)
    forecast_total = sum(_float(e.amount) for e in forecast)

    monthly = [{"month": month, "amount": 0.0} for month in range(1, 13)]
    by_month = {row["month"]: row for row in monthly}
    by_type: dict[str, float] = defaultdict(float)
    by_category: dict[str, float] = defaultdict(float)
    for event in actual:
        by_month[event.month]["amount"] += _float(event.amount)
        by_type[event.cost_type] += _float(event.amount)
        by_category[event.category_name or "Uncategorised"] += _float(event.amount)

    projection = await five_year_projection(session, fy)
    return {
        "fy": fy,
        "actual_total": round(actual_total, 2),
        "forecast_total": round(forecast_total, 2),
        "budget_total": round(budget_total, 2),
        "variance": round(budget_total - actual_total, 2),
        "monthly_actuals": monthly,
        "by_cost_type": [{"name": k, "amount": round(v, 2)} for k, v in sorted(by_type.items())],
        "by_category": [{"name": k, "amount": round(v, 2)} for k, v in sorted(by_category.items(), key=lambda x: x[1], reverse=True)],
        "five_year_projection": projection,
    }


async def five_year_projection(session: AsyncSession, start_fy: int) -> list[dict[str, Any]]:
    rows = (
        await session.execute(
            select(ImsAsset, ImsCategory)
            .join(ImsCategory, ImsCategory.category_id == ImsAsset.category_id)
            .where(ImsAsset.is_deleted.is_(False), ImsAsset.purchase_cost.is_not(None), ImsAsset.purchase_date.is_not(None))
        )
    ).all()
    license_rows = (
        await session.execute(
            select(ImsLicense).where(ImsLicense.is_active.is_(True), ImsLicense.cost.is_not(None), ImsLicense.renewal_date.is_not(None))
        )
    ).scalars().all()
    out = [{"fy": fy, "hardware": 0.0, "software": 0.0, "total": 0.0} for fy in range(start_fy, start_fy + 5)]
    by_fy = {row["fy"]: row for row in out}
    for asset, category in rows:
        life = asset.useful_life_years or category.default_useful_life_years or 4
        refresh_fy = financial_year(date(asset.purchase_date.year + int(life), asset.purchase_date.month, min(asset.purchase_date.day, 28)))
        if refresh_fy in by_fy:
            by_fy[refresh_fy]["hardware"] += _float(asset.purchase_cost)
    for lic in license_rows:
        renewal_fy = financial_year(lic.renewal_date)
        for fy in by_fy:
            if fy >= renewal_fy:
                by_fy[fy]["software"] += _float(lic.cost)
    for row in out:
        row["hardware"] = round(row["hardware"], 2)
        row["software"] = round(row["software"], 2)
        row["total"] = round(row["hardware"] + row["software"], 2)
    return out


async def computed_alerts(session: AsyncSession, today: date | None = None) -> list[AlertOut]:
    today = today or date.today()
    horizon = today + timedelta(days=90)
    alerts: list[AlertOut] = []

    assets = (
        await session.execute(
            select(ImsAsset).where(ImsAsset.is_deleted.is_(False), ImsAsset.status.notin_(["RETIRED", "LOST"]))
        )
    ).scalars().all()
    for asset in assets:
        if asset.warranty_end and today <= asset.warranty_end <= horizon:
            alerts.append(AlertOut(alert_type="WARRANTY_EXPIRY", entity_type="ims_asset", entity_id=asset.asset_id, title=f"{asset.asset_tag} warranty expires", due_date=asset.warranty_end, severity="HIGH" if (asset.warranty_end - today).days <= 30 else "MEDIUM"))
        if not asset.serial_number or not asset.purchase_date or not asset.purchase_cost:
            alerts.append(AlertOut(alert_type="DATA_GAP", entity_type="ims_asset", entity_id=asset.asset_id, title=f"{asset.asset_tag} has incomplete inventory data", severity="LOW"))

    licenses = (
        await session.execute(select(ImsLicense).where(ImsLicense.is_active.is_(True), ImsLicense.renewal_date.is_not(None)))
    ).scalars().all()
    for license_row in licenses:
        if today <= license_row.renewal_date <= horizon:
            alerts.append(AlertOut(alert_type="LICENSE_RENEWAL", entity_type="ims_license", entity_id=license_row.license_id, title=f"{license_row.name} renewal due", due_date=license_row.renewal_date, severity="HIGH"))

    consumables = (await session.execute(select(ImsConsumable).where(ImsConsumable.is_active.is_(True)))).scalars().all()
    for item in consumables:
        if item.current_qty <= item.min_qty:
            alerts.append(AlertOut(alert_type="LOW_STOCK", entity_type="ims_consumable", entity_id=item.consumable_id, title=f"{item.name} is below minimum stock", severity="HIGH"))

    repairs = (await session.execute(select(ImsRepair).where(ImsRepair.status != "RETURNED", ImsRepair.expected_return_at.is_not(None)))).scalars().all()
    for repair in repairs:
        if repair.expected_return_at.date() < today:
            alerts.append(AlertOut(alert_type="REPAIR_OVERDUE", entity_type="ims_repair", entity_id=repair.repair_id, title=f"Repair #{repair.repair_id} is overdue", due_date=repair.expected_return_at.date(), severity="HIGH"))
    return alerts[:100]


async def dashboard_summary(session: AsyncSession) -> dict[str, Any]:
    assets = (await session.execute(select(ImsAsset).where(ImsAsset.is_deleted.is_(False)))).scalars().all()
    total_value = 0.0
    warranty_counts: dict[str, int] = defaultdict(int)
    status_counts: dict[str, int] = defaultdict(int)
    for asset in assets:
        status_counts[asset.status] += 1
        metrics = compute_asset_metrics(asset)
        total_value += _float(metrics.get("current_book_value"))
        warranty_counts[metrics.get("warranty_status") or "UNKNOWN"] += 1

    category_rows = (
        await session.execute(
            select(ImsCategory.name, func.count(ImsAsset.asset_id))
            .join(ImsAsset, ImsAsset.category_id == ImsCategory.category_id)
            .where(ImsAsset.is_deleted.is_(False))
            .group_by(ImsCategory.name)
        )
    ).all()
    open_repairs = (await session.execute(select(func.count()).select_from(ImsRepair).where(ImsRepair.status != "RETURNED"))).scalar_one()
    assigned_seats = (await session.execute(select(func.count()).select_from(ImsLicenseSeat).where(ImsLicenseSeat.released_at.is_(None)))).scalar_one()
    total_seats = (await session.execute(select(func.coalesce(func.sum(ImsLicense.total_seats), 0)).where(ImsLicense.is_active.is_(True)))).scalar_one()
    low_stock = (await session.execute(select(func.count()).select_from(ImsConsumable).where(ImsConsumable.current_qty <= ImsConsumable.min_qty, ImsConsumable.is_active.is_(True)))).scalar_one()
    assignments_30 = (await session.execute(select(func.count()).select_from(ImsAssetAssignment).where(ImsAssetAssignment.assigned_at >= date.today() - timedelta(days=30)))).scalar_one()
    alerts = await computed_alerts(session)
    finance = await finance_summary(session)
    return {
        "kpis": {
            "total_assets": len(assets),
            "current_value": round(total_value, 2),
            "assigned_assets": status_counts.get("ASSIGNED", 0),
            "available_assets": status_counts.get("IN_STOCK", 0),
            "open_repairs": open_repairs,
            "open_alerts": len(alerts),
            "fy_spend": finance["actual_total"],
        },
        "status_counts": [{"name": k, "count": v} for k, v in sorted(status_counts.items())],
        "category_mix": [{"name": name, "count": count} for name, count in category_rows],
        "warranty_breakdown": [{"name": k, "count": v} for k, v in sorted(warranty_counts.items())],
        "allotment": {"recent_30d": assignments_30, "assigned_assets": status_counts.get("ASSIGNED", 0)},
        "repair": {"open_repairs": open_repairs},
        "license": {"assigned_seats": assigned_seats, "total_seats": int(total_seats or 0)},
        "consumables": {"low_stock": low_stock},
        "alerts": alerts[:10],
    }
