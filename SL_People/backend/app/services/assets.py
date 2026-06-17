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
    ReconciliationIssue,
    ReconciliationResponse,
    ReconciliationSummary,
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


def _active_person_status(status: Optional[str]) -> bool:
    return str(status or "").strip().lower() in {"active", "working", "enabled", "current"}


def _contains_tool(value: Optional[str], tool: str) -> bool:
    text = str(value or "").lower()
    return tool.lower() in text


def _matches_any(value: Optional[str], needles: list[str]) -> bool:
    text = str(value or "").lower()
    return any(needle.lower() in text for needle in needles)


def _has_covered_license(held: set[str], acceptable_tools: set[str]) -> bool:
    return bool(held.intersection(acceptable_tools))


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


async def reconciliation_report(
    people_session: AsyncSession,
    platform_session: AsyncSession,
) -> ReconciliationResponse:
    people = (await platform_session.execute(select(DimPerson))).scalars().all()
    people_by_email = {_norm_email(p.email): p for p in people if _norm_email(p.email)}
    people_by_emp = {str(p.person_code): p for p in people if p.person_code}

    ext_rows = (await people_session.execute(select(EmployeeExt))).scalars().all()
    ext_by_emp = {row.employee_number: row for row in ext_rows if row.employee_number}

    org_rows = (await people_session.execute(select(OrgEmployee))).scalars().all()
    org_by_emp = {row.employee_no: row for row in org_rows if row.employee_no}

    groups = (await people_session.execute(select(OrgGroup))).scalars().all()
    group_by_key = {row.group_key: row for row in groups if row.group_key}

    systems = (await people_session.execute(select(SystemInventory))).scalars().all()
    licenses = (await people_session.execute(select(LicenseAssignment))).scalars().all()
    peripherals = (await people_session.execute(select(PeripheralInventory))).scalars().all()

    issues: list[ReconciliationIssue] = []

    def add(
        *,
        severity: str,
        module: str,
        entity_type: str,
        entity_key: str,
        issue: str,
        detail: str,
        recommended_action: str,
        correction_point: Optional[str] = None,
        email: Optional[str] = None,
        employee_no: Optional[str] = None,
        person: Optional[DimPerson] = None,
    ) -> None:
        if person is None and email:
            person = people_by_email.get(_norm_email(email))
        if person is None and employee_no:
            person = people_by_emp.get(str(employee_no))
        issues.append(
            ReconciliationIssue(
                severity=severity,
                module=module,
                entity_type=entity_type,
                entity_key=entity_key,
                person_id=str(person.person_id) if person and person.person_id else None,
                employee_no=employee_no or (str(person.person_code) if person and person.person_code else None),
                email=_norm_email(email) or (_norm_email(person.email) if person else None),
                name=((person.full_name or person.display_name) if person else None),
                issue=issue,
                detail=detail,
                correction_point=correction_point,
                recommended_action=recommended_action,
            )
        )

    active_licenses = [row for row in licenses if _active_assignment(row.status)]
    licenses_by_email: defaultdict[str, list[LicenseAssignment]] = defaultdict(list)
    for row in active_licenses:
        email = _norm_email(row.work_email)
        if email:
            licenses_by_email[email].append(row)

    systems_by_email: defaultdict[str, list[SystemInventory]] = defaultdict(list)
    for row in systems:
        email = _norm_email(row.assigned_email)
        if email:
            systems_by_email[email].append(row)

    for person in people:
        email = _norm_email(person.email)
        emp_no = str(person.person_code or "")
        ext = ext_by_emp.get(emp_no)
        org = org_by_emp.get(emp_no)
        has_assets = bool(systems_by_email.get(email) or licenses_by_email.get(email))

        if _active_person_status(person.status) and emp_no and not org:
            add(
                severity="warning",
                module="Org",
                entity_type="person",
                entity_key=emp_no,
                person=person,
                issue="Active person missing from org",
                detail="The person exists in platform identity but has no org_employee row.",
                recommended_action="Sync or assign this person to an org group.",
            )
        if org and org.include_in_org and not group_by_key.get(org.group_key):
            add(
                severity="critical",
                module="Org",
                entity_type="org_employee",
                entity_key=emp_no,
                person=person,
                issue="Org row points to missing group",
                detail=f"group_key '{org.group_key}' does not exist in org_group.",
                recommended_action="Move the person to a valid group or restore the missing group.",
            )
        if ext and not _active_person_status(ext.employment_status) and has_assets:
            add(
                severity="critical",
                module="People",
                entity_type="person",
                entity_key=emp_no,
                person=person,
                issue="Inactive employee has active assets",
                detail="Employee is not working but still has active system or license records.",
                recommended_action="Revoke licenses and unassign/retire systems before or during exit processing.",
            )
        if org and not org.include_in_org and has_assets:
            add(
                severity="warning",
                module="Org",
                entity_type="person",
                entity_key=emp_no,
                person=person,
                issue="Excluded org person has active assets",
                detail="The person is excluded from org but still has systems or licenses.",
                recommended_action="Confirm whether this is a shared/support account or include the person in org.",
            )

    for email, rows in systems_by_email.items():
        person = people_by_email.get(email)
        if not person:
            for system in rows:
                add(
                    severity="critical",
                    module="Systems",
                    entity_type="system",
                    entity_key=system.system_id,
                    email=email,
                    issue="System assigned to unknown email",
                    detail="assigned_email does not match a platform person.",
                    recommended_action="Fix the assigned email or mark the system unassigned/shared.",
                )
            continue

        emp_no = str(person.person_code or "")
        org = org_by_emp.get(emp_no)
        group = group_by_key.get(org.group_key) if org else None
        expected_team = group.name if group else None
        for system in rows:
            if expected_team and system.team and system.team.strip() != expected_team.strip():
                add(
                    severity="warning",
                    module="Systems",
                    entity_type="system",
                    entity_key=system.system_id,
                    email=email,
                    employee_no=emp_no,
                    person=person,
                    issue="System team differs from org group",
                    detail=f"System team is '{system.team}', org group is '{expected_team}'.",
                    recommended_action="Derive system team from org or update the stored system team.",
                )
            if org and not org.include_in_org:
                add(
                    severity="warning",
                    module="Systems",
                    entity_type="system",
                    entity_key=system.system_id,
                    email=email,
                    employee_no=emp_no,
                    person=person,
                    issue="System assigned to org-excluded person",
                    detail="The assigned person is not currently included in the org chart.",
                    recommended_action="Confirm assignment or update org inclusion.",
                )

        if len(rows) > 1:
            add(
                severity="info",
                module="Systems",
                entity_type="person",
                entity_key=email,
                email=email,
                employee_no=emp_no,
                person=person,
                issue="Multiple systems assigned to one person",
                detail=", ".join(sorted(row.system_id for row in rows)),
                recommended_action="Confirm this is intentional or unassign extra machines.",
            )

    for row in systems:
        email = _norm_email(row.assigned_email)
        if not email:
            if str(row.status or "").strip().lower() == "active":
                add(
                    severity="warning",
                    module="Systems",
                    entity_type="system",
                    entity_key=row.system_id,
                    issue="Active system has no assignee",
                    detail="System is active but assigned_email is blank.",
                    recommended_action="Assign the system or change status to retired/spare.",
                )
            continue

        lics = licenses_by_email.get(email, [])
        held = {short_name_for(lic.tool_short_name or lic.tool_name) for lic in lics if lic.tool_name or lic.tool_short_name}
        installed_checks: list[tuple[str, str, Optional[str], set[str], str]] = [
            ("AutoCAD LT", "autocad_version", row.autocad_version, {"AutoCAD LT"}, "AutoCAD LT"),
            ("SketchUp Pro", "sketchup_version", row.sketchup_version, {"SketchUp Pro"}, "SketchUp Pro"),
            ("3ds Max", "3dsmax_version", row.threedmax_version, {"3ds Max"}, "3ds Max"),
            ("Rhino", "rhino_version", row.rhino_version, {"Rhino"}, "Rhino"),
            ("Enscape", "enscape_version", row.enscape_version, {"Enscape"}, "Enscape"),
            ("D5 Render", "d5_render", row.d5_render, {"D5 Render"}, "D5 Render"),
            (
                "MS Office 365",
                "office_version",
                row.office_version,
                {"MS Office 365 Apps", "MS Office 365 Standard", "MS Office 365 Business Standard"},
                "MS Office 365 Business Standard" if _matches_any(row.office_version, ["business", "standard"]) else "MS Office 365 Apps",
            ),
        ]
        if _matches_any(row.adobe_versions, ["photoshop"]):
            installed_checks.append(("Adobe Photoshop", "adobe_versions", row.adobe_versions, {"Adobe Photoshop"}, "Adobe Photoshop"))
        if _matches_any(row.adobe_versions, ["illustrator"]):
            installed_checks.append(("Adobe Illustrator", "adobe_versions", row.adobe_versions, {"Adobe Illustrator"}, "Adobe Illustrator"))
        if _matches_any(row.adobe_versions, ["indesign", "in design"]):
            installed_checks.append(("Adobe InDesign", "adobe_versions", row.adobe_versions, {"Adobe InDesign"}, "Adobe InDesign"))
        if _matches_any(row.adobe_versions, ["acrobat"]):
            installed_checks.append(("Adobe Acrobat", "adobe_versions", row.adobe_versions, {"Adobe Acrobat"}, "Adobe Acrobat"))

        held_labels = sorted(held)
        for tool, field_name, installed, acceptable_tools, suggested_tool in installed_checks:
            if installed and not _has_covered_license(held, acceptable_tools):
                add(
                    severity="warning",
                    module="Licenses",
                    entity_type="system",
                    entity_key=row.system_id,
                    email=email,
                    issue="Installed software without matching license",
                    detail=(
                        f"{tool} appears in Systems.{field_name} as '{installed}' for {email}, "
                        f"but active Licenses for this user are: {', '.join(held_labels) if held_labels else 'none'}."
                    ),
                    correction_point=(
                        f"Bulk export sheet 'Systems', row system_id='{row.system_id}', column '{field_name}'. "
                        f"If the install is valid, add/fix sheet 'Licenses' row work_email='{email}', "
                        f"column 'tool_name'='{suggested_tool}'."
                    ),
                    recommended_action="Assign the license, remove the install, or correct the installed software field.",
                )

    for email, rows in licenses_by_email.items():
        person = people_by_email.get(email)
        if not person:
            tools = sorted({short_name_for(row.tool_name) for row in rows if row.tool_name})
            add(
                severity="info",
                module="Licenses",
                entity_type="license_holder",
                entity_key=email,
                email=email,
                issue="License assigned to non-person email",
                detail=(
                    f"work_email '{email}' is not mapped to platform People. "
                    f"Active assigned tools: {', '.join(tools) if tools else 'none'}."
                ),
                correction_point=(
                    f"Bulk export sheet 'Licenses', rows where work_email='{email}', column 'work_email'. "
                    "If intentional, document it as a shared/service account."
                ),
                recommended_action="Mark as shared/service account or correct the holder email.",
            )
            continue
        if not systems_by_email.get(email):
            tools = sorted({short_name_for(row.tool_name) for row in rows if row.tool_name})
            add(
                severity="info",
                module="Licenses",
                entity_type="person",
                entity_key=email,
                email=email,
                person=person,
                issue="License holder has no system",
                detail=(
                    f"{person.full_name or person.display_name or email} has active license assignments "
                    f"({', '.join(tools) if tools else 'none'}) but no Systems row assigned to this email."
                ),
                correction_point=(
                    f"Bulk export sheet 'Licenses', rows where work_email='{email}', or sheet 'Systems', "
                    f"column 'assigned_email' if a machine should be mapped to this user."
                ),
                recommended_action="Confirm BYOD/shared machine usage or assign a system.",
            )

    severity_counts = defaultdict(int)
    for issue in issues:
        severity_counts[issue.severity] += 1
    summary = ReconciliationSummary(
        total_people=len(people),
        org_people=len(org_rows),
        systems=len(systems),
        active_license_assignments=len(active_licenses),
        peripherals=len(peripherals),
        issue_count=len(issues),
        critical_count=severity_counts["critical"],
        warning_count=severity_counts["warning"],
        info_count=severity_counts["info"],
    )
    return ReconciliationResponse(
        summary=summary,
        issues=sorted(issues, key=lambda i: ({"critical": 0, "warning": 1, "info": 2}.get(i.severity, 9), i.module, i.entity_key)),
    )
