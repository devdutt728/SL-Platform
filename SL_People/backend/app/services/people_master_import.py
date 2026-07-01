from __future__ import annotations

import io
import re
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Literal, Optional

from openpyxl import load_workbook
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.people import (
    EmployeeAddress,
    EmployeeExt,
    EmployeeHr,
    EmployeePolicy,
    EmployeeWorkInfo,
    OrgChangeLog,
    OrgEmployee,
    OrgGroup,
    OrgPrincipal,
    SheetImportJob,
)
from app.models.platform_person import DimPerson
from app.services import audit as audit_service
from app.services import org as org_service
from app.services.console_logic import ORG_PRINCIPALS, compute_experience, level_for

IssueSeverity = Literal["critical", "warning", "info"]

REQUIRED_COLUMNS = {
    "Employee Number",
    "Full Name",
    "Work Email",
    "Department",
    "Job Title",
    "Reporting Manager Employee Number",
    "Date Joined",
    "Employment Status",
}

VALID_STATUSES = {
    "working": "working",
    "active": "working",
    "relieved": "relieved",
    "exited": "relieved",
    "terminated": "terminated",
}


@dataclass
class ImportIssue:
    severity: IssueSeverity
    row: int
    column: Optional[str]
    employee_no: Optional[str]
    name: Optional[str]
    code: str
    message: str
    correction: str
    can_ignore: bool

    def as_dict(self) -> dict[str, Any]:
        return {
            "severity": self.severity,
            "row": self.row,
            "column": self.column,
            "employee_no": self.employee_no,
            "name": self.name,
            "code": self.code,
            "message": self.message,
            "correction": self.correction,
            "can_ignore": self.can_ignore,
        }


@dataclass
class ParsedRow:
    row_number: int
    data: dict[str, Any]

    @property
    def employee_no(self) -> str:
        return _text(self.data.get("Employee Number"))

    @property
    def full_name(self) -> str:
        return _text(self.data.get("Full Name")) or _text(self.data.get("Display Name"))


@dataclass
class PeopleMasterPlan:
    filename: str
    sheet_name: str
    header_row: int
    total_rows: int
    valid_rows: int
    employee_updates: int = 0
    personal_updates: int = 0
    address_updates: int = 0
    policy_updates: int = 0
    work_info_updates: int = 0
    org_updates: int = 0
    org_created: int = 0
    skipped_rows: int = 0
    issues: list[ImportIssue] = field(default_factory=list)

    @property
    def critical_count(self) -> int:
        return sum(1 for issue in self.issues if issue.severity == "critical")

    @property
    def warning_count(self) -> int:
        return sum(1 for issue in self.issues if issue.severity == "warning")

    @property
    def ignorable_count(self) -> int:
        return sum(1 for issue in self.issues if issue.can_ignore)

    @property
    def blocking_count(self) -> int:
        return sum(1 for issue in self.issues if not issue.can_ignore)

    def as_dict(self) -> dict[str, Any]:
        return {
            "filename": self.filename,
            "sheet_name": self.sheet_name,
            "header_row": self.header_row,
            "total_rows": self.total_rows,
            "valid_rows": self.valid_rows,
            "employee_updates": self.employee_updates,
            "personal_updates": self.personal_updates,
            "address_updates": self.address_updates,
            "policy_updates": self.policy_updates,
            "work_info_updates": self.work_info_updates,
            "org_updates": self.org_updates,
            "org_created": self.org_created,
            "skipped_rows": self.skipped_rows,
            "critical_count": self.critical_count,
            "warning_count": self.warning_count,
            "ignorable_count": self.ignorable_count,
            "blocking_count": self.blocking_count,
            "issues": [issue.as_dict() for issue in self.issues],
        }


def _text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def _none(value: Any) -> Optional[str]:
    text = _text(value)
    if not text or text.lower() in {"none", "nan", "not available"}:
        return None
    return text


def _email(value: Any) -> Optional[str]:
    text = _none(value)
    return text.lower() if text else None


def _date(value: Any) -> Optional[date]:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return None


