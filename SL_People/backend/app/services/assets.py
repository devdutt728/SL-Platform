from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.people import (
    EmployeeExt,
    EmployeeWorkInfo,
    LicenseAssignment,
    OrgEmployee,
    OrgGroup,
    PeripheralInventory,
    SystemInventory,
)
from app.models.platform_person import DimPerson
from app.schemas.assets import (
    GroupMemberOverview,
    GroupMemberSystem,
    GroupOverviewItem,
    GroupOverviewResponse,
    PeripheralInventoryItem,
    SystemInventoryItem,
)
from app.services.console_logic import grade_pc, level_for, short_name_for

SYSTEM_TIERS = ["Workstation", "Performance", "Standard", "Basic", "Entry"]


def _norm_email(value: Optional[str]) -> str:
    return str(value or "").strip().lower()


def _num(value) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    return float(value)


def _active_assignment(status: Optional[str]) -> bool:
    return str(status or "").strip().lower() not in {"revoked", "available", "unassigned", "inactive", "disabled"}


def system_item(row: SystemInventory) -> SystemInventoryItem:
    return SystemInventoryItem(
        id=row.id,
        system_id=row.system_id,
        system_type=row.system_type,
        assigned_email=row.assigned_email,
        user_display=row.user_display,
        team=row.team,
        processor=row.processor,
        ram_gb=_num(row.ram_gb),
        ram_slots_free=row.ram_slots_free,
        graphics_card=row.graphics_card,
        cpu_cores=row.cpu_cores,
        storage=row.storage,
        motherboard=row.motherboard,
        os=row.os,
        autocad_version=row.autocad_version,
        sketchup_version=row.sketchup_version,
        threedmax_version=row.threedmax_version,
        rhino_version=row.rhino_version,
        enscape_version=row.enscape_version,
        d5_render=row.d5_render,
        adobe_versions=row.adobe_versions,
        office_version=row.office_version,
        antivirus=row.antivirus,
        purchase_date=row.purchase_date,
        vendor=row.vendor,
        service_tag=row.service_tag,
        serial_no=row.serial_no,
        composite_score=row.composite_score,
        capability_tier=row.capability_tier,
        upgrade_suggestion=row.upgrade_suggestion,
        status=row.status,
        notes=row.notes,
        updated_at=row.updated_at,
    )


def peripheral_item(row: PeripheralInventory) -> PeripheralInventoryItem:
    return PeripheralInventoryItem(
        id=row.id,
        item_id=row.item_id,
        category=row.category,
        item=row.item,
        model=row.model,
        serial=row.serial,
        quantity=row.quantity,
        condition=row.condition,
        location=row.location,
        assigned_to=row.assigned_to,
        status=row.status,
        notes=row.notes,
        updated_at=row.updated_at,
    )


def regrade_system(row: SystemInventory) -> None:
    grade = grade_pc(row.processor, row.graphics_card, str(_num(row.ram_gb) or ""))
    row.composite_score = grade.score
    row.capability_tier = grade.tier
    row.upgrade_suggestion = grade.suggestion
    row.updated_at = datetime.utcnow()


def normalize_system_payload(data: dict) -> dict:
    if data.get("assigned_email"):
        data["assigned_email"] = _norm_email(data["assigned_email"])
    data["updated_at"] = datetime.utcnow()
    return data


def normalize_peripheral_payload(data: dict) -> dict:
    data["updated_at"] = datetime.utcnow()
    return data


