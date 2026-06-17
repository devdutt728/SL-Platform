"""Org chart snapshot builder + helpers.

Builds the principals -> groups -> {lead, members} tree (port of Code.gs
getPeopleData_). The same builder backs both the live read (when no published
snapshot exists yet) and the snapshot written on publish, so the JSON shape is
identical everywhere.

Designation level/colour/order and experience floats are recomputed here from
the live job title / DOJ (the plan treats computed values as authoritative).
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime
import re
from typing import Optional

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.people import (
    EmployeeExt,
    EmployeeWorkInfo,
    LicenseAssignment,
    OrgEmployee,
    OrgGroup,
    OrgPrincipal,
)
from app.models.platform_person import DimPerson
from app.services.console_logic import compute_experience, level_for


def _norm_key(value: Optional[str]) -> str:
    return re.sub(r"[^a-z0-9]+", "", (value or "").strip().lower())


def _principal_sort_key(group_name: str, sort_order: int) -> tuple:
    # "Direct Reports" always sorts first within a principal (Code.gs rule).
    direct = 0 if group_name == "Direct Reports" else 1
    return (direct, sort_order, group_name)


async def _license_counts(people_session: AsyncSession) -> dict[str, int]:
    rows = (
        await people_session.execute(
            select(LicenseAssignment.work_email, func.count())
            .where(LicenseAssignment.status == "Assigned")
            .group_by(LicenseAssignment.work_email)
        )
    ).all()
    return {str(email).strip().lower(): int(n) for email, n in rows if email}


async def sync_missing_dim_people_to_org(
    people_session: AsyncSession,
    platform_session: AsyncSession,
    *,
    performed_by: Optional[str] = None,
) -> int:
    """Create missing People/org rows from active sl_platform.dim_person records.

    Existing org placements are treated as manual structure and are not moved.
    New people are placed by manager's current group first, then by matching
    department/sub-department/business-unit to an existing group. If nothing
    matches, a single Unassigned group is used so the employee is still visible
    for later cleanup.
    """
    people = (
        await platform_session.execute(
            select(DimPerson)
            .where(DimPerson.person_code.is_not(None))
            .where(DimPerson.status == "Working")
            .where(or_(DimPerson.is_deleted == 0, DimPerson.is_deleted.is_(None)))
            .where(or_(DimPerson.full_name.is_(None), DimPerson.full_name != "Dummy Employee"))
            .order_by(DimPerson.person_code.asc())
        )
    ).scalars().all()
    people = [dp for dp in people if (dp.person_code or "").strip()]
    if not people:
        return 0

    principals = (
        await people_session.execute(select(OrgPrincipal).order_by(OrgPrincipal.sort_order))
    ).scalars().all()
    groups = (
        await people_session.execute(select(OrgGroup).where(OrgGroup.is_active.is_(True)))
    ).scalars().all()
    if not groups:
        return 0

    existing_org = {
        row.employee_no: row
        for row in (await people_session.execute(select(OrgEmployee))).scalars().all()
    }
    existing_ext = {
        row.employee_number: row
        for row in (await people_session.execute(select(EmployeeExt))).scalars().all()
    }
    existing_work = {
        row.employee_id: row
        for row in (await people_session.execute(select(EmployeeWorkInfo))).scalars().all()
    }

    group_by_key = {g.group_key: g for g in groups}
    groups_by_name: dict[str, OrgGroup] = {}
    for group in groups:
        for candidate in (group.name, group.group_key):
            key = _norm_key(candidate)
            if key and key not in groups_by_name:
                groups_by_name[key] = group

    def fallback_group() -> OrgGroup:
        for key in ("auto-unassigned", "unassigned"):
            if key in group_by_key:
                return group_by_key[key]
        for group in groups:
            if _norm_key(group.name) == "unassigned":
                return group
        principal_name = (
            principals[0].name
            if principals
            else sorted({g.principal_name for g in groups if g.principal_name})[0]
        )
        group = OrgGroup(
            group_key="auto-unassigned",
            name="Unassigned",
            principal_name=principal_name,
            color_hex="#6B7280",
            sort_order=9999,
            is_active=True,
        )
        people_session.add(group)
        groups.append(group)
        group_by_key[group.group_key] = group
        groups_by_name[_norm_key(group.name)] = group
        groups_by_name[_norm_key(group.group_key)] = group
        return group

    def group_for(dp: DimPerson) -> OrgGroup:
        manager_emp = (dp.manager_id or "").strip()
        manager_org = existing_org.get(manager_emp)
        if manager_org and manager_org.group_key in group_by_key:
            return group_by_key[manager_org.group_key]

        for candidate in (dp.sub_department, dp.department, dp.business_unit, dp.cost_center):
            group = groups_by_name.get(_norm_key(candidate))
            if group:
                return group
        return fallback_group()

    created = 0
    now = datetime.utcnow()
    for dp in people:
        emp_no = dp.person_code.strip()

        ext = existing_ext.get(emp_no)
        if ext is None:
            ext = EmployeeExt(
                employee_number=emp_no,
                person_id=dp.person_id,
                worker_type=(dp.employment_type or "permanent").strip().lower().replace(" ", "_"),
                employment_status="working",
                time_type=(dp.time_type or "fulltime").strip().lower().replace(" ", "_"),
                created_by_person_id=performed_by,
                updated_by_person_id=performed_by,
            )
            people_session.add(ext)
            await people_session.flush()
            existing_ext[emp_no] = ext
        elif not ext.person_id:
            ext.person_id = dp.person_id

        work = existing_work.get(ext.id)
        if work is None:
            work = EmployeeWorkInfo(employee_id=ext.id)
            people_session.add(work)
            existing_work[ext.id] = work
        if work.department is None:
            work.department = dp.department
        if work.sub_department is None:
            work.sub_department = dp.sub_department
        if work.business_unit is None:
            work.business_unit = dp.business_unit
        if work.job_title is None:
            work.job_title = dp.job_title
        if work.date_joined is None:
            work.date_joined = dp.join_date

        if emp_no in existing_org:
            continue

        group = group_for(dp)
        level = level_for(dp.job_title)
        exp = compute_experience(dp.join_date, None)
        org_row = OrgEmployee(
            employee_no=emp_no,
            group_key=group.group_key,
            principal_name=group.principal_name,
            org_level="Member",
            include_in_org=True,
            source_manager_emp=dp.manager_id,
            designation_level=level.label,
            designation_color=level.color,
            designation_order=level.order,
            sl_exp_years=exp.sl_exp_years,
            o_exp_years=exp.o_exp_years,
            updated_at=now,
            updated_by_person_id=performed_by,
        )
        people_session.add(org_row)
        existing_org[emp_no] = org_row
        created += 1

    if created:
        await people_session.flush()
    return created


async def build_live_tree(
    people_session: AsyncSession, platform_session: AsyncSession
) -> dict:
    """Construct the full org JSON from the live org_* tables.

    Returns the same dict shape that is stored as org_change_log.snapshot_after.
    """
    principals = (
        await people_session.execute(select(OrgPrincipal).order_by(OrgPrincipal.sort_order))
    ).scalars().all()
    groups = (
        await people_session.execute(select(OrgGroup).where(OrgGroup.is_active.is_(True)))
    ).scalars().all()
    org_rows = (
        await people_session.execute(
            select(OrgEmployee).where(OrgEmployee.include_in_org.is_(True))
        )
    ).scalars().all()

    if not org_rows:
        return await _build_platform_directory_tree(platform_session)

    group_by_key = {g.group_key: g for g in groups}
    emp_numbers = [r.employee_no for r in org_rows]

    # Identity + work info, keyed by employee_number.
    identities: dict[str, DimPerson] = {}
    if emp_numbers:
        dps = (
            await platform_session.execute(
                select(DimPerson).where(DimPerson.person_code.in_(emp_numbers))
            )
        ).scalars().all()
        identities = {dp.person_code: dp for dp in dps if dp.person_code}

    work_by_emp: dict[str, EmployeeWorkInfo] = {}
    if emp_numbers:
        wrows = (
            await people_session.execute(
                select(EmployeeExt.employee_number, EmployeeWorkInfo)
                .join(EmployeeWorkInfo, EmployeeWorkInfo.employee_id == EmployeeExt.id)
                .where(EmployeeExt.employee_number.in_(emp_numbers))
            )
        ).all()
        work_by_emp = {emp_no: wi for emp_no, wi in wrows}

    lic_counts = await _license_counts(people_session)

    # Principal scaffolding.
    principal_nodes: dict[str, dict] = {}
    for p in principals:
        principal_nodes[p.name] = {
            "name": p.name,
            "color": p.color,
            "employee_no": p.employee_no,
            "employee_count": 0,
            "group_count": 0,
            "groups": [],
            "_groups_by_key": {},
        }

    today = date.today()

    def person_dict(r: OrgEmployee, group: OrgGroup) -> dict:
        dp = identities.get(r.employee_no)
        wi = work_by_emp.get(r.employee_no)
        title = (wi.job_title if wi and wi.job_title else None) or (dp.job_title if dp else None)
        department = (wi.department if wi and wi.department else None) or (dp.department if dp else None)
        sub_department = (
            (wi.sub_department if wi and wi.sub_department else None)
            or (dp.sub_department if dp else None)
        )
        business_unit = (
            (wi.business_unit if wi and wi.business_unit else None)
            or (dp.business_unit if dp else None)
        )
        lvl = level_for(title)
        designation_level = r.designation_level or lvl.label
        designation_color = r.designation_color or lvl.color
        designation_order = r.designation_order if r.designation_order is not None else lvl.order
        exp = compute_experience(
            (wi.date_joined if wi and wi.date_joined else None) or (dp.join_date if dp else None),
            float(r.prior_exp_years) if r.prior_exp_years is not None else None,
            today=today,
        )
        email = (dp.email if dp else None) or ""
        name = (dp.full_name or dp.display_name) if dp else r.employee_no
        return {
            "employee_no": r.employee_no,
            "name": name or r.employee_no,
            "email": email or None,
            "title": title,
            "mobile_number": dp.mobile_number if dp else None,
            "department": department,
            "sub_department": sub_department,
            "business_unit": business_unit,
            "group_key": r.group_key,
            "group_name": group.name,
            "principal": group.principal_name,
            "org_level": r.org_level,
            "designation_level": designation_level,
            "designation_color": designation_color,
            "designation_order": designation_order,
            "sl_exp_years": exp.sl_exp_years,
            "o_exp_years": exp.o_exp_years,
            "prior_exp_years": float(r.prior_exp_years) if r.prior_exp_years is not None else None,
            "sl_exp_display": exp.sl_exp_display,
            "o_exp_display": exp.o_exp_display,
            "license_count": lic_counts.get(email.lower(), 0) if email else 0,
            "image_url": r.image_url,
            "source_manager_emp": r.source_manager_emp,
            "manager_override_emp": r.manager_override_emp,
            "include_in_org": r.include_in_org,
        }

    for r in org_rows:
        group = group_by_key.get(r.group_key)
        if not group or group.principal_name not in principal_nodes:
            continue
        pnode = principal_nodes[group.principal_name]
        person = person_dict(r, group)

        # The principal's own row updates the principal node, not a group.
        if person["name"] == group.principal_name:
            pnode["employee_no"] = person["employee_no"]
            continue

        gnode = pnode["_groups_by_key"].get(r.group_key)
        if gnode is None:
            gnode = {
                "key": group.group_key,
                "name": group.name,
                "principal": group.principal_name,
                "lead_name": group.team_lead_emp,
                "lead": None,
                "color": group.color_hex,
                "sort": group.sort_order,
                "members": [],
            }
            pnode["_groups_by_key"][r.group_key] = gnode

        # Team lead (by employee number) becomes the group's lead node.
        if group.team_lead_emp and r.employee_no == group.team_lead_emp and group.team_lead_emp != pnode["employee_no"]:
            gnode["lead"] = person
        else:
            gnode["members"].append(person)

    # Sort + tally.
    for p in principals:
        pnode = principal_nodes[p.name]
        gs = list(pnode["_groups_by_key"].values())
        for g in gs:
            g["members"].sort(key=lambda m: (m["designation_order"] or 99, m["name"].lower()))
        gs.sort(key=lambda g: _principal_sort_key(g["name"], g["sort"]))
        pnode["groups"] = gs
        pnode["group_count"] = len(gs)
        pnode["employee_count"] = (1 if pnode["employee_no"] else 0) + sum(
            (1 if g["lead"] else 0) + len(g["members"]) for g in gs
        )
        del pnode["_groups_by_key"]

    return {
        "principals": [principal_nodes[p.name] for p in principals],
        "generated_at": datetime.utcnow().isoformat(),
    }


async def _build_platform_directory_tree(platform_session: AsyncSession) -> dict:
    """Fallback org tree from sl_platform.dim_person while org import is empty.

    dim_person has identity, manager, department, job title, and dates, but it
    does not have the full editable People org model. This keeps the live chart
    useful until org_group/org_employee are seeded.
    """
    rows = (
        await platform_session.execute(
            select(DimPerson)
            .where(DimPerson.status == "Working")
            .where((DimPerson.is_deleted == 0) | (DimPerson.is_deleted.is_(None)))
            .order_by(DimPerson.full_name.asc(), DimPerson.person_code.asc())
        )
    ).scalars().all()

    people = [dp for dp in rows if dp.person_code and (dp.full_name or "").strip().lower() != "dummy employee"]
    today = date.today()

    def person_dict(dp: DimPerson, group_key: str, group_name: str) -> dict:
        lvl = level_for(dp.job_title)
        exp = compute_experience(dp.join_date, None, today=today)
        name = dp.full_name or dp.display_name or dp.person_code
        return {
            "employee_no": dp.person_code,
            "name": name,
            "email": dp.email,
            "title": dp.job_title,
            "mobile_number": dp.mobile_number,
            "department": dp.department,
            "sub_department": dp.sub_department,
            "business_unit": dp.business_unit,
            "group_key": group_key,
            "group_name": group_name,
            "principal": "Studio Lotus",
            "org_level": None,
            "designation_level": lvl.label,
            "designation_color": lvl.color,
            "designation_order": lvl.order,
            "sl_exp_years": exp.sl_exp_years,
            "o_exp_years": exp.o_exp_years,
            "prior_exp_years": None,
            "sl_exp_display": exp.sl_exp_display,
            "o_exp_display": exp.o_exp_display,
            "license_count": 0,
            "image_url": None,
            "source_manager_emp": dp.manager_id,
            "manager_override_emp": None,
            "include_in_org": True,
        }

    groups: list[dict] = []
    by_department: dict[str, list[DimPerson]] = defaultdict(list)
    for dp in people:
        by_department[(dp.department or "Unassigned").strip() or "Unassigned"].append(dp)

    for index, department in enumerate(sorted(by_department), start=1000):
        members = sorted(
            by_department[department],
            key=lambda dp: (
                level_for(dp.job_title).order,
                (dp.full_name or dp.display_name or dp.person_code).lower(),
            ),
        )
        group_key = f"department-{index}"
        groups.append(
            {
                "key": group_key,
                "name": department,
                "principal": "Studio Lotus",
                "lead_name": None,
                "lead": None,
                "color": "#6B7280",
                "sort": index,
                "members": [person_dict(dp, group_key, department) for dp in members],
            }
        )

    groups.sort(key=lambda g: (g["sort"], g["name"].lower()))
    return {
        "principals": [
            {
                "name": "Studio Lotus",
                "color": "#244C66",
                "employee_no": None,
                "employee_count": sum((1 if g["lead"] else 0) + len(g["members"]) for g in groups),
                "group_count": len(groups),
                "groups": groups,
            }
        ],
        "generated_at": datetime.utcnow().isoformat(),
    }


async def latest_change_log(people_session: AsyncSession):
    from app.models.people import OrgChangeLog

    return (
        await people_session.execute(
            select(OrgChangeLog).order_by(OrgChangeLog.performed_at.desc()).limit(1)
        )
    ).scalar_one_or_none()


def index_snapshot_members(snapshot: dict) -> dict[str, dict]:
    """Map employee_no -> {groupKey, principal, name} from a snapshot tree."""
    out: dict[str, dict] = {}
    for p in snapshot.get("principals", []):
        if p.get("employee_no"):
            out[p["employee_no"]] = {"groupKey": None, "principal": p["name"], "name": p["name"]}
        for g in p.get("groups", []):
            for person in ([g["lead"]] if g.get("lead") else []) + g.get("members", []):
                out[person["employee_no"]] = {
                    "groupKey": person["group_key"],
                    "principal": person["principal"],
                    "name": person["name"],
                }
    return out


def diff_snapshots(before: dict, after: dict) -> list[dict]:
    """Compute moved-employee diff between two snapshots (for changelog)."""
    b = index_snapshot_members(before)
    a = index_snapshot_members(after)
    diffs: list[dict] = []
    for emp_no, after_info in a.items():
        before_info = b.get(emp_no)
        if before_info and before_info["groupKey"] != after_info["groupKey"]:
            diffs.append({
                "empNo": emp_no,
                "name": after_info["name"],
                "fromGroupKey": before_info["groupKey"],
                "fromPrincipal": before_info["principal"],
                "toGroupKey": after_info["groupKey"],
                "toPrincipal": after_info["principal"],
            })
    return diffs
