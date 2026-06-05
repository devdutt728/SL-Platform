from __future__ import annotations

from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict

LicenseHolderKind = Literal["person", "shared", "unassigned"]


class LicenseAssignmentItem(BaseModel):
    id: str
    work_email: str
    tool_name: str
    tool_short_name: Optional[str] = None
    plan: Optional[str] = None
    status: str
    assigned_on: Optional[date] = None
    renewal_date: Optional[date] = None
    cost_centre: Optional[str] = None
    notes: Optional[str] = None
    holder_kind: LicenseHolderKind
    holder_name: Optional[str] = None
    updated_at: Optional[datetime] = None


class LicenseAssignmentListResponse(BaseModel):
    items: list[LicenseAssignmentItem]
    total: int
    page: int
    limit: int


class LicenseAssignmentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    work_email: str
    tool_name: str
    tool_short_name: Optional[str] = None
    plan: Optional[str] = None
    status: str = "Assigned"
    assigned_on: Optional[date] = None
    renewal_date: Optional[date] = None
    cost_centre: Optional[str] = None
    notes: Optional[str] = None


class LicenseAssignmentPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    work_email: Optional[str] = None
    tool_name: Optional[str] = None
    tool_short_name: Optional[str] = None
    plan: Optional[str] = None
    status: Optional[str] = None
    assigned_on: Optional[date] = None
    renewal_date: Optional[date] = None
    cost_centre: Optional[str] = None
    notes: Optional[str] = None


class LicenseContractItem(BaseModel):
    id: str
    contract_key: str
    entity: Optional[str] = None
    software: str
    short_name: Optional[str] = None
    category: Optional[str] = None
    contract_no: Optional[str] = None
    contract_type: Optional[str] = None
    serial_no: Optional[str] = None
    seats: int = 0
    vendor: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    cost: Optional[float] = None
    currency: str = "INR"
    status: Optional[str] = None
    user_type: Optional[str] = None
    notes: Optional[str] = None
    days_to_expiry: Optional[int] = None
    renewal_status: str
    updated_at: Optional[datetime] = None


class LicenseContractListResponse(BaseModel):
    items: list[LicenseContractItem]
    total: int
    page: int
    limit: int


class LicenseContractCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contract_key: str
    entity: Optional[str] = None
    software: str
    short_name: Optional[str] = None
    category: Optional[str] = None
    contract_no: Optional[str] = None
    contract_type: Optional[str] = None
    serial_no: Optional[str] = None
    seats: int = 0
    vendor: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    cost: Optional[float] = None
    currency: str = "INR"
    status: Optional[str] = None
    user_type: Optional[str] = None
    notes: Optional[str] = None


class LicenseContractPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contract_key: Optional[str] = None
    entity: Optional[str] = None
    software: Optional[str] = None
    short_name: Optional[str] = None
    category: Optional[str] = None
    contract_no: Optional[str] = None
    contract_type: Optional[str] = None
    serial_no: Optional[str] = None
    seats: Optional[int] = None
    vendor: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    cost: Optional[float] = None
    currency: Optional[str] = None
    status: Optional[str] = None
    user_type: Optional[str] = None
    notes: Optional[str] = None


class LicenseSoftwareSummary(BaseModel):
    software: str
    short_name: str
    category: Optional[str] = None
    purchased: int
    assigned: int
    shared_assigned: int
    total_assigned: int
    contracts: int


class LicenseTotals(BaseModel):
    purchased: int
    assigned: int
    shared_assigned: int
    total_assigned: int
    software_titles: int


class LicenseEmailIssue(BaseModel):
    email: str
    tools: list[str]
    known: bool = False


class LicenseSummaryResponse(BaseModel):
    totals: LicenseTotals
    software_summaries: list[LicenseSoftwareSummary]
    expiring_soon_list: list[LicenseContractItem]
    all_contracts: list[LicenseContractItem]
    total_assignments: int
    shared_email_list: list[LicenseEmailIssue]
    unknown_email_list: list[LicenseEmailIssue]