def _norm_choice(value: Any, default: str) -> str:
    text = _text(value).strip().lower().replace(" ", "_")
    return text or default


def _status(value: Any, exit_date: Optional[date]) -> str:
    text = _text(value).strip().lower()
    if text in VALID_STATUSES:
        return VALID_STATUSES[text]
    return "relieved" if exit_date else "working"


def _audit_changes(
    session: AsyncSession,
    *,
    employee_id: str,
    section: str,
    current: dict[str, Any],
    changes: dict[str, Any],
    actor: str,
) -> int:
    diffs = audit_service.diff_fields(current, changes)
    if not diffs:
        return 0
    return audit_service.record_changes(
        session,
        employee_id=employee_id,
        section=section,
        diffs=diffs,
        performed_by_person_id=actor,
    )


def _norm_key(value: Optional[str]) -> str:
    return re.sub(r"[^a-z0-9]+", "", (value or "").strip().lower())


def _row_issue(
    row: ParsedRow,
    *,
    severity: IssueSeverity,
    column: Optional[str],
    code: str,
    message: str,
    correction: str,
    can_ignore: bool,
) -> ImportIssue:
    return ImportIssue(
        severity=severity,
        row=row.row_number,
        column=column,
        employee_no=row.employee_no or None,
        name=row.full_name or None,
        code=code,
        message=message,
        correction=correction,
        can_ignore=can_ignore,
    )


def _find_header_row(ws) -> tuple[int, list[str]]:
    best_row = 0
    best_headers: list[str] = []
    best_score = 0
    for row_idx, values in enumerate(ws.iter_rows(min_row=1, max_row=20, values_only=True), start=1):
        headers = [_text(value) for value in values]
        score = len(REQUIRED_COLUMNS.intersection(set(headers)))
        if score > best_score:
            best_row = row_idx
            best_headers = headers
            best_score = score
    if best_score < 4:
        raise ValueError("Could not find the People master header row. Expected columns such as Employee Number, Full Name, Work Email, Date Joined.")
    return best_row, best_headers


def parse_people_master(contents: bytes, filename: str) -> tuple[str, int, list[str], list[ParsedRow]]:
    wb = load_workbook(io.BytesIO(contents), read_only=True, data_only=True)
    ws = wb["All Employees Master Data"] if "All Employees Master Data" in wb.sheetnames else wb[wb.sheetnames[0]]
    header_row, headers = _find_header_row(ws)
    rows: list[ParsedRow] = []
    for row_idx, values in enumerate(ws.iter_rows(min_row=header_row + 1, values_only=True), start=header_row + 1):
        values = {
            headers[index]: value
            for index, value in enumerate(values)
            if index < len(headers) and headers[index]
        }
        if any(value not in (None, "") for value in values.values()):
            first_value = _text(values.get("Employee Number")).lower()
            if first_value.startswith("generated on"):
                continue
            rows.append(ParsedRow(row_number=row_idx, data=values))
    return ws.title, header_row, headers, rows


