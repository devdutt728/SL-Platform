from __future__ import annotations

from pydantic import BaseModel

from app.schemas.planner import PlannerRoleCode


class PlannerRoleAssignmentToggleIn(BaseModel):
    enabled: bool


class PlannerRoleAssignmentOut(BaseModel):
    person_id: str
    person_code: str | None = None
    full_name: str
    email: str
    status: str | None = None
    is_deleted: int | None = None
    department: str | None = None
    sub_department: str | None = None
    job_title: str | None = None
    planner_access: bool = False
    inferred_roles: list[PlannerRoleCode]
    explicit_roles: list[PlannerRoleCode]
    effective_roles: list[PlannerRoleCode]


class PlannerRoleAssignmentSetOut(BaseModel):
    person_id: str
    role_code: PlannerRoleCode
    enabled: bool
    effective_roles: list[PlannerRoleCode]
