from __future__ import annotations

import json
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.planner import PlannerAuditLog


def _json_default(value: Any):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    return str(value)


def dumps_json(value: Any) -> str:
    return json.dumps(value, default=_json_default, ensure_ascii=True, sort_keys=True)


def planner_row_snapshot(row: Any) -> dict[str, Any]:
    return {
        "planner_row_id": row.planner_row_id,
        "project_code": row.project_code,
        "project_name": row.project_name,
        "contract_reference": row.contract_reference,
        "discipline_code": row.discipline_code,
        "stage_code": row.stage_code,
        "package_code": row.package_code,
        "activity_code": row.activity_code,
        "activity_title": row.activity_title,
        "activity_description": row.activity_description,
        "plan_layer": row.plan_layer,
        "source_type": row.source_type,
        "change_type": row.change_type,
        "change_reason": row.change_reason,
        "activity_status": row.activity_status,
        "approval_status": row.approval_status,
        "approval_note": row.approval_note,
        "priority": row.priority,
        "baseline_start_date": row.baseline_start_date,
        "baseline_end_date": row.baseline_end_date,
        "live_start_date": row.live_start_date,
        "live_end_date": row.live_end_date,
        "actual_start_date": row.actual_start_date,
        "actual_end_date": row.actual_end_date,
        "duration_days": row.duration_days,
        "percent_complete": row.percent_complete,
        "dependency_codes": row.dependency_codes,
        "schedule_mode": row.schedule_mode,
        "scheduled_start_date": row.scheduled_start_date,
        "scheduled_end_date": row.scheduled_end_date,
        "float_days": row.float_days,
        "is_critical": row.is_critical,
        "last_schedule_run_at": row.last_schedule_run_at,
        "group_leader_person_id": row.group_leader_person_id,
        "project_anchor_person_id": getattr(row, "project_anchor_person_id", None),
        "senior_architect_person_id": row.senior_architect_person_id,
        "assigned_to_person_id": row.assigned_to_person_id,
        "requested_by_person_id": row.requested_by_person_id,
        "approved_by_person_id": row.approved_by_person_id,
        "is_deleted": row.is_deleted,
    }


async def log_audit_event(
    session: AsyncSession,
    *,
    project_code: str,
    entity_type: str,
    entity_id: str,
    action_type: str,
    actor_person_id: str | None,
    actor_role: str | None,
    planner_row_id: int | None = None,
    change_summary: str | None = None,
    before_payload: Any = None,
    after_payload: Any = None,
    request_id: int | None = None,
) -> PlannerAuditLog:
    entry = PlannerAuditLog(
        planner_row_id=planner_row_id,
        project_code=project_code,
        entity_type=entity_type,
        entity_id=entity_id,
        action_type=action_type,
        change_summary=change_summary,
        before_json=dumps_json(before_payload) if before_payload is not None else None,
        after_json=dumps_json(after_payload) if after_payload is not None else None,
        request_id=request_id,
        actor_person_id=actor_person_id,
        actor_role=actor_role,
    )
    session.add(entry)
    await session.flush()
    return entry
