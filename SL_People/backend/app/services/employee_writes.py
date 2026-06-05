"""Employee mutation service — applies partial updates with audit logging.

Each updater loads (or creates) the relevant sub-table row, computes the diff vs
the patch, applies the changes, and stages audit rows. The route commits.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.people import (
    EmployeeAddress,
    EmployeeCompliance,
    EmployeeExt,
    EmployeeHr,
    EmployeePolicy,
    EmployeeWorkInfo,
)
from app.services import audit, encryption


async def _get_or_create(session: AsyncSession, model, employee_id: str):
    row = await session.get(model, employee_id)
    if row is None:
        row = model(employee_id=employee_id)
        session.add(row)
    return row


def _apply(row, changes: dict[str, Any]) -> None:
    for field, value in changes.items():
        setattr(row, field, value)
    if hasattr(row, "updated_at"):
        row.updated_at = datetime.utcnow()


async def update_simple_section(
    session: AsyncSession,
    *,
    model,
    section: str,
    employee_id: str,
    changes: dict[str, Any],
    actor: str,
    ip: Optional[str],
) -> int:
    """Generic updater for single-row sub-tables (hr/work/policy/exit)."""
    row = await _get_or_create(session, model, employee_id)
    current = {f: getattr(row, f, None) for f in changes}
    diffs = audit.diff_fields(current, changes)
    if not diffs:
        return 0
    _apply(row, changes)
    return audit.record_changes(
        session,
        employee_id=employee_id,
        section=section,
        diffs=diffs,
        performed_by_person_id=actor,
        ip_address=ip,
    )


async def update_work_info(
    people_session: AsyncSession,
    *,
    employee_id: str,
    changes: dict[str, Any],
    actor: str,
    ip: Optional[str],
) -> int:
    """Work info, resolving reporting_manager_number -> reporting_manager_id."""
    mgr_number = changes.pop("reporting_manager_number", None)
    resolved: dict[str, Any] = dict(changes)
    if mgr_number is not None:
        if str(mgr_number).strip() == "":
            resolved["reporting_manager_id"] = None
        else:
            mgr_id = (
                await people_session.execute(
                    select(EmployeeExt.id).where(EmployeeExt.employee_number == mgr_number)
                )
            ).scalar_one_or_none()
            resolved["reporting_manager_id"] = mgr_id
    return await update_simple_section(
        people_session,
        model=EmployeeWorkInfo,
        section="work_info",
        employee_id=employee_id,
        changes=resolved,
        actor=actor,
        ip=ip,
    )


async def update_exit(
    session: AsyncSession,
    *,
    ext: EmployeeExt,
    changes: dict[str, Any],
    actor: str,
    ip: Optional[str],
) -> int:
    """Exit fields live on employee_ext; the API still exposes them as the exit section."""
    mapped = dict(changes)
    if "comments" in mapped:
        mapped["exit_comments"] = mapped.pop("comments")
    current = {field: getattr(ext, field, None) for field in mapped}
    diffs = audit.diff_fields(current, mapped)
    if not diffs:
        return 0
    _apply(ext, mapped)
    audit_diffs = {
        ("comments" if field == "exit_comments" else field): diff
        for field, diff in diffs.items()
    }
    return audit.record_changes(
        session,
        employee_id=ext.id,
        section="exit",
        diffs=audit_diffs,
        performed_by_person_id=actor,
        ip_address=ip,
    )


async def update_addresses(
    session: AsyncSession,
    *,
    employee_id: str,
    blocks: dict[str, dict[str, Any]],
    actor: str,
    ip: Optional[str],
) -> int:
    """blocks = {'current': {...}, 'permanent': {...}} — only present types touched."""
    total = 0
    for addr_type, fields in blocks.items():
        if fields is None:
            continue
        row = (
            await session.execute(
                select(EmployeeAddress).where(
                    EmployeeAddress.employee_id == employee_id,
                    EmployeeAddress.address_type == addr_type,
                )
            )
        ).scalar_one_or_none()
        if row is None:
            row = EmployeeAddress(employee_id=employee_id, address_type=addr_type)
            session.add(row)
        current = {f: getattr(row, f, None) for f in fields}
        diffs = audit.diff_fields(current, fields)
        if not diffs:
            continue
        _apply(row, fields)
        total += audit.record_changes(
            session,
            employee_id=employee_id,
            section="address",
            diffs={f"{addr_type}.{k}": v for k, v in diffs.items()},
            performed_by_person_id=actor,
            ip_address=ip,
        )
    return total


_COMPLIANCE_COLUMNS = {
    "pan": "pan_enc",
    "aadhaar": "aadhaar_enc",
    "pf_number": "pf_number_enc",
    "uan_number": "uan_number_enc",
}


async def update_compliance(
    session: AsyncSession,
    *,
    employee_id: str,
    changes: dict[str, Any],
    actor: str,
    ip: Optional[str],
) -> int:
    """Encrypt incoming PII; audit logs record the change without the value."""
    row = await _get_or_create(session, EmployeeCompliance, employee_id)
    count = 0
    for field, plain in changes.items():
        col = _COMPLIANCE_COLUMNS[field]
        had_value = bool(getattr(row, col))
        new_cipher = encryption.encrypt(plain)
        will_have = bool(new_cipher)
        setattr(row, col, new_cipher)
        # Never log the plaintext or ciphertext — only that it changed.
        audit.record_event(
            session,
            employee_id=employee_id,
            section="compliance",
            field_name=field,
            performed_by_person_id=actor,
            old_value=("set" if had_value else "empty"),
            new_value=("set" if will_have else "cleared"),
            ip_address=ip,
        )
        count += 1
    row.updated_at = datetime.utcnow()
    row.updated_by_person_id = actor
    return count


def read_compliance(row: Optional[EmployeeCompliance]) -> dict[str, Optional[str]]:
    if row is None:
        return {"pan": None, "aadhaar": None, "pf_number": None, "uan_number": None}
    return {
        "pan": encryption.decrypt(row.pan_enc),
        "aadhaar": encryption.decrypt(row.aadhaar_enc),
        "pf_number": encryption.decrypt(row.pf_number_enc),
        "uan_number": encryption.decrypt(row.uan_number_enc),
    }


async def update_status(
    session: AsyncSession,
    *,
    ext: EmployeeExt,
    employment_status: str,
    exit_date,
    actor: str,
    ip: Optional[str],
) -> int:
    old = ext.employment_status
    if old == employment_status and exit_date is None:
        return 0
    audit.record_event(
        session,
        employee_id=ext.id,
        section="status",
        field_name="employment_status",
        performed_by_person_id=actor,
        old_value=old,
        new_value=employment_status,
        ip_address=ip,
    )
    ext.employment_status = employment_status
    ext.updated_at = datetime.utcnow()
    ext.updated_by_person_id = actor
    if exit_date is not None:
        work = await _get_or_create(session, EmployeeWorkInfo, ext.id)
        work.exit_date = exit_date
    return 1


async def soft_delete(
    session: AsyncSession, *, ext: EmployeeExt, actor: str, ip: Optional[str]
) -> None:
    audit.record_event(
        session,
        employee_id=ext.id,
        section="status",
        field_name="is_deleted",
        performed_by_person_id=actor,
        old_value="false",
        new_value="true",
        ip_address=ip,
    )
    ext.is_deleted = True
    ext.updated_at = datetime.utcnow()
    ext.updated_by_person_id = actor
