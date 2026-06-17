from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal
from typing import Iterable, Optional

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.people import LicenseAssignment, LicenseContract
from app.models.platform_person import DimPerson
from app.schemas.licenses import (
    LicenseAssignmentItem,
    LicenseContractItem,
    LicenseEmailIssue,
    LicenseSoftwareSummary,
    LicenseSummaryResponse,
    LicenseTotals,
)
from app.services.console_logic import short_name_for


def _norm_email(value: Optional[str]) -> str:
    return str(value or "").strip().lower()


def _money(value) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    return float(value)


def _renewal(end_date: Optional[date]) -> tuple[Optional[int], str]:
    if not end_date:
        return None, "No End Date"
    diff = (end_date - date.today()).days
    if diff < 0:
        return diff, "Expired"
    if diff <= 30:
        return diff, "Expiring Soon"
    if diff <= 90:
        return diff, "Watch"
    return diff, "Active"


async def _platform_people_by_email(
    platform_session: AsyncSession, emails: Iterable[str]
) -> dict[str, DimPerson]:
    wanted = sorted({_norm_email(e) for e in emails if _norm_email(e)})
    if not wanted:
        return {}
    rows = (
        await platform_session.execute(
            select(DimPerson).where(func.lower(DimPerson.email).in_(wanted))
        )
    ).scalars().all()
    return {_norm_email(row.email): row for row in rows if row.email}


async def employee_email_set(platform_session: AsyncSession) -> set[str]:
    rows = (await platform_session.execute(select(DimPerson.email))).scalars().all()
    return {_norm_email(email) for email in rows if _norm_email(email)}


def classify_license_holder(
    email: Optional[str],
    master_email_set: set[str],
    shared_email_set: Optional[set[str]] = None,
) -> str:
    if not email:
        return "unassigned"
    e = _norm_email(email)
    if "unassigned" in e:
        return "unassigned"
    if shared_email_set and e in shared_email_set:
        return "shared"
    if e in master_email_set:
        return "person"
    return "shared"


def _is_active_assignment(status: Optional[str]) -> bool:
    value = str(status or "").strip().lower()
    return value not in {"revoked", "available", "unassigned", "inactive", "disabled"}


def contract_item(row: LicenseContract) -> LicenseContractItem:
    days, renewal_status = _renewal(row.end_date)
    return LicenseContractItem(
        id=row.id,
        contract_key=row.contract_key,
        entity=row.entity,
        software=row.software,
        short_name=row.short_name or short_name_for(row.software),
        category=row.category,
        contract_no=row.contract_no,
        contract_type=row.contract_type,
        serial_no=row.serial_no,
        seats=row.seats or 0,
        vendor=row.vendor,
        start_date=row.start_date,
        end_date=row.end_date,
        cost=_money(row.cost),
        currency=row.currency or "INR",
        status=row.status,
        user_type=row.user_type,
        notes=row.notes,
        days_to_expiry=days,
        renewal_status=renewal_status,
        updated_at=row.updated_at,
    )


async def assignment_item(
    row: LicenseAssignment,
    *,
    platform_by_email: dict[str, DimPerson],
    master_email_set: set[str],
) -> LicenseAssignmentItem:
    email = _norm_email(row.work_email)
    person = platform_by_email.get(email)
    kind = classify_license_holder(email, master_email_set)
    return LicenseAssignmentItem(
        id=row.id,
        work_email=row.work_email,
        tool_name=row.tool_name,
        tool_short_name=row.tool_short_name or short_name_for(row.tool_name),
        plan=row.plan,
        status=row.status,
        assigned_on=row.assigned_on,
        renewal_date=row.renewal_date,
        cost_centre=row.cost_centre,
        notes=row.notes,
        holder_kind=kind,  # type: ignore[arg-type]
        holder_name=(person.full_name or person.display_name) if person else None,
        updated_at=row.updated_at,
    )