async def list_systems(
    session: AsyncSession,
    *,
    search: Optional[str] = None,
    tier: Optional[str] = None,
    team: Optional[str] = None,
    status: Optional[str] = None,
    page: int = 1,
    limit: int = 200,
) -> tuple[list[SystemInventoryItem], int, dict[str, int]]:
    page = max(1, page)
    limit = max(1, min(limit, 500))
    base = select(SystemInventory)
    if search:
        term = f"%{search.strip()}%"
        base = base.where(
            or_(
                SystemInventory.system_id.like(term),
                SystemInventory.assigned_email.like(term),
                SystemInventory.user_display.like(term),
                SystemInventory.processor.like(term),
                SystemInventory.graphics_card.like(term),
                SystemInventory.vendor.like(term),
                SystemInventory.service_tag.like(term),
                SystemInventory.serial_no.like(term),
            )
        )
    if tier:
        base = base.where(SystemInventory.capability_tier == tier)
    if team:
        base = base.where(SystemInventory.team == team)
    if status:
        base = base.where(SystemInventory.status == status)

    total = (await session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    rows = (
        await session.execute(
            base.order_by(SystemInventory.system_id.asc()).offset((page - 1) * limit).limit(limit)
        )
    ).scalars().all()
    tier_rows = (
        await session.execute(
            select(SystemInventory.capability_tier, func.count()).group_by(SystemInventory.capability_tier)
        )
    ).all()
    counts = {tier_name: 0 for tier_name in SYSTEM_TIERS}
    for tier_name, count in tier_rows:
        if tier_name:
            counts[str(tier_name)] = int(count)
    return [system_item(row) for row in rows], total, counts


async def list_peripherals(
    session: AsyncSession,
    *,
    search: Optional[str] = None,
    category: Optional[str] = None,
    condition: Optional[str] = None,
    status: Optional[str] = None,
    page: int = 1,
    limit: int = 200,
) -> tuple[list[PeripheralInventoryItem], int]:
    page = max(1, page)
    limit = max(1, min(limit, 500))
    base = select(PeripheralInventory)
    if search:
        term = f"%{search.strip()}%"
        base = base.where(
            or_(
                PeripheralInventory.item_id.like(term),
                PeripheralInventory.item.like(term),
                PeripheralInventory.model.like(term),
                PeripheralInventory.assigned_to.like(term),
                PeripheralInventory.location.like(term),
            )
        )
    if category:
        base = base.where(PeripheralInventory.category == category)
    if condition:
        base = base.where(PeripheralInventory.condition == condition)
    if status:
        base = base.where(PeripheralInventory.status == status)
    total = (await session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    rows = (
        await session.execute(
            base.order_by(PeripheralInventory.category.asc(), PeripheralInventory.item_id.asc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
    ).scalars().all()
    return [peripheral_item(row) for row in rows], total


async def groups_overview(
    people_session: AsyncSession,
    platform_session: AsyncSession,
) -> GroupOverviewResponse:
    groups = (
        await people_session.execute(select(OrgGroup).where(OrgGroup.is_active.is_(True)))
    ).scalars().all()
    org_rows = (
        await people_session.execute(
            select(OrgEmployee).where(OrgEmployee.include_in_org.is_(True))
        )
    ).scalars().all()
    employee_numbers = [row.employee_no for row in org_rows]

    identities: dict[str, DimPerson] = {}
    if employee_numbers:
        dps = (
            await platform_session.execute(
                select(DimPerson).where(DimPerson.person_code.in_(employee_numbers))
            )
        ).scalars().all()
        identities = {dp.person_code: dp for dp in dps if dp.person_code}

    work_by_emp: dict[str, EmployeeWorkInfo] = {}
    if employee_numbers:
        work_rows = (
            await people_session.execute(
                select(EmployeeExt.employee_number, EmployeeWorkInfo)
                .join(EmployeeWorkInfo, EmployeeWorkInfo.employee_id == EmployeeExt.id)
                .where(EmployeeExt.employee_number.in_(employee_numbers))
            )
        ).all()
        work_by_emp = {emp_no: work for emp_no, work in work_rows}

    systems = (await people_session.execute(select(SystemInventory))).scalars().all()
    systems_by_email = {_norm_email(row.assigned_email): row for row in systems if _norm_email(row.assigned_email)}

    license_rows = (
        await people_session.execute(select(LicenseAssignment).where(LicenseAssignment.status == "Assigned"))
    ).scalars().all()
    licences_by_email: defaultdict[str, list[str]] = defaultdict(list)
    tracked_tools: set[str] = set()
    for lic in license_rows:
        if not _active_assignment(lic.status):
            continue
        email = _norm_email(lic.work_email)
        tool = lic.tool_short_name or short_name_for(lic.tool_name)
        if email and tool:
            licences_by_email[email].append(tool)
            tracked_tools.add(tool)

    tools = sorted(tracked_tools)
    group_by_key = {group.group_key: group for group in groups}
    members_by_group: defaultdict[str, list[OrgEmployee]] = defaultdict(list)
    for row in org_rows:
        if row.group_key in group_by_key:
            members_by_group[row.group_key].append(row)

    items: list[GroupOverviewItem] = []
    for group in sorted(groups, key=lambda g: (g.principal_name, g.sort_order, g.name)):
        tool_counts = {tool: 0 for tool in tools}
        tier_counts = {tier: 0 for tier in SYSTEM_TIERS}
        system_ids: list[str] = []
        members: list[GroupMemberOverview] = []

        for org_emp in members_by_group[group.group_key]:
            dp = identities.get(org_emp.employee_no)
            work = work_by_emp.get(org_emp.employee_no)
            email = _norm_email(dp.email if dp else None)
            title = work.job_title if work else None
            level = level_for(title)
            licences = licences_by_email.get(email, [])
            for tool in licences:
                if tool in tool_counts:
                    tool_counts[tool] += 1

            system = systems_by_email.get(email)
            member_system = None
            if system:
                system_ids.append(system.system_id)
                if system.capability_tier in tier_counts:
                    tier_counts[str(system.capability_tier)] += 1
                member_system = GroupMemberSystem(
                    system_id=system.system_id,
                    tier=system.capability_tier,
                    grade_score=system.composite_score,
                    processor=system.processor,
                    ram_gb=_num(system.ram_gb),
                    gpu=system.graphics_card,
                    upgrade_suggestion=system.upgrade_suggestion,
                    status=system.status,
                    autocad_version=system.autocad_version,
                    sketchup_version=system.sketchup_version,
                    adobe_versions=system.adobe_versions,
                    office_version=system.office_version,
                )

            members.append(
                GroupMemberOverview(
                    employee_no=org_emp.employee_no,
                    name=((dp.full_name or dp.display_name) if dp else org_emp.employee_no) or org_emp.employee_no,
                    email=email or None,
                    title=title,
                    designation_level=level.label,
                    designation_color=level.color,
                    licence_count=len(licences),
                    licences=licences,
                    system=member_system,
                )
            )

        display_headcount = len(
            [
                m for m in members
                if m.name != group.principal_name and m.employee_no != group.team_lead_emp
            ]
        )
        items.append(
            GroupOverviewItem(
                key=group.group_key,
                name=group.name,
                principal=group.principal_name,
                team_lead=group.team_lead_emp,
                headcount=display_headcount,
                system_count=len(system_ids),
                system_ids=system_ids,
                tool_counts=tool_counts,
                tier_counts=tier_counts,
                total_licences=sum(len(m.licences) for m in members),
                members=members,
                color=group.color_hex,
            )
        )

    return GroupOverviewResponse(items=items, tools=tools, tiers=SYSTEM_TIERS)
