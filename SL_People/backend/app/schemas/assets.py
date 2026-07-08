from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class SystemInventoryItem(BaseModel):
    id: str
    system_id: str
    system_type: Optional[str] = None
    assigned_email: Optional[str] = None
    user_display: Optional[str] = None
    team: Optional[str] = None
    group_key: Optional[str] = None
    processor: Optional[str] = None
    ram_gb: Optional[float] = None
    ram_slots_free: Optional[str] = None
    graphics_card: Optional[str] = None
    cpu_cores: Optional[str] = None
    storage: Optional[str] = None
    motherboard: Optional[str] = None
    os: Optional[str] = None
    autocad_version: Optional[str] = None
    sketchup_version: Optional[str] = None
    threedmax_version: Optional[str] = None
    rhino_version: Optional[str] = None
    enscape_version: Optional[str] = None
    d5_render: Optional[str] = None
    adobe_versions: Optional[str] = None
    office_version: Optional[str] = None
    antivirus: Optional[str] = None
    purchase_date: Optional[date] = None
    vendor: Optional[str] = None
    service_tag: Optional[str] = None
    serial_no: Optional[str] = None
    composite_score: Optional[int] = None
    capability_tier: Optional[str] = None
    upgrade_suggestion: Optional[str] = None
    status: str = "Active"
    notes: Optional[str] = None
    updated_at: Optional[datetime] = None


class SystemInventoryListResponse(BaseModel):
    items: list[SystemInventoryItem]
    total: int
    tier_counts: dict[str, int]
    page: int
    limit: int


class SystemGradePreviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    processor: Optional[str] = None
    graphics_card: Optional[str] = None
    ram_gb: Optional[float] = None


class SystemGradePreviewResponse(BaseModel):
    cpu_score: int
    gpu_score: int
    ram_score: int
    ram_gb: int
    score: int
    tier: str
    capability: str
    suggestion: str


class SystemInventoryCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    system_id: str
    system_type: Optional[str] = "Desktop"
    assigned_email: Optional[str] = None
    user_display: Optional[str] = None
    team: Optional[str] = None
    group_key: Optional[str] = None
    processor: Optional[str] = None
    ram_gb: Optional[float] = None
    ram_slots_free: Optional[str] = None
    graphics_card: Optional[str] = None
    cpu_cores: Optional[str] = None
    storage: Optional[str] = None
    motherboard: Optional[str] = None
    os: Optional[str] = None
    autocad_version: Optional[str] = None
    sketchup_version: Optional[str] = None
    threedmax_version: Optional[str] = None
    rhino_version: Optional[str] = None
    enscape_version: Optional[str] = None
    d5_render: Optional[str] = None
    adobe_versions: Optional[str] = None
    office_version: Optional[str] = None
    antivirus: Optional[str] = None
    purchase_date: Optional[date] = None
    vendor: Optional[str] = None
    service_tag: Optional[str] = None
    serial_no: Optional[str] = None
    status: str = "Active"
    notes: Optional[str] = None


class SystemInventoryPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    system_id: Optional[str] = None
    system_type: Optional[str] = None
    assigned_email: Optional[str] = None
    user_display: Optional[str] = None
    team: Optional[str] = None
    group_key: Optional[str] = None
    processor: Optional[str] = None
    ram_gb: Optional[float] = None
    ram_slots_free: Optional[str] = None
    graphics_card: Optional[str] = None
    cpu_cores: Optional[str] = None
    storage: Optional[str] = None
    motherboard: Optional[str] = None
    os: Optional[str] = None
    autocad_version: Optional[str] = None
    sketchup_version: Optional[str] = None
    threedmax_version: Optional[str] = None
    rhino_version: Optional[str] = None
    enscape_version: Optional[str] = None
    d5_render: Optional[str] = None
    adobe_versions: Optional[str] = None
    office_version: Optional[str] = None
    antivirus: Optional[str] = None
    purchase_date: Optional[date] = None
    vendor: Optional[str] = None
    service_tag: Optional[str] = None
    serial_no: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class PeripheralInventoryItem(BaseModel):
    id: str
    item_id: str
    category: Optional[str] = None
    item: str
    model: Optional[str] = None
    serial: Optional[str] = None
    quantity: int = 1
    condition: Optional[str] = None
    location: Optional[str] = None
    assigned_to: Optional[str] = None
    status: str = "Active"
    notes: Optional[str] = None
    updated_at: Optional[datetime] = None


class PeripheralInventoryListResponse(BaseModel):
    items: list[PeripheralInventoryItem]
    total: int
    page: int
    limit: int


class PeripheralInventoryCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    item_id: str
    category: Optional[str] = None
    item: str
    model: Optional[str] = None
    serial: Optional[str] = None
    quantity: int = 1
    condition: Optional[str] = None
    location: Optional[str] = None
    assigned_to: Optional[str] = None
    status: str = "Active"
    notes: Optional[str] = None


class PeripheralInventoryPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    item_id: Optional[str] = None
    category: Optional[str] = None
    item: Optional[str] = None
    model: Optional[str] = None
    serial: Optional[str] = None
    quantity: Optional[int] = None
    condition: Optional[str] = None
    location: Optional[str] = None
    assigned_to: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class GroupMemberSystem(BaseModel):
    system_id: str
    tier: Optional[str] = None
    grade_score: Optional[int] = None
    processor: Optional[str] = None
    ram_gb: Optional[float] = None
    gpu: Optional[str] = None
    upgrade_suggestion: Optional[str] = None
    status: str = "Active"
    autocad_version: Optional[str] = None
    sketchup_version: Optional[str] = None
    threedmax_version: Optional[str] = None
    rhino_version: Optional[str] = None
    enscape_version: Optional[str] = None
    d5_render: Optional[str] = None
    adobe_versions: Optional[str] = None
    office_version: Optional[str] = None


class GroupMemberOverview(BaseModel):
    employee_no: str
    name: str
    email: Optional[str] = None
    title: Optional[str] = None
    designation_level: Optional[str] = None
    designation_color: Optional[str] = None
    licence_count: int = 0
    licences: list[str] = []
    system: Optional[GroupMemberSystem] = None


class GroupOverviewItem(BaseModel):
    key: str
    name: str
    principal: str
    team_lead: Optional[str] = None
    headcount: int = 0
    system_count: int = 0
    system_ids: list[str] = []
    tool_counts: dict[str, int] = {}
    tier_counts: dict[str, int] = {}
    total_licences: int = 0
    members: list[GroupMemberOverview] = []
    color: Optional[str] = None


class GroupOverviewResponse(BaseModel):
    items: list[GroupOverviewItem]
    tools: list[str]
    tiers: list[str]


class ReconciliationIssue(BaseModel):
    severity: str
    module: str
    entity_type: str
    entity_key: str
    person_id: Optional[str] = None
    employee_no: Optional[str] = None
    email: Optional[str] = None
    name: Optional[str] = None
    issue: str
    detail: str
    correction_point: Optional[str] = None
    recommended_action: str


class ReconciliationSummary(BaseModel):
    total_people: int = 0
    org_people: int = 0
    systems: int = 0
    active_license_assignments: int = 0
    peripherals: int = 0
    issue_count: int = 0
    critical_count: int = 0
    warning_count: int = 0
    info_count: int = 0


class ReconciliationResponse(BaseModel):
    summary: ReconciliationSummary
    issues: list[ReconciliationIssue]