async def build_people_master_plan(
    people_session: AsyncSession,
    platform_session: AsyncSession,
    contents: bytes,
    filename: str,
) -> tuple[PeopleMasterPlan, list[ParsedRow]]:
    sheet_name, header_row, headers, rows = parse_people_master(contents, filename)
    issues: list[ImportIssue] = []
    missing = sorted(REQUIRED_COLUMNS.difference(set(headers)))
    if missing:
        for col in missing:
            issues.append(
                ImportIssue(
                    severity="critical",
                    row=header_row,
                    column=col,
                    employee_no=None,
                    name=None,
                    code="missing_column",
                    message=f"Required column '{col}' is missing from the upload.",
                    correction="Export the current template or restore this column in the spreadsheet.",
                    can_ignore=False,
                )
            )

    employee_numbers = [row.employee_no for row in rows if row.employee_no]
    duplicate_numbers = {emp for emp in employee_numbers if employee_numbers.count(emp) > 1}
    if duplicate_numbers:
        for row in rows:
            if row.employee_no in duplicate_numbers:
                issues.append(
                    _row_issue(
                        row,
                        severity="critical",
                        column="Employee Number",
                        code="duplicate_employee_number",
                        message=f"Employee number '{row.employee_no}' appears more than once in this file.",
                        correction="Keep one authoritative row for this employee number before applying the upload.",
                        can_ignore=False,
                    )
                )

    platform_people = {
        dp.person_code: dp
        for dp in (await platform_session.execute(select(DimPerson).where(DimPerson.person_code.in_(employee_numbers or ["__none__"])))).scalars().all()
        if dp.person_code
    }
    existing_org = {
        row.employee_no: row
        for row in (await people_session.execute(select(OrgEmployee))).scalars().all()
    }
    existing_groups = {
        row.group_key: row
        for row in (await people_session.execute(select(OrgGroup).where(OrgGroup.is_active.is_(True)))).scalars().all()
    }
    existing_principals = {
        row.name
        for row in (await people_session.execute(select(OrgPrincipal.name))).scalars().all()
    }
    valid_rows = 0
    for row in rows:
        emp_no = row.employee_no
        if not emp_no:
            issues.append(
                _row_issue(
                    row,
                    severity="critical",
                    column="Employee Number",
                    code="missing_employee_number",
                    message="This row has no employee number, so it cannot be matched or updated safely.",
                    correction="Add the correct Employee Number or remove the row from the upload.",
                    can_ignore=False,
                )
            )
            continue
        valid_rows += 1

        if emp_no not in platform_people:
            issues.append(
                _row_issue(
                    row,
                    severity="warning",
                    column="Employee Number",
                    code="missing_platform_identity",
                    message="This employee number is not present in sl_platform.dim_person.",
                    correction="Confirm the employee exists in Platform identity. If this is a staged employee, Superadmin may apply anyway; People-side rows will be updated but identity fields still depend on Platform.",
                    can_ignore=True,
                )
            )

        email = _email(row.data.get("Work Email"))
        if email and "@" not in email:
            issues.append(
                _row_issue(
                    row,
                    severity="warning",
                    column="Work Email",
                    code="invalid_email",
                    message=f"Work Email '{email}' does not look valid.",
                    correction="Correct the Work Email in the spreadsheet, or apply with override if this value is intentionally temporary.",
                    can_ignore=True,
                )
            )

        manager_emp = _text(row.data.get("Reporting Manager Employee Number"))
        if manager_emp and manager_emp not in employee_numbers and manager_emp not in existing_org:
            issues.append(
                _row_issue(
                    row,
                    severity="warning",
                    column="Reporting Manager Employee Number",
                    code="unknown_manager",
                    message=f"Reporting manager employee number '{manager_emp}' was not found in the upload or current org.",
                    correction="Correct the manager employee number. Applying with override will keep the source manager value but may leave the local reporting manager link empty.",
                    can_ignore=True,
                )
            )

        if not _date(row.data.get("Date Joined")) and row.data.get("Date Joined"):
            issues.append(
                _row_issue(
                    row,
                    severity="warning",
                    column="Date Joined",
                    code="invalid_date_joined",
                    message="Date Joined is present but is not an Excel date value.",
                    correction="Use an Excel date cell for Date Joined, or apply with override to leave the date unchanged/empty.",
                    can_ignore=True,
                )
            )

        if emp_no not in existing_org and not existing_groups and not existing_principals:
            issues.append(
                _row_issue(
                    row,
                    severity="critical",
                    column="Employee Number",
                    code="no_org_structure",
                    message="This active employee has no existing org row, and no org groups/principals exist for safe placement.",
                    correction="Seed org principals/groups first, then upload again.",
                    can_ignore=False,
                )
            )

    plan = PeopleMasterPlan(
        filename=filename,
        sheet_name=sheet_name,
        header_row=header_row,
        total_rows=len(rows),
        valid_rows=valid_rows,
        employee_updates=valid_rows,
        personal_updates=valid_rows,
        address_updates=valid_rows,
        policy_updates=valid_rows,
        work_info_updates=valid_rows,
        org_updates=sum(1 for row in rows if row.employee_no in existing_org),
        org_created=sum(1 for row in rows if row.employee_no and row.employee_no not in existing_org),
        skipped_rows=len(rows) - valid_rows,
        issues=issues,
    )
    return plan, rows


