from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Integer, JSON, LargeBinary, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.constants import (
    IT_ASSET_STATUS_IN_STOCK,
    IT_ASSET_STATUS_VALUES,
    IT_ASSET_TYPE_VALUES,
    IT_ATTACHMENT_STORAGE_VALUES,
    IT_BILLING_CYCLE_VALUES,
    IT_IMPACT_VALUES,
    IT_LICENSE_ASSIGNMENT_ACTIVE,
    IT_LICENSE_ASSIGNMENT_VALUES,
    IT_LICENSE_TYPE_VALUES,
    IT_PRIORITY_VALUES,
    IT_STATUS_VALUES,
    IT_URGENCY_VALUES,
)
from app.db.base import Base


class ITAuditLog(Base):
    __tablename__ = "sl_it_audit_log"

    audit_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    actor_person_id: Mapped[str | None] = mapped_column(String(64))
    actor_email: Mapped[str | None] = mapped_column(String(255))
    action: Mapped[str] = mapped_column(String(128), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(128), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(128), nullable=False)
    before_json: Mapped[dict | None] = mapped_column(JSON)
    after_json: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    ip: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(Text)
    request_id: Mapped[str | None] = mapped_column(String(64))


class ITTicketSequence(Base):
    __tablename__ = "it_ticket_sequence"

    year: Mapped[int] = mapped_column(Integer, primary_key=True)
    last_number: Mapped[int] = mapped_column(Integer, nullable=False)


class ITCategory(Base):
    __tablename__ = "it_category"

    category_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    subcategories: Mapped[list[ITSubcategory]] = relationship("ITSubcategory", back_populates="category")


class ITSubcategory(Base):
    __tablename__ = "it_subcategory"

    subcategory_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("it_category.category_id"), nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    category: Mapped[ITCategory] = relationship("ITCategory", back_populates="subcategories")


class ITSlaPolicy(Base):
    __tablename__ = "it_sla_policy"

    sla_policy_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("it_category.category_id"))
    priority: Mapped[str | None] = mapped_column(Enum(*IT_PRIORITY_VALUES, name="it_priority_enum"))
    first_response_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    resolution_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    category: Mapped[ITCategory | None] = relationship("ITCategory")


class ITRoutingRule(Base):
    __tablename__ = "it_routing_rule"

    rule_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("it_category.category_id"))
    subcategory_id: Mapped[int | None] = mapped_column(ForeignKey("it_subcategory.subcategory_id"))
    default_assignee_person_id: Mapped[str | None] = mapped_column(String(64))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class ITTicket(Base):
    __tablename__ = "it_ticket"

    ticket_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ticket_number: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    requester_person_id: Mapped[str] = mapped_column(String(64), nullable=False)
    requester_email: Mapped[str] = mapped_column(String(255), nullable=False)
    requester_name: Mapped[str] = mapped_column(String(255), nullable=False)
    assignee_person_id: Mapped[str | None] = mapped_column(String(64))
    assignee_email: Mapped[str | None] = mapped_column(String(255))
    assignee_name: Mapped[str | None] = mapped_column(String(255))
    category_id: Mapped[int | None] = mapped_column(ForeignKey("it_category.category_id"))
    subcategory_id: Mapped[int | None] = mapped_column(ForeignKey("it_subcategory.subcategory_id"))
    priority: Mapped[str] = mapped_column(Enum(*IT_PRIORITY_VALUES, name="it_priority_enum"), nullable=False)
    impact: Mapped[str] = mapped_column(Enum(*IT_IMPACT_VALUES, name="it_impact_enum"), nullable=False)
    urgency: Mapped[str] = mapped_column(Enum(*IT_URGENCY_VALUES, name="it_urgency_enum"), nullable=False)
    status: Mapped[str] = mapped_column(Enum(*IT_STATUS_VALUES, name="it_status_enum"), nullable=False)
    subject: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    sla_policy_id: Mapped[int | None] = mapped_column(ForeignKey("it_sla_policy.sla_policy_id"))
    first_response_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolution_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    first_response_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reopened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    calendar_event_id: Mapped[str | None] = mapped_column(String(128))
    calendar_event_html_link: Mapped[str | None] = mapped_column(String(512))

    category: Mapped[ITCategory | None] = relationship("ITCategory")
    subcategory: Mapped[ITSubcategory | None] = relationship("ITSubcategory")
    sla_policy: Mapped[ITSlaPolicy | None] = relationship("ITSlaPolicy")
    comments: Mapped[list[ITTicketComment]] = relationship("ITTicketComment", back_populates="ticket")


class ITTicketComment(Base):
    __tablename__ = "it_ticket_comment"

    comment_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ticket_id: Mapped[int] = mapped_column(ForeignKey("it_ticket.ticket_id"), nullable=False)
    author_person_id: Mapped[str] = mapped_column(String(64), nullable=False)
    author_email: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    is_internal: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    ticket: Mapped[ITTicket] = relationship("ITTicket", back_populates="comments")


