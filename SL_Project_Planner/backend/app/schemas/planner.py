from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, Field

PlannerRoleCode = Literal["super_admin", "principal", "group_leader", "project_anchor", "senior_architect", "architect", "viewer"]
PlannerLayer = Literal["contract_baseline", "live_plan", "approved_change"]
PlannerSourceType = Literal["contract", "approved_change", "internal"]
PlannerChangeType = Literal["none", "added", "modified", "removed"]
PlannerStatus = Literal["not_started", "in_progress", "to_be_checked", "completed", "hold"]
PlannerApprovalStatus = Literal["not_required", "pending", "approved", "rejected"]
PlannerPriority = Literal["low", "medium", "high"]
PlannerScheduleMode = Literal["manual", "auto"]
PlannerDependencyType = Literal["finish_to_start", "start_to_start", "finish_to_finish", "start_to_finish"]
PlannerRequestType = Literal["scope", "schedule", "assignment", "status", "delete", "document"]
PlannerRequestStatus = Literal["pending", "approved", "rejected", "cancelled"]
PlannerDocumentCategory = Literal["contract", "drawing", "submission", "minutes", "reference", "change_request", "general"]
PlannerDocumentStatus = Literal["draft", "active", "superseded", "archived"]
PlannerBaselineType = Literal["contract", "approved_change", "working_snapshot"]


class PlannerActorOut(BaseModel):
    person_id_platform: str | None = None
    full_name: str | None = None
    planner_role: PlannerRoleCode = "viewer"
    planner_roles: list[PlannerRoleCode] = Field(default_factory=lambda: ["viewer"])
    can_view_all: bool = False
    can_create: bool = False
    can_create_project: bool = False
    can_edit_scoped: bool = False
    can_edit_assigned: bool = False
    can_approve_architect: bool = False
    can_approve_senior_architect: bool = False
    can_soft_delete: bool = False
    can_hard_delete: bool = False


class PlannerProjectOut(BaseModel):
    project_code: str
    project_name: str


class PlannerSummaryOut(BaseModel):
    total_rows: int = 0
    pending_rows: int = 0
    completed_rows: int = 0
    pending_approvals: int = 0
    live_rows: int = 0
    contract_rows: int = 0
    approved_change_rows: int = 0
    critical_rows: int = 0
    attached_documents: int = 0


class PlannerRowBase(BaseModel):
    project_code: str
    project_name: str
    contract_reference: str | None = None
    discipline_code: str | None = None
    stage_code: str | None = None
    package_code: str | None = None
    activity_code: str
    activity_title: str
    activity_description: str | None = None
    plan_layer: PlannerLayer = "live_plan"
    source_type: PlannerSourceType = "contract"
    change_type: PlannerChangeType = "none"
    change_reason: str | None = None
    activity_status: PlannerStatus = "not_started"
    approval_status: PlannerApprovalStatus = "not_required"
    approval_note: str | None = None
    priority: PlannerPriority = "medium"
    baseline_start_date: date | None = None
    baseline_end_date: date | None = None
    live_start_date: date | None = None
    live_end_date: date | None = None
    actual_start_date: date | None = None
    actual_end_date: date | None = None
    duration_days: Decimal | None = None
    percent_complete: Decimal = Field(default=Decimal("0.00"))
    dependency_codes: str | None = None
    schedule_mode: PlannerScheduleMode = "manual"
    group_leader_person_id: str | None = None
    project_anchor_person_id: str | None = None
    senior_architect_person_id: str | None = None
    assigned_to_person_id: str | None = None
    requested_by_person_id: str | None = None


class PlannerRowCreate(PlannerRowBase):
    pass


class PlannerRowUpdate(BaseModel):
    project_name: str | None = None
    contract_reference: str | None = None
    discipline_code: str | None = None
    stage_code: str | None = None
    package_code: str | None = None
    activity_title: str | None = None
    activity_description: str | None = None
    plan_layer: PlannerLayer | None = None
    source_type: PlannerSourceType | None = None
    change_type: PlannerChangeType | None = None
    change_reason: str | None = None
    activity_status: PlannerStatus | None = None
    priority: PlannerPriority | None = None
    baseline_start_date: date | None = None
    baseline_end_date: date | None = None
    live_start_date: date | None = None
    live_end_date: date | None = None
    actual_start_date: date | None = None
    actual_end_date: date | None = None
    duration_days: Decimal | None = None
    percent_complete: Decimal | None = None
    dependency_codes: str | None = None
    schedule_mode: PlannerScheduleMode | None = None
    group_leader_person_id: str | None = None
    project_anchor_person_id: str | None = None
    senior_architect_person_id: str | None = None
    assigned_to_person_id: str | None = None


class PlannerDecisionIn(BaseModel):
    approval_note: str | None = None


