"""Immutable field-change audit logging for employee records.

Every PATCH diffs the incoming partial update against current values and inserts
one employee_audit_log row per changed field. Compliance reads are logged too
(section='compliance', field_name='compliance_viewed').
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.people import EmployeeAuditLog


def _stringify(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return str(value)


def diff_fields(current: dict[str, Any], changes: dict[str, Any]) -> dict[str, tuple[Optional[str], Optional[str]]]:
    """Return {field: (old_str, new_str)} for fields whose value actually changes.

    Only keys present in `changes` are considered (partial update). Fields whose
    new value equals the current value are skipped — no audit noise.
    """
    out: dict[str, tuple[Optional[str], Optional[str]]] = {}
    for field, new_value in changes.items():
        old_value = current.get(field)
        old_s = _stringify(old_value)
        new_s = _stringify(new_value)
        if old_s != new_s:
            out[field] = (old_s, new_s)
    return out


def record_changes(
    session: AsyncSession,
    *,
    employee_id: str,
    section: str,
    diffs: dict[str, tuple[Optional[str], Optional[str]]],
    performed_by_person_id: str,
    ip_address: Optional[str] = None,
) -> int:
    """Stage one audit row per diffed field. Caller commits. Returns row count."""
    count = 0
    for field_name, (old_value, new_value) in diffs.items():
        session.add(
            EmployeeAuditLog(
                employee_id=employee_id,
                performed_by_person_id=performed_by_person_id,
                section=section,
                field_name=field_name,
                old_value=old_value,
                new_value=new_value,
                ip_address=ip_address,
            )
        )
        count += 1
    return count


def record_event(
    session: AsyncSession,
    *,
    employee_id: str,
    section: str,
    field_name: str,
    performed_by_person_id: str,
    old_value: Optional[str] = None,
    new_value: Optional[str] = None,
    ip_address: Optional[str] = None,
) -> None:
    """Stage a single audit row for a non-field event (e.g. compliance_viewed)."""
    session.add(
        EmployeeAuditLog(
            employee_id=employee_id,
            performed_by_person_id=performed_by_person_id,
            section=section,
            field_name=field_name,
            old_value=old_value,
            new_value=new_value,
            ip_address=ip_address,
        )
    )
