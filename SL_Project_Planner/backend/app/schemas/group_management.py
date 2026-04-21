from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class GroupSummaryOut(BaseModel):
    group_id: int
    group_code: str
    group_name: str
    status: str | None = None
    group_leader_person_id: str | None = None
    group_leader_name: str | None = None
    member_count: int = 0


class GroupPersonOut(BaseModel):
    person_id: str
    person_code: str | None = None
    full_name: str
    email: str
    status: str | None = None
    department: str | None = None
    sub_department: str | None = None
    job_title: str | None = None
    assigned_group_id: int | None = None
    assigned_group_name: str | None = None
    already_member: bool = False


class GroupMemberLogOut(BaseModel):
    log_id: int
    group_id: int
    person_id: str
    person_name: str | None = None
    action_code: str
    reason: str | None = None
    actor_person_id: str | None = None
    actor_name: str | None = None
    created_at: datetime | None = None


class GroupWorkspaceOut(BaseModel):
    can_manage_all_groups: bool = False
    groups: list[GroupSummaryOut]
    selected_group_id: int | None = None
    members: list[GroupPersonOut]
    candidates: list[GroupPersonOut]
    membership_logs: list[GroupMemberLogOut]


class GroupMemberAddIn(BaseModel):
    person_id: str
    reason: str | None = None


class GroupMemberMutationOut(BaseModel):
    group_id: int
    person_id: str
    action_code: str
    member_count: int


class GroupLeaderAssignIn(BaseModel):
    person_id: str | None = None
    reason: str | None = None


class GroupLeaderAssignOut(BaseModel):
    group_id: int
    group_leader_person_id: str | None = None


class GroupLeaderCandidateOut(BaseModel):
    person_id: str
    person_code: str | None = None
    full_name: str
    email: str
    status: str | None = None
    department: str | None = None
    sub_department: str | None = None
    job_title: str | None = None
    planner_access: bool = False
    planner_roles: list[str] = []