async def _seed_principals(session: AsyncSession) -> None:
    existing = {name for name in (await session.execute(select(OrgPrincipal.name))).scalars().all()}
    for order, principal in enumerate(ORG_PRINCIPALS, start=1):
        if principal["name"] not in existing:
            session.add(OrgPrincipal(name=principal["name"], color=principal["color"], sort_order=order))


async def _group_for_row(
    session: AsyncSession,
    row: ParsedRow,
    existing_org: dict[str, OrgEmployee],
    groups: dict[str, OrgGroup],
    principals: list[OrgPrincipal],
) -> OrgGroup:
    manager_emp = _text(row.data.get("Reporting Manager Employee Number"))
    manager_org = existing_org.get(manager_emp)
    if manager_org and manager_org.group_key in groups:
        return groups[manager_org.group_key]

    group_by_name: dict[str, OrgGroup] = {}
    for group in groups.values():
        for candidate in (group.name, group.group_key):
            key = _norm_key(candidate)
            if key and key not in group_by_name:
                group_by_name[key] = group
    for candidate in (row.data.get("Sub Department"), row.data.get("Department"), row.data.get("Business Unit"), row.data.get("Cost Center")):
        group = group_by_name.get(_norm_key(_text(candidate)))
        if group:
            return group

    for key in ("auto-unassigned", "unassigned"):
        if key in groups:
            return groups[key]
    principal_name = principals[0].name if principals else "Studio Lotus"
    group = OrgGroup(
        group_key="auto-unassigned",
        name="Unassigned",
        principal_name=principal_name,
        color_hex="#6B7280",
        sort_order=9999,
        is_active=True,
    )
    session.add(group)
    await session.flush()
    groups[group.group_key] = group
    return group


