from __future__ import annotations

import math
from collections import deque
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.planner import PlannerActivityDependency, SLProjectPlannerRow


def _duration_days(row: SLProjectPlannerRow) -> int:
    if row.duration_days is not None:
        return max(1, int(math.ceil(float(row.duration_days))))
    if row.live_start_date and row.live_end_date:
        return max(1, (row.live_end_date - row.live_start_date).days + 1)
    if row.baseline_start_date and row.baseline_end_date:
        return max(1, (row.baseline_end_date - row.baseline_start_date).days + 1)
    return 1


def _start_anchor(row: SLProjectPlannerRow, project_start: date) -> date:
    return row.live_start_date or row.baseline_start_date or row.scheduled_start_date or project_start


def _ordinal(value: date) -> int:
    return value.toordinal()


def _from_ordinal(value: int) -> date:
    return date.fromordinal(value)


@dataclass
class ScheduleResult:
    recalculated_rows: int
    critical_rows: int
    updated_dependency_codes: int
    ran_at: datetime


async def recalculate_project_schedule(session: AsyncSession, project_code: str) -> ScheduleResult:
    rows = (
        await session.execute(
            select(SLProjectPlannerRow).where(
                SLProjectPlannerRow.project_code == project_code,
                SLProjectPlannerRow.is_deleted == 0,
            )
        )
    ).scalars().all()
    if not rows:
        return ScheduleResult(0, 0, 0, datetime.utcnow())

    dependencies = (
        await session.execute(
            select(PlannerActivityDependency).where(PlannerActivityDependency.project_code == project_code)
        )
    ).scalars().all()

    row_map = {row.planner_row_id: row for row in rows}
    indegree = {row.planner_row_id: 0 for row in rows}
    outgoing: dict[int, list[PlannerActivityDependency]] = {row.planner_row_id: [] for row in rows}
    incoming: dict[int, list[PlannerActivityDependency]] = {row.planner_row_id: [] for row in rows}

    for dependency in dependencies:
        if dependency.planner_row_id not in row_map or dependency.predecessor_row_id not in row_map:
            continue
        indegree[dependency.planner_row_id] += 1
        outgoing[dependency.predecessor_row_id].append(dependency)
        incoming[dependency.planner_row_id].append(dependency)

    anchors = [
        min(
            value
            for value in [row.live_start_date, row.baseline_start_date, row.scheduled_start_date]
            if value is not None
        )
        for row in rows
        if any([row.live_start_date, row.baseline_start_date, row.scheduled_start_date])
    ]
    project_start = min(anchors) if anchors else date.today()

    queue = deque([row_id for row_id, degree in indegree.items() if degree == 0])
    order: list[int] = []
    while queue:
        current = queue.popleft()
        order.append(current)
        for edge in outgoing[current]:
            indegree[edge.planner_row_id] -= 1
            if indegree[edge.planner_row_id] == 0:
                queue.append(edge.planner_row_id)

    if len(order) != len(rows):
        raise ValueError(f"Dependency cycle detected in project {project_code}")

    early_start: dict[int, int] = {}
    early_finish: dict[int, int] = {}

    for row_id in order:
        row = row_map[row_id]
        duration = _duration_days(row)
        candidate_start = _ordinal(_start_anchor(row, project_start))
        for edge in incoming[row_id]:
            predecessor = row_map[edge.predecessor_row_id]
            pred_start = early_start[predecessor.planner_row_id]
            pred_finish = early_finish[predecessor.planner_row_id]
            lag = int(math.ceil(float(edge.lag_days or 0)))
            if edge.dependency_type == "finish_to_start":
                candidate_start = max(candidate_start, pred_finish + lag + 1)
            elif edge.dependency_type == "start_to_start":
                candidate_start = max(candidate_start, pred_start + lag)
            elif edge.dependency_type == "finish_to_finish":
                candidate_start = max(candidate_start, pred_finish + lag - duration + 1)
            elif edge.dependency_type == "start_to_finish":
                candidate_start = max(candidate_start, pred_start + lag - duration + 1)
        early_start[row_id] = candidate_start
        early_finish[row_id] = candidate_start + duration - 1

    project_finish = max(early_finish.values())
    late_start: dict[int, int] = {}
    late_finish: dict[int, int] = {}

    for row_id in reversed(order):
        row = row_map[row_id]
        duration = _duration_days(row)
        if not outgoing[row_id]:
            late_finish[row_id] = project_finish
            late_start[row_id] = project_finish - duration + 1
            continue

        candidate_finish = project_finish
        candidate_start = project_finish - duration + 1
        for edge in outgoing[row_id]:
            successor = edge.planner_row_id
            lag = int(math.ceil(float(edge.lag_days or 0)))
            if edge.dependency_type == "finish_to_start":
                candidate_finish = min(candidate_finish, late_start[successor] - lag - 1)
            elif edge.dependency_type == "start_to_start":
                candidate_start = min(candidate_start, late_start[successor] - lag)
                candidate_finish = candidate_start + duration - 1
            elif edge.dependency_type == "finish_to_finish":
                candidate_finish = min(candidate_finish, late_finish[successor] - lag)
            elif edge.dependency_type == "start_to_finish":
                candidate_start = min(candidate_start, late_finish[successor] - lag - duration + 1)
                candidate_finish = candidate_start + duration - 1
        late_finish[row_id] = candidate_finish
        late_start[row_id] = candidate_finish - duration + 1

    updated_dependency_codes = 0
    ran_at = datetime.utcnow()

    for row in rows:
        preds = sorted(str(edge.predecessor_row_id) for edge in incoming[row.planner_row_id])
        dependency_codes = ",".join(preds) if preds else None
        if row.dependency_codes != dependency_codes:
            row.dependency_codes = dependency_codes
            updated_dependency_codes += 1

        row.scheduled_start_date = _from_ordinal(early_start[row.planner_row_id])
        row.scheduled_end_date = _from_ordinal(early_finish[row.planner_row_id])
        float_value = Decimal(str(max(0, late_start[row.planner_row_id] - early_start[row.planner_row_id])))
        row.float_days = float_value
        row.is_critical = 1 if float_value == Decimal("0") else 0
        row.last_schedule_run_at = ran_at
        if row.schedule_mode == "auto" or row.live_start_date is None:
            row.live_start_date = row.scheduled_start_date
        if row.schedule_mode == "auto" or row.live_end_date is None:
            row.live_end_date = row.scheduled_end_date

    await session.flush()
    return ScheduleResult(
        recalculated_rows=len(rows),
        critical_rows=sum(1 for row in rows if row.is_critical),
        updated_dependency_codes=updated_dependency_codes,
        ran_at=ran_at,
    )
