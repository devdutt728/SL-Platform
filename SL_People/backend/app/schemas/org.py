"""Pydantic schemas for the group-based org chart (Phase 3).

The live tree mirrors Code.gs getPeopleData_: principals -> groups ->
{leadDetails, members}. A "move" changes a person's group_key (everything else
is derived from the group). Drafts hold a moves diff + a full snapshot for
preview/revert.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


# ── Live tree ─────────────────────────────────────────────────────────────────
class OrgPerson(BaseModel):
    employee_no: str
    name: str
    email: Optional[str] = None
    title: Optional[str] = None
    group_key: str
    group_name: str
    principal: str
    designation_level: Optional[str] = None
    designation_color: Optional[str] = None
    designation_order: Optional[int] = None
    sl_exp_years: Optional[float] = None
    o_exp_years: Optional[float] = None
    sl_exp_display: str = "—"
    o_exp_display: str = "—"
    license_count: int = 0
    image_url: Optional[str] = None
    source_manager_emp: Optional[str] = None
    manager_override_emp: Optional[str] = None
    include_in_org: bool = True


class OrgGroupNode(BaseModel):
    key: str
    name: str
    principal: str
    lead_name: Optional[str] = None
    lead: Optional[OrgPerson] = None
    color: Optional[str] = None
    sort: int = 0
    members: list[OrgPerson] = []


class OrgPrincipalNode(BaseModel):
    name: str
    color: str
    employee_no: Optional[str] = None
    employee_count: int = 0
    group_count: int = 0
    groups: list[OrgGroupNode] = []


class OrgLive(BaseModel):
    principals: list[OrgPrincipalNode]
    generated_at: datetime
    source: str  # "snapshot" (from changelog) | "live" (built from tables)
    last_log_id: Optional[str] = None


# ── Reference lists ───────────────────────────────────────────────────────────
class GroupInfo(BaseModel):
    group_key: str
    name: str
    principal_name: str
    team_lead_emp: Optional[str] = None
    parent_name: Optional[str] = None
    color_hex: Optional[str] = None
    sort_order: int = 0
    is_active: bool = True


class PrincipalInfo(BaseModel):
    name: str
    color: str
    employee_no: Optional[str] = None
    sort_order: int = 0


# ── Mutations ─────────────────────────────────────────────────────────────────
class GroupCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    group_key: str
    name: str
    principal_name: str
    team_lead_emp: Optional[str] = None
    parent_name: Optional[str] = None
    color_hex: Optional[str] = None
    sort_order: int = 0
    is_active: bool = True


class GroupPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    group_key: Optional[str] = None
    name: Optional[str] = None
    principal_name: Optional[str] = None
    team_lead_emp: Optional[str] = None
    parent_name: Optional[str] = None
    color_hex: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


class MoveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    empNo: str
    newGroupKey: str


class MoveResult(BaseModel):
    ok: bool
    name: str
    team: str


class IncludeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    include_in_org: bool


class OverrideRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    manager_override_emp: Optional[str] = None


# ── Drafts ────────────────────────────────────────────────────────────────────
class DraftMove(BaseModel):
    empNo: str
    name: str
    fromGroupKey: Optional[str] = None
    fromPrincipal: Optional[str] = None
    toGroupKey: str
    toPrincipal: Optional[str] = None


class DraftPut(BaseModel):
    model_config = ConfigDict(extra="forbid")
    draft_name: str
    moves_json: list[DraftMove]
    full_snapshot: dict


class DraftState(BaseModel):
    slot_number: int
    draft_name: Optional[str] = None
    moves_count: int = 0
    status: str = "empty"  # empty | active | archived
    updated_by: Optional[str] = None
    updated_at: Optional[datetime] = None


class DraftDetail(BaseModel):
    slot_number: int
    draft_name: str
    moves_json: list[DraftMove]
    full_snapshot: dict
    status: str
    updated_at: Optional[datetime] = None


# ── Publish / changelog ───────────────────────────────────────────────────────
class PublishRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    confirm: bool = True


class ChangeLogItem(BaseModel):
    id: str
    action: str
    performed_by_person_id: str
    performed_at: datetime
    draft_name: Optional[str] = None
    changes_count: int = 0


class ChangeLogList(BaseModel):
    items: list[ChangeLogItem]
    total: int
    page: int
    limit: int


class ChangeLogDetail(BaseModel):
    id: str
    action: str
    performed_by_person_id: str
    performed_at: datetime
    draft_name: Optional[str] = None
    diff_summary: list[DraftMove] = []
    snapshot_after: dict