async def apply_people_master_import(
    people_session: AsyncSession,
    platform_session: AsyncSession,
    contents: bytes,
    filename: str,
    *,
    performed_by: Optional[str],
    force: bool = False,
) -> dict[str, Any]:
    plan, rows = await build_people_master_plan(people_session, platform_session, contents, filename)
    blocking = [issue for issue in plan.issues if not issue.can_ignore]
    if blocking or (plan.issues and not force):
        job = SheetImportJob(
            source="people_master_org_upload",
            filename=filename,
            total_rows=plan.total_rows,
            success_rows=0,
            error_rows=len(plan.issues),
            column_mapping={"sheet": plan.sheet_name, "header_row": plan.header_row},
            error_log=[issue.as_dict() for issue in plan.issues],
            performed_by=performed_by,
            status="blocked",
        )
        people_session.add(job)
        await people_session.commit()
        return {"applied": False, "job_id": job.id, "requires_override": bool(plan.issues and not blocking), **plan.as_dict()}

    await _seed_principals(people_session)
    await people_session.flush()

    before = await org_service.build_live_tree(people_session, platform_session)
    platform_people = {
        dp.person_code: dp
        for dp in (await platform_session.execute(select(DimPerson).where(DimPerson.person_code.in_([row.employee_no for row in rows if row.employee_no] or ["__none__"])))).scalars().all()
        if dp.person_code
    }
    existing_ext = {
        row.employee_number: row
        for row in (await people_session.execute(select(EmployeeExt))).scalars().all()
    }
    existing_hr = {
        row.employee_id: row
        for row in (await people_session.execute(select(EmployeeHr))).scalars().all()
    }
    existing_policy = {
        row.employee_id: row
        for row in (await people_session.execute(select(EmployeePolicy))).scalars().all()
    }
    existing_addresses: dict[tuple[str, str], EmployeeAddress] = {
        (row.employee_id, row.address_type): row
        for row in (await people_session.execute(select(EmployeeAddress))).scalars().all()
    }
    existing_work = {
        row.employee_id: row
        for row in (await people_session.execute(select(EmployeeWorkInfo))).scalars().all()
    }
    existing_org = {
        row.employee_no: row
        for row in (await people_session.execute(select(OrgEmployee))).scalars().all()
    }
    groups = {
        row.group_key: row
        for row in (await people_session.execute(select(OrgGroup).where(OrgGroup.is_active.is_(True)))).scalars().all()
    }
    principals = (await people_session.execute(select(OrgPrincipal).order_by(OrgPrincipal.sort_order))).scalars().all()

    updated_ext = 0
    updated_personal = 0
    updated_address = 0
    updated_policy = 0
    updated_work = 0
    updated_org = 0
    created_org = 0
    audit_events = 0
    now = datetime.utcnow()
    actor = performed_by or "system"
    rows_by_emp = {row.employee_no: row for row in rows if row.employee_no}
    ext_by_emp_after: dict[str, EmployeeExt] = {}

    for row in rows_by_emp.values():
        emp_no = row.employee_no
        dp = platform_people.get(emp_no)
        exit_date = _date(row.data.get("Exit Date"))
        ext = existing_ext.get(emp_no)
        created_ext = False
        if ext is None:
            ext = EmployeeExt(employee_number=emp_no, created_by_person_id=performed_by)
            people_session.add(ext)
            await people_session.flush()
            existing_ext[emp_no] = ext
            created_ext = True
            audit_service.record_event(
                people_session,
                employee_id=ext.id,
                section="import",
                field_name="employee_created",
                performed_by_person_id=actor,
                old_value=None,
                new_value=filename,
            )
            audit_events += 1
        ext_changes = {
            "person_id": dp.person_id if dp else ext.person_id,
            "attendance_number": _none(row.data.get("Attendance Number")),
            "worker_type": _norm_choice(row.data.get("Worker Type"), "permanent"),
            "time_type": _norm_choice(row.data.get("Time Type"), "fulltime"),
            "employment_status": _status(row.data.get("Employment Status"), exit_date),
            "exit_status": _none(row.data.get("Exit Status")),
            "termination_type": _none(row.data.get("Termination Type")),
            "termination_reason": _none(row.data.get("Termination Reason")),
            "resignation_note": _none(row.data.get("Resignation Note")),
            "exit_comments": _none(row.data.get("Comments")),
        }
        ext_changes["is_deleted"] = ext_changes["employment_status"] != "working"
        ext_current = {field: getattr(ext, field, None) for field in ext_changes}
        audit_events += _audit_changes(
            people_session,
            employee_id=ext.id,
            section="employee_ext",
            current=ext_current,
            changes=ext_changes,
            actor=actor,
        )
        for field, value in ext_changes.items():
            setattr(ext, field, value)
        ext.updated_at = now
        ext.updated_by_person_id = performed_by
        ext_by_emp_after[emp_no] = ext
        if created_ext or audit_service.diff_fields(ext_current, ext_changes):
            updated_ext += 1

    await people_session.flush()

    for row in rows_by_emp.values():
        emp_no = row.employee_no
        ext = ext_by_emp_after[emp_no]
        manager_emp = _text(row.data.get("Reporting Manager Employee Number"))

        hr = existing_hr.get(ext.id)
        if hr is None:
            hr = EmployeeHr(employee_id=ext.id)
            people_session.add(hr)
            existing_hr[ext.id] = hr
        hr_changes = {
            "middle_name": _none(row.data.get("Middle Name")),
            "personal_email": _email(row.data.get("Personal Email")),
            "work_phone": _none(row.data.get("Work Phone")),
            "home_phone": _none(row.data.get("Home Phone")),
            "date_of_birth": _date(row.data.get("Date Of Birth")),
            "gender": _none(row.data.get("Gender")),
            "marital_status": _none(row.data.get("Marital Status")),
            "marriage_date": _date(row.data.get("Marriage Date")),
            "blood_group": _none(row.data.get("Blood Group")),
            "physically_handicapped": _text(row.data.get("Physically Handicapped")).lower() in {"yes", "true", "1"},
            "nationality": _none(row.data.get("Nationality")),
            "father_name": _none(row.data.get("Father Name")),
            "mother_name": _none(row.data.get("Mother Name")),
            "spouse_name": _none(row.data.get("Spouse Name")),
            "children_names": _none(row.data.get("Children Names")),
        }
        hr_current = {field: getattr(hr, field, None) for field in hr_changes}
        hr_diffs = audit_service.diff_fields(hr_current, hr_changes)
        audit_events += audit_service.record_changes(
            people_session,
            employee_id=ext.id,
            section="profile",
            diffs=hr_diffs,
            performed_by_person_id=actor,
        )
        for field, value in hr_changes.items():
            setattr(hr, field, value)
        hr.updated_at = now
        if hr_diffs:
            updated_personal += 1

        for address_type, prefix in (("current", "Current"), ("permanent", "Permanent")):
            address = existing_addresses.get((ext.id, address_type))
            if address is None:
                address = EmployeeAddress(employee_id=ext.id, address_type=address_type)
                people_session.add(address)
                existing_addresses[(ext.id, address_type)] = address
            address_changes = {
                "line1": _none(row.data.get(f"{prefix} Address Line 1")),
                "line2": _none(row.data.get(f"{prefix} Address Line 2")),
                "city": _none(row.data.get(f"{prefix} Address City")),
                "state": _none(row.data.get(f"{prefix} Address State")),
                "zip": _none(row.data.get(f"{prefix} Address Zip")),
                "country": _none(row.data.get(f"{prefix} Address Country")),
            }
            address_current = {field: getattr(address, field, None) for field in address_changes}
            address_diffs = audit_service.diff_fields(address_current, address_changes)
            audit_events += audit_service.record_changes(
                people_session,
                employee_id=ext.id,
                section="address",
                diffs={f"{address_type}.{field}": diff for field, diff in address_diffs.items()},
                performed_by_person_id=actor,
            )
            for field, value in address_changes.items():
                setattr(address, field, value)
            if address_diffs:
                updated_address += 1

        policy = existing_policy.get(ext.id)
        if policy is None:
            policy = EmployeePolicy(employee_id=ext.id)
            people_session.add(policy)
            existing_policy[ext.id] = policy
        policy_changes = {
            "leave_plan": _none(row.data.get("Leave Plan")),
            "shift_policy": _none(row.data.get("Shift Policy Name")),
            "weekly_off_policy": _none(row.data.get("Weekly Off Policy Name")),
            "attendance_tracking_policy": _none(row.data.get("Attendance Time Tracking Policy")),
            "attendance_capture_scheme": _none(row.data.get("Attendance Capture Scheme")),
            "holiday_list": _none(row.data.get("Holiday List Name")),
            "expense_policy": _none(row.data.get("Expense Policy Name")),
        }
        policy_current = {field: getattr(policy, field, None) for field in policy_changes}
        policy_diffs = audit_service.diff_fields(policy_current, policy_changes)
        audit_events += audit_service.record_changes(
            people_session,
            employee_id=ext.id,
            section="policy",
            diffs=policy_diffs,
            performed_by_person_id=actor,
        )
        for field, value in policy_changes.items():
            setattr(policy, field, value)
        policy.updated_at = now
        if policy_diffs:
            updated_policy += 1

        work = existing_work.get(ext.id)
        if work is None:
            work = EmployeeWorkInfo(employee_id=ext.id)
            people_session.add(work)
            existing_work[ext.id] = work
        work_changes = {
            "location": _none(row.data.get("Location")),
            "location_country": _none(row.data.get("Location Country")),
            "legal_entity": _none(row.data.get("Legal Entity")),
            "business_unit": _none(row.data.get("Business Unit")),
            "department": _none(row.data.get("Department")),
            "sub_department": _none(row.data.get("Sub Department")),
            "job_title": _none(row.data.get("Job Title")),
            "secondary_job_title": _none(row.data.get("Secondary Job Title")),
            "date_joined": _date(row.data.get("Date Joined")),
            "exit_date": _date(row.data.get("Exit Date")),
            "notice_period": _none(row.data.get("Notice Period")),
            "band": _none(row.data.get("Band")),
            "pay_grade": _none(row.data.get("Pay Grade")),
            "cost_center": _none(row.data.get("Cost Center")),
            "reporting_manager_id": ext_by_emp_after.get(manager_emp, existing_ext.get(manager_emp)).id if manager_emp and (manager_emp in ext_by_emp_after or manager_emp in existing_ext) else None,
        }
        work_current = {field: getattr(work, field, None) for field in work_changes}
        work_diffs = audit_service.diff_fields(work_current, work_changes)
        audit_events += audit_service.record_changes(
            people_session,
            employee_id=ext.id,
            section="work_info",
            diffs=work_diffs,
            performed_by_person_id=actor,
        )
        for field, value in work_changes.items():
            setattr(work, field, value)
        work.updated_at = now
        if work_diffs:
            updated_work += 1

        org_row = existing_org.get(emp_no)
        if org_row is None:
            group = await _group_for_row(people_session, row, existing_org, groups, principals)
            org_row = OrgEmployee(
                employee_no=emp_no,
                group_key=group.group_key,
                principal_name=group.principal_name,
                org_level="Member",
            )
            people_session.add(org_row)
            existing_org[emp_no] = org_row
            created_org += 1
            audit_service.record_event(
                people_session,
                employee_id=ext.id,
                section="org",
                field_name="org_row_created",
                performed_by_person_id=actor,
                old_value=None,
                new_value=group.group_key,
            )
            audit_events += 1
        else:
            group = groups.get(org_row.group_key)
            if group:
                org_row.principal_name = group.principal_name

        level = level_for(work.job_title)
        exp = compute_experience(work.date_joined, None)
        org_changes = {
            "group_key": org_row.group_key,
            "principal_name": org_row.principal_name,
            "include_in_org": ext.employment_status == "working",
            "source_manager_emp": manager_emp or None,
            "designation_level": level.label,
            "designation_color": level.color,
            "designation_order": level.order,
            "sl_exp_years": exp.sl_exp_years,
            "o_exp_years": exp.o_exp_years,
        }
        org_current = {field: getattr(org_row, field, None) for field in org_changes}
        org_diffs = audit_service.diff_fields(org_current, org_changes)
        audit_events += audit_service.record_changes(
            people_session,
            employee_id=ext.id,
            section="org",
            diffs=org_diffs,
            performed_by_person_id=actor,
        )
        for field, value in org_changes.items():
            setattr(org_row, field, value)
        org_row.updated_at = now
        org_row.updated_by_person_id = performed_by
        if org_diffs:
            updated_org += 1

    await people_session.flush()
    after = await org_service.build_live_tree(people_session, platform_session)
    diff = org_service.diff_snapshots(before, after)
    if diff:
        people_session.add(
            OrgChangeLog(
                action="master_import",
                performed_by_person_id=performed_by or "system",
                draft_name=filename[:100],
                snapshot_before=before,
                snapshot_after=after,
                diff_summary=diff,
            )
        )

    job = SheetImportJob(
        source="people_master_org_upload",
        filename=filename,
        total_rows=plan.total_rows,
        success_rows=plan.valid_rows,
        error_rows=len(plan.issues),
        column_mapping={"sheet": plan.sheet_name, "header_row": plan.header_row, "force": force},
        error_log=[issue.as_dict() for issue in plan.issues],
        performed_by=performed_by,
        status="applied_with_warnings" if plan.issues else "applied",
    )
    people_session.add(job)
    await people_session.commit()

    return {
        "applied": True,
        "job_id": job.id,
        "requires_override": False,
        **plan.as_dict(),
        "employee_updates": updated_ext,
        "personal_updates": updated_personal,
        "address_updates": updated_address,
        "policy_updates": updated_policy,
        "work_info_updates": updated_work,
        "org_updates": updated_org,
        "org_created": created_org,
        "changes_count": len(diff),
        "audit_events": audit_events,
    }
