"""SL IMS ORM models.

Phase 0: audit log. Phase 1: core inventory (category, manufacturer, vendor,
location, product, asset, asset tag sequence).
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    JSON,
    Numeric,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.constants import (
    IMS_ASSIGNMENT_ACTION_VALUES,
    IMS_ASSET_STATUS_VALUES,
    IMS_ATTACHMENT_KIND_VALUES,
    IMS_ALERT_STATUS_VALUES,
    IMS_ALERT_TYPE_VALUES,
    IMS_CONDITION_VALUES,
    IMS_CONSUMABLE_TXN_DIRECTION_VALUES,
    IMS_COST_SOURCE_VALUES,
    IMS_COST_TYPE_VALUES,
    IMS_ITEM_KIND_VALUES,
    IMS_LICENSE_BILLING_VALUES,
    IMS_LOCATION_KIND_VALUES,
    IMS_REPAIR_OUTCOME_VALUES,
    IMS_REPAIR_STATUS_VALUES,
)
from app.db.base import Base


class ImsAuditLog(Base):
    __tablename__ = "ims_audit_log"

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


class ImsCategory(Base):
    __tablename__ = "ims_category"

    category_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    code: Mapped[str] = mapped_column(String(16), nullable=False, unique=True)
    item_kind: Mapped[str] = mapped_column(
        Enum(*IMS_ITEM_KIND_VALUES, name="ims_item_kind_enum"), default="SERIALIZED"
    )
    default_warranty_months: Mapped[int | None] = mapped_column(Integer)
    default_depreciation_rate: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    default_useful_life_years: Mapped[int | None] = mapped_column(Integer)
    sort_order: Mapped[int] = mapped_column(Integer, default=100)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )


class ImsManufacturer(Base):
    __tablename__ = "ims_manufacturer"

    manufacturer_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class ImsVendor(Base):
    __tablename__ = "ims_vendor"

    vendor_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(191), nullable=False, unique=True)
    contact_person: Mapped[str | None] = mapped_column(String(128))
    email: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(64))
    gstin: Mapped[str | None] = mapped_column(String(32))
    address: Mapped[str | None] = mapped_column(String(512))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )


class ImsLocation(Base):
    __tablename__ = "ims_location"

    location_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("ims_location.location_id"))
    kind: Mapped[str] = mapped_column(
        Enum(*IMS_LOCATION_KIND_VALUES, name="ims_location_kind_enum"), default="OTHER"
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class ImsProduct(Base):
    __tablename__ = "ims_product"

    product_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("ims_category.category_id"), nullable=False)
    manufacturer_id: Mapped[int | None] = mapped_column(ForeignKey("ims_manufacturer.manufacturer_id"))
    model_name: Mapped[str] = mapped_column(String(191), nullable=False)
    specs: Mapped[dict | None] = mapped_column(JSON)
    default_warranty_months: Mapped[int | None] = mapped_column(Integer)
    default_depreciation_rate: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    default_useful_life_years: Mapped[int | None] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    category: Mapped[ImsCategory] = relationship("ImsCategory")
    manufacturer: Mapped[ImsManufacturer | None] = relationship("ImsManufacturer")


class ImsAsset(Base):
    __tablename__ = "ims_asset"

    asset_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    asset_tag: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    serial_number: Mapped[str | None] = mapped_column(String(128))
    category_id: Mapped[int] = mapped_column(ForeignKey("ims_category.category_id"), nullable=False)
    product_id: Mapped[int | None] = mapped_column(ForeignKey("ims_product.product_id"))
    manufacturer_id: Mapped[int | None] = mapped_column(ForeignKey("ims_manufacturer.manufacturer_id"))
    model_name: Mapped[str | None] = mapped_column(String(191))
    status: Mapped[str] = mapped_column(
        Enum(*IMS_ASSET_STATUS_VALUES, name="ims_asset_status_enum"), default="IN_STOCK"
    )
    condition_rating: Mapped[str] = mapped_column(
        Enum(*IMS_CONDITION_VALUES, name="ims_condition_enum"), default="NEW"
    )
    location_id: Mapped[int | None] = mapped_column(ForeignKey("ims_location.location_id"))
    assigned_person_id: Mapped[str | None] = mapped_column(String(64))
    assigned_email: Mapped[str | None] = mapped_column(String(255))
    assigned_name: Mapped[str | None] = mapped_column(String(255))
    vendor_id: Mapped[int | None] = mapped_column(ForeignKey("ims_vendor.vendor_id"))
    purchase_cost: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    currency: Mapped[str] = mapped_column(String(8), default="INR")
    purchase_date: Mapped[date | None] = mapped_column(Date)
    warranty_start: Mapped[date | None] = mapped_column(Date)
    warranty_end: Mapped[date | None] = mapped_column(Date)
    in_service_date: Mapped[date | None] = mapped_column(Date)
    retirement_date: Mapped[date | None] = mapped_column(Date)
    useful_life_years: Mapped[int | None] = mapped_column(Integer)
    specs: Mapped[dict | None] = mapped_column(JSON)
    notes: Mapped[str | None] = mapped_column(Text)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    created_by_email: Mapped[str | None] = mapped_column(String(255))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )
    updated_by_email: Mapped[str | None] = mapped_column(String(255))

    category: Mapped[ImsCategory] = relationship("ImsCategory")
    product: Mapped[ImsProduct | None] = relationship("ImsProduct")
    manufacturer: Mapped[ImsManufacturer | None] = relationship("ImsManufacturer")
    location: Mapped[ImsLocation | None] = relationship("ImsLocation")
    vendor: Mapped[ImsVendor | None] = relationship("ImsVendor")


class ImsAssetAssignment(Base):
    __tablename__ = "ims_asset_assignment"

    assignment_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("ims_asset.asset_id"), nullable=False)
    action: Mapped[str] = mapped_column(
        Enum(*IMS_ASSIGNMENT_ACTION_VALUES, name="ims_assignment_action_enum"), nullable=False
    )
    person_id: Mapped[str | None] = mapped_column(String(64))
    person_email: Mapped[str | None] = mapped_column(String(255))
    person_name: Mapped[str | None] = mapped_column(String(255))
    from_location_id: Mapped[int | None] = mapped_column(ForeignKey("ims_location.location_id"))
    to_location_id: Mapped[int | None] = mapped_column(ForeignKey("ims_location.location_id"))
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    returned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    condition_out: Mapped[str | None] = mapped_column(String(32))
    condition_in: Mapped[str | None] = mapped_column(String(32))
    handover_doc_url: Mapped[str | None] = mapped_column(String(1024))
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(Text)
    created_by_email: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    asset: Mapped[ImsAsset] = relationship("ImsAsset")


class ImsPurchase(Base):
    __tablename__ = "ims_purchase"

    purchase_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    vendor_id: Mapped[int | None] = mapped_column(ForeignKey("ims_vendor.vendor_id"))
    invoice_number: Mapped[str | None] = mapped_column(String(128))
    invoice_date: Mapped[date | None] = mapped_column(Date)
    currency: Mapped[str] = mapped_column(String(8), default="INR")
    subtotal: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    tax: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    total: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    drive_folder_id: Mapped[str | None] = mapped_column(String(255))
    invoice_file_url: Mapped[str | None] = mapped_column(String(1024))
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    created_by_email: Mapped[str | None] = mapped_column(String(255))

    vendor: Mapped[ImsVendor | None] = relationship("ImsVendor")


class ImsPurchaseLine(Base):
    __tablename__ = "ims_purchase_line"

    purchase_line_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    purchase_id: Mapped[int] = mapped_column(ForeignKey("ims_purchase.purchase_id"), nullable=False)
    asset_id: Mapped[int | None] = mapped_column(ForeignKey("ims_asset.asset_id"))
    category_id: Mapped[int | None] = mapped_column(ForeignKey("ims_category.category_id"))
    description: Mapped[str | None] = mapped_column(String(255))
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    unit_cost: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    total_cost: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))

    purchase: Mapped[ImsPurchase] = relationship("ImsPurchase")
    asset: Mapped[ImsAsset | None] = relationship("ImsAsset")
    category: Mapped[ImsCategory | None] = relationship("ImsCategory")


class ImsRepair(Base):
    __tablename__ = "ims_repair"

    repair_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("ims_asset.asset_id"), nullable=False)
    reported_fault: Mapped[str] = mapped_column(Text, nullable=False)
    reported_by_person_id: Mapped[str | None] = mapped_column(String(64))
    reported_by_email: Mapped[str | None] = mapped_column(String(255))
    reported_by_name: Mapped[str | None] = mapped_column(String(255))
    vendor_id: Mapped[int | None] = mapped_column(ForeignKey("ims_vendor.vendor_id"))
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    expected_return_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    returned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(Enum(*IMS_REPAIR_STATUS_VALUES, name="ims_repair_status_enum"), default="SENT")
    outcome: Mapped[str | None] = mapped_column(Enum(*IMS_REPAIR_OUTCOME_VALUES, name="ims_repair_outcome_enum"))
    warranty_covered: Mapped[bool] = mapped_column(Boolean, default=False)
    estimated_cost: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    final_cost: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    parts_replaced: Mapped[str | None] = mapped_column(Text)
    loaner_asset_id: Mapped[int | None] = mapped_column(ForeignKey("ims_asset.asset_id"))
    drive_folder_id: Mapped[str | None] = mapped_column(String(255))
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    created_by_email: Mapped[str | None] = mapped_column(String(255))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    updated_by_email: Mapped[str | None] = mapped_column(String(255))

    asset: Mapped[ImsAsset] = relationship("ImsAsset", foreign_keys=[asset_id])
    loaner_asset: Mapped[ImsAsset | None] = relationship("ImsAsset", foreign_keys=[loaner_asset_id])
    vendor: Mapped[ImsVendor | None] = relationship("ImsVendor")


class ImsLicense(Base):
    __tablename__ = "ims_license"

    license_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(191), nullable=False)
    vendor_id: Mapped[int | None] = mapped_column(ForeignKey("ims_vendor.vendor_id"))
    license_type: Mapped[str | None] = mapped_column(String(64))
    billing_cycle: Mapped[str] = mapped_column(Enum(*IMS_LICENSE_BILLING_VALUES, name="ims_license_billing_enum"), default="ANNUAL")
    total_seats: Mapped[int] = mapped_column(Integer, default=1)
    cost: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    currency: Mapped[str] = mapped_column(String(8), default="INR")
    renewal_date: Mapped[date | None] = mapped_column(Date)
    registered_email: Mapped[str | None] = mapped_column(String(255))
    drive_folder_id: Mapped[str | None] = mapped_column(String(255))
    notes: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    created_by_email: Mapped[str | None] = mapped_column(String(255))

    vendor: Mapped[ImsVendor | None] = relationship("ImsVendor")


class ImsLicenseSeat(Base):
    __tablename__ = "ims_license_seat"

    seat_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    license_id: Mapped[int] = mapped_column(ForeignKey("ims_license.license_id"), nullable=False)
    person_id: Mapped[str | None] = mapped_column(String(64))
    person_email: Mapped[str | None] = mapped_column(String(255))
    person_name: Mapped[str | None] = mapped_column(String(255))
    asset_id: Mapped[int | None] = mapped_column(ForeignKey("ims_asset.asset_id"))
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(Text)
    created_by_email: Mapped[str | None] = mapped_column(String(255))

    license: Mapped[ImsLicense] = relationship("ImsLicense")
    asset: Mapped[ImsAsset | None] = relationship("ImsAsset")


class ImsConsumable(Base):
    __tablename__ = "ims_consumable"

    consumable_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(191), nullable=False)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("ims_category.category_id"))
    unit: Mapped[str] = mapped_column(String(32), default="pcs")
    current_qty: Mapped[int] = mapped_column(Integer, default=0)
    min_qty: Mapped[int] = mapped_column(Integer, default=0)
    location_id: Mapped[int | None] = mapped_column(ForeignKey("ims_location.location_id"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    created_by_email: Mapped[str | None] = mapped_column(String(255))

    category: Mapped[ImsCategory | None] = relationship("ImsCategory")
    location: Mapped[ImsLocation | None] = relationship("ImsLocation")


class ImsConsumableTxn(Base):
    __tablename__ = "ims_consumable_txn"

    txn_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    consumable_id: Mapped[int] = mapped_column(ForeignKey("ims_consumable.consumable_id"), nullable=False)
    direction: Mapped[str] = mapped_column(Enum(*IMS_CONSUMABLE_TXN_DIRECTION_VALUES, name="ims_consumable_direction_enum"), nullable=False)
    qty: Mapped[int] = mapped_column(Integer, nullable=False)
    person_id: Mapped[str | None] = mapped_column(String(64))
    person_email: Mapped[str | None] = mapped_column(String(255))
    person_name: Mapped[str | None] = mapped_column(String(255))
    reference: Mapped[str | None] = mapped_column(String(255))
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    created_by_email: Mapped[str | None] = mapped_column(String(255))

    consumable: Mapped[ImsConsumable] = relationship("ImsConsumable")


class ImsAttachment(Base):
    __tablename__ = "ims_attachment"

    attachment_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    entity_type: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_id: Mapped[int] = mapped_column(Integer, nullable=False)
    kind: Mapped[str] = mapped_column(Enum(*IMS_ATTACHMENT_KIND_VALUES, name="ims_attachment_kind_enum"), default="OTHER")
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str | None] = mapped_column(String(128))
    drive_file_id: Mapped[str | None] = mapped_column(String(255))
    web_view_link: Mapped[str | None] = mapped_column(String(1024))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    created_by_email: Mapped[str | None] = mapped_column(String(255))


class ImsDriveFolder(Base):
    __tablename__ = "ims_drive_folder"

    folder_path: Mapped[str] = mapped_column(String(512), primary_key=True)
    drive_folder_id: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class ImsBudget(Base):
    __tablename__ = "ims_budget"

    budget_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    fy: Mapped[int] = mapped_column(Integer, nullable=False)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("ims_category.category_id"))
    planned_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    created_by_email: Mapped[str | None] = mapped_column(String(255))

    category: Mapped[ImsCategory | None] = relationship("ImsCategory")


class ImsCostEvent(Base):
    __tablename__ = "ims_cost_event"

    cost_event_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    fy: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    cost_type: Mapped[str] = mapped_column(Enum(*IMS_COST_TYPE_VALUES, name="ims_cost_type_enum"), nullable=False)
    source: Mapped[str] = mapped_column(Enum(*IMS_COST_SOURCE_VALUES, name="ims_cost_source_enum"), default="ACTUAL")
    category_id: Mapped[int | None] = mapped_column(ForeignKey("ims_category.category_id"))
    asset_id: Mapped[int | None] = mapped_column(ForeignKey("ims_asset.asset_id"))
    license_id: Mapped[int | None] = mapped_column(ForeignKey("ims_license.license_id"))
    purchase_id: Mapped[int | None] = mapped_column(ForeignKey("ims_purchase.purchase_id"))
    repair_id: Mapped[int | None] = mapped_column(ForeignKey("ims_repair.repair_id"))
    consumable_id: Mapped[int | None] = mapped_column(ForeignKey("ims_consumable.consumable_id"))
    vendor_id: Mapped[int | None] = mapped_column(ForeignKey("ims_vendor.vendor_id"))
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(8), default="INR")
    event_date: Mapped[date] = mapped_column(Date, nullable=False)
    description: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    category: Mapped[ImsCategory | None] = relationship("ImsCategory")
    vendor: Mapped[ImsVendor | None] = relationship("ImsVendor")


class ImsAlert(Base):
    __tablename__ = "ims_alert"

    alert_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    alert_type: Mapped[str] = mapped_column(Enum(*IMS_ALERT_TYPE_VALUES, name="ims_alert_type_enum"), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_id: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    due_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(Enum(*IMS_ALERT_STATUS_VALUES, name="ims_alert_status_enum"), default="OPEN")
    severity: Mapped[str] = mapped_column(String(32), default="MEDIUM")
    metadata_json: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ImsDashboardView(Base):
    __tablename__ = "ims_dashboard_view"

    view_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    scope: Mapped[str] = mapped_column(String(64), default="EXECUTIVE")
    filters: Mapped[dict | None] = mapped_column(JSON)
    created_by_email: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class ImsAssetSequence(Base):
    __tablename__ = "ims_asset_sequence"

    category_code: Mapped[str] = mapped_column(String(16), primary_key=True)
    fy: Mapped[int] = mapped_column(Integer, primary_key=True)
    last_number: Mapped[int] = mapped_column(Integer, default=0)