class PlannerRowOut(PlannerRowBase):
    planner_row_id: int
    approved_by_person_id: str | None = None
    approval_requested_at: datetime | None = None
    approval_action_at: datetime | None = None
    scheduled_start_date: date | None = None
    scheduled_end_date: date | None = None
    float_days: Decimal | None = None
    is_critical: int = 0
    last_schedule_run_at: datetime | None = None
    is_deleted: int = 0
    deleted_at: datetime | None = None
    created_by_person_id: str | None = None
    updated_by_person_id: str | None = None
    created_at: datetime
    updated_at: datetime
    group_leader_name: str | None = None
    project_anchor_name: str | None = None
    senior_architect_name: str | None = None
    assigned_to_name: str | None = None
    requested_by_name: str | None = None
    approved_by_name: str | None = None
    requester_role: PlannerRoleCode | None = None
    requester_roles: list[PlannerRoleCode] = Field(default_factory=list)
    can_edit: bool = False
    can_delete: bool = False
    can_approve: bool = False
    can_reject: bool = False


class PlannerBoardOut(BaseModel):
    actor: PlannerActorOut
    projects: list[PlannerProjectOut] = Field(default_factory=list)
    summary: PlannerSummaryOut = Field(default_factory=PlannerSummaryOut)
    items: list[PlannerRowOut] = Field(default_factory=list)


class PlannerAssignableMemberOut(BaseModel):
    person_id: str
    person_code: str | None = None
    full_name: str
    email: str | None = None
    assigned_group_id: int | None = None
    assigned_group_name: str | None = None


class PlannerAssignmentWorkspaceOut(BaseModel):
    project_code: str | None = None
    can_assign: bool = False
    assignable_members: list[PlannerAssignableMemberOut] = Field(default_factory=list)
    my_total_assigned_tasks: int = 0
    my_open_assigned_tasks: int = 0


class PlannerDependencyCreate(BaseModel):
    predecessor_row_id: int
    dependency_type: PlannerDependencyType = "finish_to_start"
    lag_days: Decimal = Field(default=Decimal("0.00"))


class PlannerDependencyOut(BaseModel):
    dependency_id: int
    project_code: str
    planner_row_id: int
    predecessor_row_id: int
    dependency_type: PlannerDependencyType
    lag_days: Decimal
    created_by_person_id: str | None = None
    updated_by_person_id: str | None = None
    created_at: datetime
    updated_at: datetime


class PlannerChangeRequestCreate(BaseModel):
    request_type: PlannerRequestType = "schedule"
    request_reason: str
    proposed_updates: dict[str, Any] = Field(default_factory=dict)


class PlannerChangeRequestOut(BaseModel):
    request_id: int
    planner_row_id: int | None = None
    project_code: str
    request_type: PlannerRequestType
    request_status: PlannerRequestStatus
    requested_by_person_id: str | None = None
    requester_role: str | None = None
    approver_person_id: str | None = None
    approver_role: str | None = None
    request_reason: str | None = None
    approval_note: str | None = None
    before_json: str | None = None
    proposed_json: str | None = None
    decided_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class PlannerAuditLogOut(BaseModel):
    audit_log_id: int
    planner_row_id: int | None = None
    project_code: str
    entity_type: str
    entity_id: str
    action_type: str
    change_summary: str | None = None
    before_json: str | None = None
    after_json: str | None = None
    request_id: int | None = None
    actor_person_id: str | None = None
    actor_role: str | None = None
    created_at: datetime


class PlannerDocumentCreate(BaseModel):
    document_code: str | None = None
    title: str
    category: PlannerDocumentCategory = "general"
    discipline_code: str | None = None
    version_note: str | None = None
    document_id: int | None = None


class PlannerDocumentVersionOut(BaseModel):
    document_version_id: int
    document_id: int
    version_no: int
    original_filename: str
    stored_filename: str
    mime_type: str | None = None
    file_size_bytes: int | None = None
    storage_path: str
    checksum_sha256: str | None = None
    version_note: str | None = None
    uploaded_by_person_id: str | None = None
    uploaded_at: datetime


class PlannerDocumentOut(BaseModel):
    document_id: int
    planner_row_id: int | None = None
    project_code: str
    document_code: str
    title: str
    discipline_code: str | None = None
    category: PlannerDocumentCategory
    current_version_no: int
    status: PlannerDocumentStatus
    created_by_person_id: str | None = None
    updated_by_person_id: str | None = None
    created_at: datetime
    updated_at: datetime
    versions: list[PlannerDocumentVersionOut] = Field(default_factory=list)


class PlannerBaselineCreate(BaseModel):
    baseline_name: str
    baseline_type: PlannerBaselineType = "working_snapshot"


class PlannerBaselineOut(BaseModel):
    baseline_id: int
    project_code: str
    baseline_name: str
    baseline_type: PlannerBaselineType
    snapshot_json: str
    created_by_person_id: str | None = None
    created_at: datetime


class PlannerScheduleRunOut(BaseModel):
    project_code: str
    recalculated_rows: int
    critical_rows: int
    updated_dependency_codes: int
    ran_at: datetime