class ITTicketAttachment(Base):
    __tablename__ = "it_ticket_attachment"

    attachment_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ticket_id: Mapped[int] = mapped_column(ForeignKey("it_ticket.ticket_id"), nullable=False)
    comment_id: Mapped[int | None] = mapped_column(ForeignKey("it_ticket_comment.comment_id"))
    filename: Mapped[str] = mapped_column(String(256), nullable=False)
    mime: Mapped[str] = mapped_column(String(128), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_type: Mapped[str] = mapped_column(Enum(*IT_ATTACHMENT_STORAGE_VALUES, name="it_attachment_storage_enum"), nullable=False)
    storage_ref: Mapped[str] = mapped_column(String(512), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    ticket: Mapped[ITTicket] = relationship("ITTicket")


class ITVendor(Base):
    __tablename__ = "it_vendor"

    vendor_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    website: Mapped[str | None] = mapped_column(String(255))
    support_email: Mapped[str | None] = mapped_column(String(255))
    support_phone: Mapped[str | None] = mapped_column(String(64))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)


class ITAsset(Base):
    __tablename__ = "it_asset"

    asset_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    asset_tag: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    asset_type: Mapped[str] = mapped_column(Enum(*IT_ASSET_TYPE_VALUES, name="it_asset_type_enum"), nullable=False)
    serial_number: Mapped[str | None] = mapped_column(String(128), unique=True)
    manufacturer: Mapped[str | None] = mapped_column(String(128))
    model: Mapped[str | None] = mapped_column(String(128))
    operating_system: Mapped[str | None] = mapped_column(String(128))
    purchase_date: Mapped[date | None] = mapped_column(Date)
    warranty_end: Mapped[date | None] = mapped_column(Date)
    assigned_person_id: Mapped[str | None] = mapped_column(String(64))
    assigned_email: Mapped[str | None] = mapped_column(String(255))
    assigned_name: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(
        Enum(*IT_ASSET_STATUS_VALUES, name="it_asset_status_enum"),
        nullable=False,
        default=IT_ASSET_STATUS_IN_STOCK,
    )
    location: Mapped[str | None] = mapped_column(String(128))
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)


class ITLicense(Base):
    __tablename__ = "it_license"

    license_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    vendor_id: Mapped[int | None] = mapped_column(ForeignKey("it_vendor.vendor_id"))
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    sku: Mapped[str | None] = mapped_column(String(128))
    license_type: Mapped[str] = mapped_column(Enum(*IT_LICENSE_TYPE_VALUES, name="it_license_type_enum"), nullable=False)
    total_seats: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    contract_start: Mapped[date | None] = mapped_column(Date)
    contract_end: Mapped[date | None] = mapped_column(Date)
    renewal_date: Mapped[date | None] = mapped_column(Date)
    cost_amount: Mapped[float | None] = mapped_column(Numeric(12, 2))
    cost_currency: Mapped[str | None] = mapped_column(String(16))
    billing_cycle: Mapped[str | None] = mapped_column(Enum(*IT_BILLING_CYCLE_VALUES, name="it_billing_cycle_enum"))
    registered_email: Mapped[str | None] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    vendor: Mapped[ITVendor | None] = relationship("ITVendor")


class ITLicenseAssignment(Base):
    __tablename__ = "it_license_assignment"

    assignment_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    license_id: Mapped[int] = mapped_column(ForeignKey("it_license.license_id"), nullable=False)
    asset_id: Mapped[int | None] = mapped_column(ForeignKey("it_asset.asset_id"))
    assigned_person_id: Mapped[str | None] = mapped_column(String(64))
    assigned_email: Mapped[str | None] = mapped_column(String(255))
    assigned_name: Mapped[str | None] = mapped_column(String(255))
    assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    unassigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(
        Enum(*IT_LICENSE_ASSIGNMENT_VALUES, name="it_license_assignment_enum"),
        nullable=False,
        default=IT_LICENSE_ASSIGNMENT_ACTIVE,
    )
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    license: Mapped[ITLicense] = relationship("ITLicense")
    asset: Mapped[ITAsset | None] = relationship("ITAsset")


class ITLicenseAttachment(Base):
    __tablename__ = "it_license_attachment"

    attachment_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    license_id: Mapped[int] = mapped_column(ForeignKey("it_license.license_id"), nullable=False)
    filename: Mapped[str] = mapped_column(String(256), nullable=False)
    mime: Mapped[str] = mapped_column(String(128), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_type: Mapped[str] = mapped_column(Enum(*IT_ATTACHMENT_STORAGE_VALUES, name="it_attachment_storage_enum"), nullable=False)
    storage_ref: Mapped[str] = mapped_column(String(512), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    license: Mapped[ITLicense] = relationship("ITLicense")


class ITCredential(Base):
    __tablename__ = "it_credential"

    credential_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    label: Mapped[str] = mapped_column(String(128), nullable=False)
    username: Mapped[str] = mapped_column(String(255), nullable=False)
    password_cipher: Mapped[bytes] = mapped_column(LargeBinary(4096), nullable=False)
    password_nonce: Mapped[bytes] = mapped_column(LargeBinary(32), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_rotated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)


class ITLicenseCredential(Base):
    __tablename__ = "it_license_credential"

    license_id: Mapped[int] = mapped_column(ForeignKey("it_license.license_id"), primary_key=True)
    credential_id: Mapped[int] = mapped_column(ForeignKey("it_credential.credential_id"), primary_key=True)

    license: Mapped[ITLicense] = relationship("ITLicense")
    credential: Mapped[ITCredential] = relationship("ITCredential")
