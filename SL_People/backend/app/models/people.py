"""SQLAlchemy ORM models for the sl_people database (MySQL/InnoDB).

UUID primary keys are app-generated CHAR(36) (MySQL has no native UUID type and
no gen_random_uuid()). JSON columns use SQLAlchemy's portable JSON type, which
maps to MySQL JSON. The canonical join key to sl_platform.dim_person is
employee_number == dim_person.person_code.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def _uuid() -> str:
    return str(uuid.uuid4())


# ── Table 1 — employee_ext ────────────────────────────────────────────────────
class EmployeeExt(Base):
    __tablename__ = "employee_ext"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    employee_number: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    person_id: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    legacy_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    attendance_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    employment_status: Mapped[str] = mapped_column(String(20), nullable=False, default="working")
    worker_type: Mapped[str] = mapped_column(String(20), nullable=False, default="permanent")
    time_type: Mapped[str] = mapped_column(String(20), nullable=False, default="fulltime")
    exit_status: Mapped[str | None] = mapped_column(String(100), nullable=True)
    termination_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    termination_reason: Mapped[str | None] = mapped_column(String(100), nullable=True)
    resignation_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    exit_comments: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    created_by_person_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    updated_by_person_id: Mapped[str | None] = mapped_column(String(64), nullable=True)


# ── Table 2 — employee_hr ─────────────────────────────────────────────────────
class EmployeeHr(Base):
    __tablename__ = "employee_hr"

    employee_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("employee_ext.id", ondelete="CASCADE"), primary_key=True
    )
    middle_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    personal_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    work_phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    home_phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    date_of_birth: Mapped[date | None] = mapped_column(Date, nullable=True)
    gender: Mapped[str | None] = mapped_column(String(20), nullable=True)
    marital_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    marriage_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    blood_group: Mapped[str | None] = mapped_column(String(20), nullable=True)
    physically_handicapped: Mapped[bool] = mapped_column(Boolean, default=False)
    nationality: Mapped[str | None] = mapped_column(String(100), nullable=True)
    father_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    mother_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    spouse_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    children_names: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


# ── Table 3 — employee_address ────────────────────────────────────────────────
class EmployeeAddress(Base):
    __tablename__ = "employee_address"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    employee_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("employee_ext.id", ondelete="CASCADE"), nullable=False
    )
    address_type: Mapped[str] = mapped_column(String(20), nullable=False)  # current | permanent
    line1: Mapped[str | None] = mapped_column(String(255), nullable=True)
    line2: Mapped[str | None] = mapped_column(String(255), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    state: Mapped[str | None] = mapped_column(String(100), nullable=True)
    zip: Mapped[str | None] = mapped_column(String(20), nullable=True)
    country: Mapped[str | None] = mapped_column(String(100), nullable=True)


# ── Table 4 — employee_work_info ──────────────────────────────────────────────
class EmployeeWorkInfo(Base):
    __tablename__ = "employee_work_info"

    employee_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("employee_ext.id", ondelete="CASCADE"), primary_key=True
    )
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    location_country: Mapped[str | None] = mapped_column(String(100), nullable=True)
    legal_entity: Mapped[str | None] = mapped_column(String(255), nullable=True)
    business_unit: Mapped[str | None] = mapped_column(String(100), nullable=True)
    department: Mapped[str | None] = mapped_column(String(100), nullable=True)
    sub_department: Mapped[str | None] = mapped_column(String(100), nullable=True)
    job_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    secondary_job_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reporting_manager_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("employee_ext.id", ondelete="SET NULL"), nullable=True
    )
    dotted_line_manager_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("employee_ext.id", ondelete="SET NULL"), nullable=True
    )
    date_joined: Mapped[date | None] = mapped_column(Date, nullable=True)
    exit_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    notice_period: Mapped[str | None] = mapped_column(String(100), nullable=True)
    band: Mapped[str | None] = mapped_column(String(50), nullable=True)
    pay_grade: Mapped[str | None] = mapped_column(String(50), nullable=True)
    cost_center: Mapped[str | None] = mapped_column(String(100), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


# ── Table 5 — employee_policy ─────────────────────────────────────────────────
class EmployeePolicy(Base):
    __tablename__ = "employee_policy"

    employee_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("employee_ext.id", ondelete="CASCADE"), primary_key=True
    )
    leave_plan: Mapped[str | None] = mapped_column(String(255), nullable=True)
    shift_policy: Mapped[str | None] = mapped_column(String(255), nullable=True)
    weekly_off_policy: Mapped[str | None] = mapped_column(String(255), nullable=True)
    attendance_tracking_policy: Mapped[str | None] = mapped_column(String(255), nullable=True)
    attendance_capture_scheme: Mapped[str | None] = mapped_column(String(255), nullable=True)
    holiday_list: Mapped[str | None] = mapped_column(String(255), nullable=True)
    expense_policy: Mapped[str | None] = mapped_column(String(255), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


# ── Table 6 — employee_compliance (encrypted PII) ─────────────────────────────
class EmployeeCompliance(Base):
    __tablename__ = "employee_compliance"

    employee_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("employee_ext.id", ondelete="CASCADE"), primary_key=True
    )
    pan_enc: Mapped[str | None] = mapped_column(Text, nullable=True)
    aadhaar_enc: Mapped[str | None] = mapped_column(Text, nullable=True)
    pf_number_enc: Mapped[str | None] = mapped_column(Text, nullable=True)
    uan_number_enc: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    updated_by_person_id: Mapped[str | None] = mapped_column(String(64), nullable=True)


# ── Table 8 — employee_audit_log (immutable) ──────────────────────────────────
class EmployeeAuditLog(Base):
    __tablename__ = "employee_audit_log"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    employee_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("employee_ext.id", ondelete="CASCADE"), nullable=False
    )
    performed_by_person_id: Mapped[str] = mapped_column(String(64), nullable=False)
    performed_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    section: Mapped[str] = mapped_column(String(50), nullable=False)
    field_name: Mapped[str] = mapped_column(String(100), nullable=False)
    old_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    new_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)


# ── Table 9 — org_principal ───────────────────────────────────────────────────
class OrgPrincipal(Base):
    __tablename__ = "org_principal"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    color: Mapped[str] = mapped_column(String(7), nullable=False)
    employee_no: Mapped[str | None] = mapped_column(String(20), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


# ── Table 10 — org_group ──────────────────────────────────────────────────────
class OrgGroup(Base):
    __tablename__ = "org_group"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    group_key: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    principal_name: Mapped[str] = mapped_column(String(100), nullable=False)
    team_lead_emp: Mapped[str | None] = mapped_column(String(20), nullable=True)
    parent_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    color_hex: Mapped[str | None] = mapped_column(String(7), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


# ── Table 11 — org_employee (live org assignment) ─────────────────────────────
class OrgEmployee(Base):
    __tablename__ = "org_employee"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    employee_no: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    group_key: Mapped[str] = mapped_column(
        String(50), ForeignKey("org_group.group_key", ondelete="RESTRICT"), nullable=False
    )
    principal_name: Mapped[str] = mapped_column(String(100), nullable=False)
    org_level: Mapped[str] = mapped_column(String(20), nullable=False)  # Principal|Team Lead|Member|Excluded
    include_in_org: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    source_manager_emp: Mapped[str | None] = mapped_column(String(20), nullable=True)
    manager_override_emp: Mapped[str | None] = mapped_column(String(20), nullable=True)
    designation_level: Mapped[str | None] = mapped_column(String(50), nullable=True)
    designation_color: Mapped[str | None] = mapped_column(String(7), nullable=True)
    designation_order: Mapped[int | None] = mapped_column(Integer, nullable=True)
    prior_exp_years: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    sl_exp_years: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    o_exp_years: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_by_person_id: Mapped[str | None] = mapped_column(String(64), nullable=True)


# ── Table 12 — org_draft ──────────────────────────────────────────────────────
class OrgDraft(Base):
    __tablename__ = "org_draft"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    slot_number: Mapped[int] = mapped_column(SmallInteger, nullable=False, unique=True)
    draft_name: Mapped[str] = mapped_column(String(100), nullable=False)
    moves_json: Mapped[list] = mapped_column(JSON, nullable=False)
    full_snapshot: Mapped[dict] = mapped_column(JSON, nullable=False)
    base_log_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    created_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


# ── Table 13 — org_change_log (immutable) ─────────────────────────────────────
class OrgChangeLog(Base):
    __tablename__ = "org_change_log"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    action: Mapped[str] = mapped_column(String(20), nullable=False)  # publish | revert | initial_import
    performed_by_person_id: Mapped[str] = mapped_column(String(64), nullable=False)
    performed_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    draft_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    snapshot_before: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    snapshot_after: Mapped[dict] = mapped_column(JSON, nullable=False)
    diff_summary: Mapped[list | None] = mapped_column(JSON, nullable=True)
    reverted_from_log_id: Mapped[str | None] = mapped_column(String(36), nullable=True)


# ── Table 14 — license_assignment ─────────────────────────────────────────────
class LicenseAssignment(Base):
    __tablename__ = "license_assignment"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    work_email: Mapped[str] = mapped_column(String(255), nullable=False)
    tool_name: Mapped[str] = mapped_column(String(255), nullable=False)
    tool_short_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    plan: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="Assigned")
    assigned_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    renewal_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    cost_centre: Mapped[str | None] = mapped_column(String(100), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    smart_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


# ── Table 15 — license_contract ───────────────────────────────────────────────
class LicenseContract(Base):
    __tablename__ = "license_contract"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    contract_key: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    entity: Mapped[str | None] = mapped_column(String(255), nullable=True)
    software: Mapped[str] = mapped_column(String(255), nullable=False)
    short_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    contract_no: Mapped[str | None] = mapped_column(String(100), nullable=True)
    contract_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    serial_no: Mapped[str | None] = mapped_column(String(100), nullable=True)
    seats: Mapped[int] = mapped_column(Integer, default=0)
    vendor: Mapped[str | None] = mapped_column(String(255), nullable=True)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    cost: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    currency: Mapped[str] = mapped_column(String(10), default="INR")
    status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    user_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


# ── Table 16 — system_inventory ───────────────────────────────────────────────
class SystemInventory(Base):
    __tablename__ = "system_inventory"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    system_id: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    system_type: Mapped[str | None] = mapped_column(String(30), nullable=True)
    assigned_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    user_display: Mapped[str | None] = mapped_column(String(100), nullable=True)
    team: Mapped[str | None] = mapped_column(String(100), nullable=True)
    processor: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ram_gb: Mapped[float | None] = mapped_column(Numeric(6, 1), nullable=True)
    ram_slots_free: Mapped[str | None] = mapped_column(String(30), nullable=True)
    graphics_card: Mapped[str | None] = mapped_column(String(255), nullable=True)
    cpu_cores: Mapped[str | None] = mapped_column(String(50), nullable=True)
    storage: Mapped[str | None] = mapped_column(Text, nullable=True)
    motherboard: Mapped[str | None] = mapped_column(String(255), nullable=True)
    os: Mapped[str | None] = mapped_column(String(100), nullable=True)
    autocad_version: Mapped[str | None] = mapped_column(String(100), nullable=True)
    sketchup_version: Mapped[str | None] = mapped_column(String(100), nullable=True)
    threedmax_version: Mapped[str | None] = mapped_column("3dsmax_version", String(100), nullable=True)
    rhino_version: Mapped[str | None] = mapped_column(String(100), nullable=True)
    enscape_version: Mapped[str | None] = mapped_column(String(100), nullable=True)
    d5_render: Mapped[str | None] = mapped_column(String(100), nullable=True)
    adobe_versions: Mapped[str | None] = mapped_column(Text, nullable=True)
    office_version: Mapped[str | None] = mapped_column(String(100), nullable=True)
    antivirus: Mapped[str | None] = mapped_column(String(100), nullable=True)
    purchase_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    vendor: Mapped[str | None] = mapped_column(String(255), nullable=True)
    service_tag: Mapped[str | None] = mapped_column(String(100), nullable=True)
    serial_no: Mapped[str | None] = mapped_column(String(100), nullable=True)
    composite_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    capability_tier: Mapped[str | None] = mapped_column(String(30), nullable=True)
    upgrade_suggestion: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="Active")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


# ── Table 17 — peripheral_inventory ───────────────────────────────────────────
class PeripheralInventory(Base):
    __tablename__ = "peripheral_inventory"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    item_id: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    item: Mapped[str] = mapped_column(Text, nullable=False)
    model: Mapped[str | None] = mapped_column(String(255), nullable=True)
    serial: Mapped[str | None] = mapped_column(String(100), nullable=True)
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    condition: Mapped[str | None] = mapped_column(String(50), nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    assigned_to: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="Active")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


# ── Table 18 — sheet_import_job ───────────────────────────────────────────────
class SheetImportJob(Base):
    __tablename__ = "sheet_import_job"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    source: Mapped[str | None] = mapped_column(String(50), nullable=True)
    filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    total_rows: Mapped[int | None] = mapped_column(Integer, nullable=True)
    success_rows: Mapped[int] = mapped_column(Integer, default=0)
    error_rows: Mapped[int] = mapped_column(Integer, default=0)
    column_mapping: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error_log: Mapped[list | None] = mapped_column(JSON, nullable=True)
    performed_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    performed_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    status: Mapped[str] = mapped_column(String(20), default="pending")


# ── Table 19 — people_access_grant ────────────────────────────────────────────
class PeopleAccessGrant(Base):
    __tablename__ = "people_access_grant"

    person_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    access_level: Mapped[str] = mapped_column(String(20), nullable=False)  # none | view | edit | publisher | admin
    granted_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    granted_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