async def license_summary(
    people_session: AsyncSession,
    platform_session: AsyncSession,
) -> LicenseSummaryResponse:
    contracts = (
        await people_session.execute(select(LicenseContract).order_by(LicenseContract.software.asc()))
    ).scalars().all()
    assignments = (
        await people_session.execute(select(LicenseAssignment).order_by(LicenseAssignment.tool_name.asc()))
    ).scalars().all()
    master_emails = await employee_email_set(platform_session)

    contract_items = [contract_item(row) for row in contracts]
    summary_by_tool: dict[str, dict] = {}
    for contract in contract_items:
        key = contract.short_name or short_name_for(contract.software)
        if key not in summary_by_tool:
            summary_by_tool[key] = {
                "software": contract.software,
                "short_name": key,
                "category": contract.category,
                "purchased": 0,
                "assigned": 0,
                "shared_assigned": 0,
                "total_assigned": 0,
                "contracts": 0,
            }
        summary_by_tool[key]["purchased"] += contract.seats or 0
        summary_by_tool[key]["contracts"] += 1

    assign_counts: defaultdict[str, int] = defaultdict(int)
    shared_counts: defaultdict[str, int] = defaultdict(int)
    unknown_by_email: defaultdict[str, list[str]] = defaultdict(list)
    total_person = 0
    total_shared = 0

    for row in assignments:
        email = _norm_email(row.work_email)
        tool = row.tool_name
        if not email or not tool or not _is_active_assignment(row.status):
            continue
        kind = classify_license_holder(email, master_emails)
        if kind == "unassigned":
            continue
        short = row.tool_short_name or short_name_for(tool)
        if kind == "person":
            total_person += 1
            assign_counts[short] += 1
        else:
            total_shared += 1
            shared_counts[short] += 1
            unknown_by_email[email].append(tool)

    for key, item in summary_by_tool.items():
        item["assigned"] = assign_counts[key]
        item["shared_assigned"] = shared_counts[key]
        item["total_assigned"] = assign_counts[key] + shared_counts[key]

    software_summaries = [
        LicenseSoftwareSummary(**item)
        for item in sorted(summary_by_tool.values(), key=lambda x: str(x["short_name"]).lower())
    ]
    expiring = sorted(
        [
            c for c in contract_items
            if c.days_to_expiry is not None and c.days_to_expiry <= 60
        ],
        key=lambda c: c.days_to_expiry if c.days_to_expiry is not None else 999999,
    )
    unknown = [
        LicenseEmailIssue(email=email, tools=tools, known=False)
        for email, tools in sorted(unknown_by_email.items())
    ]
    return LicenseSummaryResponse(
        totals=LicenseTotals(
            purchased=sum(c.seats for c in contract_items),
            assigned=total_person,
            shared_assigned=total_shared,
            total_assigned=total_person + total_shared,
            software_titles=len(software_summaries),
        ),
        software_summaries=software_summaries,
        expiring_soon_list=expiring,
        all_contracts=contract_items,
        total_assignments=total_person + total_shared,
        shared_email_list=[],
        unknown_email_list=unknown,
    )


async def list_assignments(
    people_session: AsyncSession,
    platform_session: AsyncSession,
    *,
    search: Optional[str] = None,
    tool: Optional[str] = None,
    status: Optional[str] = None,
    holder_kind: Optional[str] = None,
    page: int = 1,
    limit: int = 100,
) -> tuple[list[LicenseAssignmentItem], int]:
    page = max(1, page)
    limit = max(1, min(limit, 500))
    base = select(LicenseAssignment)
    if search:
        term = f"%{search.strip()}%"
        base = base.where(
            or_(
                LicenseAssignment.work_email.like(term),
                LicenseAssignment.tool_name.like(term),
                LicenseAssignment.tool_short_name.like(term),
                LicenseAssignment.plan.like(term),
            )
        )
    if tool:
        base = base.where(LicenseAssignment.tool_short_name == tool)
    if status:
        base = base.where(LicenseAssignment.status == status)

    total = (await people_session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    rows = (
        await people_session.execute(
            base.order_by(LicenseAssignment.updated_at.desc()).offset((page - 1) * limit).limit(limit)
        )
    ).scalars().all()
    people = await _platform_people_by_email(platform_session, [r.work_email for r in rows])
    master_emails = await employee_email_set(platform_session)
    items = [
        await assignment_item(row, platform_by_email=people, master_email_set=master_emails)
        for row in rows
    ]
    if holder_kind:
        items = [item for item in items if item.holder_kind == holder_kind]
        total = len(items)
    return items, total


async def list_contracts(
    people_session: AsyncSession,
    *,
    search: Optional[str] = None,
    status: Optional[str] = None,
    page: int = 1,
    limit: int = 100,
) -> tuple[list[LicenseContractItem], int]:
    page = max(1, page)
    limit = max(1, min(limit, 500))
    base = select(LicenseContract)
    if search:
        term = f"%{search.strip()}%"
        base = base.where(
            or_(
                LicenseContract.contract_key.like(term),
                LicenseContract.software.like(term),
                LicenseContract.short_name.like(term),
                LicenseContract.vendor.like(term),
            )
        )
    if status:
        base = base.where(LicenseContract.status == status)
    total = (await people_session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    rows = (
        await people_session.execute(
            base.order_by(LicenseContract.software.asc(), LicenseContract.end_date.asc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
    ).scalars().all()
    return [contract_item(row) for row in rows], total


def stamp_assignment_defaults(data: dict, *, default_assigned_on: bool = False) -> dict:
    if data.get("tool_name") and not data.get("tool_short_name"):
        data["tool_short_name"] = short_name_for(data["tool_name"])
    if data.get("work_email"):
        data["work_email"] = _norm_email(data["work_email"])
    if default_assigned_on and not data.get("assigned_on"):
        data["assigned_on"] = date.today()
    data["updated_at"] = datetime.utcnow()
    return data


def stamp_contract_defaults(data: dict) -> dict:
    if data.get("software") and not data.get("short_name"):
        data["short_name"] = short_name_for(data["software"])
    data["updated_at"] = datetime.utcnow()
    return data
