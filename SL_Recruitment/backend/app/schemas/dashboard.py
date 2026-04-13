from __future__ import annotations

from pydantic import BaseModel


class StageCount(BaseModel):
    stage: str
    count: int


class AssignmentWorkloadOut(BaseModel):
    assignee_key: str
    assignee_name: str
    assignee_email: str | None = None
    assigned_count: int
    active_count: int


class AssignmentSummaryOut(BaseModel):
    default_hr_owner: AssignmentWorkloadOut
    hr_assigned_count: int
    hr_unassigned_count: int
    l2_assigned_count: int
    l2_unassigned_count: int
    interviewer_assigned_count: int
    interviewer_unassigned_count: int
    fully_unassigned_count: int
    hr_workloads: list[AssignmentWorkloadOut]
    l2_workloads: list[AssignmentWorkloadOut]
    interviewer_workloads: list[AssignmentWorkloadOut]


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
    assignment_summary: AssignmentSummaryOut

