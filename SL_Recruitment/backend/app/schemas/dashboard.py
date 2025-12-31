from __future__ import annotations

from pydantic import BaseModel


class StageCount(BaseModel):
    stage: str
    count: int


class DashboardMetricsOut(BaseModel):
    total_applications_received: int
    total_active_candidates: int
    new_candidates_last_7_days: int
    new_applications_today: int
    caf_submitted_today: int
    openings_count: int
    needs_review_amber: int
    stuck_in_stage_over_days: int
    caf_pending_overdue: int
    feedback_pending: int
    sprints_overdue: int
    offers_awaiting_response: int
    candidates_per_stage: list[StageCount]

