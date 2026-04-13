from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import BigInteger, Date, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class SLProjectPlannerRow(Base):
    __tablename__ = "sl_project_planner"
    __table_args__ = {"schema": "sl_project_planner"}

    planner_row_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    project_code: Mapped[str] = mapped_column(String(64), index=True)
    project_name: Mapped[str] = mapped_column(String(255))
    contract_reference: Mapped[str | None] = mapped_column(String(128), nullable=True)
    discipline_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    stage_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    package_code: Mapped[str | None] = mapped_column(String(128), nullable=True)
    activity_code: Mapped[str] = mapped_column(String(64))
    activity_title: Mapped[str] = mapped_column(String(255))
    activity_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    plan_layer: Mapped[str] = mapped_column(String(32), default="live_plan")
    source_type: Mapped[str] = mapped_column(String(32), default="contract")
    change_type: Mapped[str] = mapped_column(String(32), default="none")
    change_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    activity_status: Mapped[str] = mapped_column(String(32), default="not_started")
    approval_status: Mapped[str] = mapped_column(String(32), default="not_required", index=True)
    approval_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    approval_requested_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    approval_action_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    priority: Mapped[str] = mapped_column(String(16), default="medium")
    baseline_start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    baseline_end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    live_start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    live_end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    actual_start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    actual_end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    duration_days: Mapped[Decimal | None] = mapped_column(Numeric(8, 2), nullable=True)
    percent_complete: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0.00"))
    dependency_codes: Mapped[str | None] = mapped_column(String(255), nullable=True)
    schedule_mode: Mapped[str] = mapped_column(String(16), default="manual")
    scheduled_start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    scheduled_end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    float_days: Mapped[Decimal | None] = mapped_column(Numeric(8, 2), nullable=True)
    is_critical: Mapped[int] = mapped_column(Integer, default=0)
    last_schedule_run_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    group_leader_person_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    project_anchor_person_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    senior_architect_person_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    assigned_to_person_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    requested_by_person_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    approved_by_person_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    is_deleted: Mapped[int] = mapped_column(default=0)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_by_person_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    updated_by_person_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class PlannerActivityDependency(Base):
    __tablename__ = "planner_activity_dependency"
    __table_args__ = {"schema": "sl_project_planner"}

    dependency_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    project_code: Mapped[str] = mapped_column(String(64), index=True)
    planner_row_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("sl_project_planner.sl_project_planner.planner_row_id", ondelete="CASCADE"),
        index=True,
    )
    predecessor_row_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("sl_project_planner.sl_project_planner.planner_row_id", ondelete="CASCADE"),
        index=True,
    )
    dependency_type: Mapped[str] = mapped_column(String(24), default="finish_to_start")
    lag_days: Mapped[Decimal] = mapped_column(Numeric(8, 2), default=Decimal("0.00"))
    created_by_person_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    updated_by_person_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class PlannerChangeRequest(Base):
    __tablename__ = "planner_change_request"
    __table_args__ = {"schema": "sl_project_planner"}

    request_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    planner_row_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("sl_project_planner.sl_project_planner.planner_row_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    project_code: Mapped[str] = mapped_column(String(64), index=True)
    request_type: Mapped[str] = mapped_column(String(32), default="schedule")
    request_status: Mapped[str] = mapped_column(String(24), default="pending", index=True)
    requested_by_person_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    requester_role: Mapped[str | None] = mapped_column(String(64), nullable=True)
    approver_person_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    approver_role: Mapped[str | None] = mapped_column(String(64), nullable=True)
    request_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    approval_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    before_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    proposed_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class PlannerAuditLog(Base):
    __tablename__ = "planner_audit_log"
    __table_args__ = {"schema": "sl_project_planner"}

    audit_log_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    planner_row_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("sl_project_planner.sl_project_planner.planner_row_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    project_code: Mapped[str] = mapped_column(String(64), index=True)
    entity_type: Mapped[str] = mapped_column(String(32), index=True)
    entity_id: Mapped[str] = mapped_column(String(64), index=True)
    action_type: Mapped[str] = mapped_column(String(64), index=True)
    change_summary: Mapped[str | None] = mapped_column(String(255), nullable=True)
    before_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    after_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    request_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True, index=True)
    actor_person_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    actor_role: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class PlannerDocument(Base):
    __tablename__ = "planner_document"
    __table_args__ = {"schema": "sl_project_planner"}

    document_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    planner_row_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("sl_project_planner.sl_project_planner.planner_row_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    project_code: Mapped[str] = mapped_column(String(64), index=True)
    document_code: Mapped[str] = mapped_column(String(64), index=True)
    title: Mapped[str] = mapped_column(String(255))
    discipline_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    category: Mapped[str] = mapped_column(String(32), default="general")
    current_version_no: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(24), default="draft")
    created_by_person_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    updated_by_person_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class PlannerDocumentVersion(Base):
    __tablename__ = "planner_document_version"
    __table_args__ = {"schema": "sl_project_planner"}

    document_version_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    document_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("sl_project_planner.planner_document.document_id", ondelete="CASCADE"),
        index=True,
    )
    version_no: Mapped[int] = mapped_column(Integer)
    original_filename: Mapped[str] = mapped_column(String(255))
    stored_filename: Mapped[str] = mapped_column(String(255))
    mime_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    file_size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    storage_path: Mapped[str] = mapped_column(String(512))
    checksum_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    version_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    uploaded_by_person_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class PlannerProjectBaseline(Base):
    __tablename__ = "planner_project_baseline"
    __table_args__ = {"schema": "sl_project_planner"}

    baseline_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    project_code: Mapped[str] = mapped_column(String(64), index=True)
    baseline_name: Mapped[str] = mapped_column(String(128))
    baseline_type: Mapped[str] = mapped_column(String(32), default="contract")
    snapshot_json: Mapped[str] = mapped_column(Text)
    created_by_person_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
