"""Pydantic schemas for the employee master (Phase 1).

The employee record spans dim_person (identity, read-only) + 7 sl_people
sub-tables. List items are a flat projection; the full profile groups fields by
section to match the 6-tab UI. PATCH bodies are all-optional partial updates.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


# ── List ──────────────────────────────────────────────────────────────────────
class EmployeeListItem(BaseModel):
    id: str
    employee_number: str
    person_id: Optional[str] = None
    # identity (from dim_person; falls back to nulls for historical records)
    full_name: Optional[str] = None
    display_name: Optional[str] = None
    email: Optional[str] = None
    mobile_number: Optional[str] = None
    # ext / work
    employment_status: str
    worker_type: str
    department: Optional[str] = None
    sub_department: Optional[str] = None
    business_unit: Optional[str] = None
    job_title: Optional[str] = None
    date_joined: Optional[date] = None
    exit_date: Optional[date] = None


class EmployeeListResponse(BaseModel):
    items: list[EmployeeListItem]
    total: int
    page: int
    limit: int


# ── Full profile sections ─────────────────────────────────────────────────────
class IdentitySection(BaseModel):
    """Read-only — owned by sl_platform.dim_person."""

    person_id: Optional[str] = None
    person_code: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    full_name: Optional[str] = None
    display_name: Optional[str] = None
    email: Optional[str] = None
    mobile_number: Optional[str] = None
    platform_status: Optional[str] = None


class ExtSection(BaseModel):
    employee_number: str
    legacy_number: Optional[str] = None
    attendance_number: Optional[str] = None
    employment_status: str
    worker_type: str
    time_type: str


class PersonalSection(BaseModel):
    middle_name: Optional[str] = None
    personal_email: Optional[str] = None
    work_phone: Optional[str] = None
    home_phone: Optional[str] = None
    date_of_birth: Optional[date] = None
    gender: Optional[str] = None
    marital_status: Optional[str] = None
    marriage_date: Optional[date] = None
    blood_group: Optional[str] = None
    physically_handicapped: Optional[bool] = None
    nationality: Optional[str] = None
    father_name: Optional[str] = None
    mother_name: Optional[str] = None
    spouse_name: Optional[str] = None
    children_names: Optional[str] = None


class AddressBlock(BaseModel):
    line1: Optional[str] = None
    line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip: Optional[str] = None
    country: Optional[str] = None


class AddressSection(BaseModel):
    current: AddressBlock = AddressBlock()
    permanent: AddressBlock = AddressBlock()


class WorkInfoSection(BaseModel):
    location: Optional[str] = None
    location_country: Optional[str] = None
    legal_entity: Optional[str] = None
    business_unit: Optional[str] = None
    department: Optional[str] = None
    sub_department: Optional[str] = None
    job_title: Optional[str] = None
    secondary_job_title: Optional[str] = None
    reporting_manager_id: Optional[str] = None
    reporting_manager_name: Optional[str] = None
    reporting_manager_number: Optional[str] = None
    dotted_line_manager_id: Optional[str] = None
    date_joined: Optional[date] = None
    exit_date: Optional[date] = None
    notice_period: Optional[str] = None
    band: Optional[str] = None
    pay_grade: Optional[str] = None
    cost_center: Optional[str] = None


class PolicySection(BaseModel):
    leave_plan: Optional[str] = None
    shift_policy: Optional[str] = None
    weekly_off_policy: Optional[str] = None
    attendance_tracking_policy: Optional[str] = None
    attendance_capture_scheme: Optional[str] = None
    holiday_list: Optional[str] = None
    expense_policy: Optional[str] = None


class ComplianceSection(BaseModel):
    """Decrypted on read — admin only. Every read is audit-logged."""

    pan: Optional[str] = None
    aadhaar: Optional[str] = None
    pf_number: Optional[str] = None
    uan_number: Optional[str] = None


class ExitSection(BaseModel):
    exit_status: Optional[str] = None
    termination_type: Optional[str] = None
    termination_reason: Optional[str] = None
    resignation_note: Optional[str] = None
    comments: Optional[str] = None


class EmployeeProfile(BaseModel):
    id: str
    identity: IdentitySection
    ext: ExtSection
    personal: PersonalSection
    address: AddressSection
    work_info: WorkInfoSection
    policy: PolicySection
    exit: ExitSection
    # compliance present only for admins (None / omitted otherwise)
    compliance: Optional[ComplianceSection] = None
    compliance_available: bool = False


# ── PATCH bodies (all optional — partial update) ──────────────────────────────
class PersonalPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    middle_name: Optional[str] = None
    personal_email: Optional[str] = None
    work_phone: Optional[str] = None
    home_phone: Optional[str] = None
    date_of_birth: Optional[date] = None
    gender: Optional[str] = None
    marital_status: Optional[str] = None
    marriage_date: Optional[date] = None
    blood_group: Optional[str] = None
    physically_handicapped: Optional[bool] = None
    nationality: Optional[str] = None
    father_name: Optional[str] = None
    mother_name: Optional[str] = None
    spouse_name: Optional[str] = None
    children_names: Optional[str] = None


class IdentityPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    first_name: Optional[str] = None
    last_name: Optional[str] = None
    full_name: Optional[str] = None
    display_name: Optional[str] = None
    email: Optional[str] = None
    mobile_number: Optional[str] = None


class WorkInfoPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    location: Optional[str] = None
    location_country: Optional[str] = None
    legal_entity: Optional[str] = None
    business_unit: Optional[str] = None
    department: Optional[str] = None
    sub_department: Optional[str] = None
    job_title: Optional[str] = None
    secondary_job_title: Optional[str] = None
    reporting_manager_number: Optional[str] = None  # resolved to id server-side
    date_joined: Optional[date] = None
    notice_period: Optional[str] = None
    band: Optional[str] = None
    pay_grade: Optional[str] = None
    cost_center: Optional[str] = None


class AddressPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    current: Optional[AddressBlock] = None
    permanent: Optional[AddressBlock] = None


class PolicyPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    leave_plan: Optional[str] = None
    shift_policy: Optional[str] = None
    weekly_off_policy: Optional[str] = None
    attendance_tracking_policy: Optional[str] = None
    attendance_capture_scheme: Optional[str] = None
    holiday_list: Optional[str] = None
    expense_policy: Optional[str] = None


class CompliancePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    pan: Optional[str] = None
    aadhaar: Optional[str] = None
    pf_number: Optional[str] = None
    uan_number: Optional[str] = None


class ExitPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    exit_status: Optional[str] = None
    termination_type: Optional[str] = None
    termination_reason: Optional[str] = None
    resignation_note: Optional[str] = None
    comments: Optional[str] = None


class StatusPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    employment_status: str  # working | relieved | terminated
    exit_date: Optional[date] = None


class EmployeeCreate(BaseModel):
    """Minimal create — admin. Full create wizard is Phase 6."""

    employee_number: str
    person_id: Optional[str] = None
    worker_type: str = "permanent"
    employment_status: str = "working"
    time_type: str = "fulltime"
    job_title: Optional[str] = None
    department: Optional[str] = None
    business_unit: Optional[str] = None
    date_joined: Optional[date] = None


# ── Audit log ─────────────────────────────────────────────────────────────────
class AuditLogItem(BaseModel):
    id: str
    section: str
    field_name: str
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    performed_by_person_id: str
    performed_at: datetime
    ip_address: Optional[str] = None


class AuditLogResponse(BaseModel):
    items: list[AuditLogItem]
    total: int
    page: int
    limit: int
