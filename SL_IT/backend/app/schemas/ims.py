from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


# ── Category ──────────────────────────────────────────────────────────────────
class CategoryBase(BaseModel):
    name: str
    code: str = Field(min_length=1, max_length=16)
    item_kind: str = "SERIALIZED"
    default_warranty_months: Optional[int] = None
    default_depreciation_rate: Optional[Decimal] = None
    default_useful_life_years: Optional[int] = None
    sort_order: int = 100
    is_active: bool = True


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    item_kind: Optional[str] = None
    default_warranty_months: Optional[int] = None
    default_depreciation_rate: Optional[Decimal] = None
    default_useful_life_years: Optional[int] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


class CategoryOut(CategoryBase):
    model_config = ConfigDict(from_attributes=True)
    category_id: int


# ── Manufacturer ──────────────────────────────────────────────────────────────
class ManufacturerCreate(BaseModel):
    name: str
    is_active: bool = True


class ManufacturerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    manufacturer_id: int
    name: str
    is_active: bool


# ── Vendor ────────────────────────────────────────────────────────────────────
class VendorBase(BaseModel):
    name: str
    contact_person: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    gstin: Optional[str] = None
    address: Optional[str] = None
    is_active: bool = True


class VendorCreate(VendorBase):
    pass


class VendorUpdate(BaseModel):
    name: Optional[str] = None
    contact_person: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    gstin: Optional[str] = None
    address: Optional[str] = None
    is_active: Optional[bool] = None


class VendorOut(VendorBase):
    model_config = ConfigDict(from_attributes=True)
    vendor_id: int


# ── Location ──────────────────────────────────────────────────────────────────
class LocationCreate(BaseModel):
    name: str
    parent_id: Optional[int] = None
    kind: str = "OTHER"
    is_active: bool = True


class LocationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    location_id: int
    name: str
    parent_id: Optional[int] = None
    kind: str
    is_active: bool


# ── Product ───────────────────────────────────────────────────────────────────
class ProductBase(BaseModel):
    category_id: int
    manufacturer_id: Optional[int] = None
    model_name: str
    specs: Optional[dict[str, Any]] = None
    default_warranty_months: Optional[int] = None
    default_depreciation_rate: Optional[Decimal] = None
    default_useful_life_years: Optional[int] = None
    is_active: bool = True


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    category_id: Optional[int] = None
    manufacturer_id: Optional[int] = None
    model_name: Optional[str] = None
    specs: Optional[dict[str, Any]] = None
    default_warranty_months: Optional[int] = None
    default_depreciation_rate: Optional[Decimal] = None
    default_useful_life_years: Optional[int] = None
    is_active: Optional[bool] = None


class ProductOut(ProductBase):
    model_config = ConfigDict(from_attributes=True)
    product_id: int
    manufacturer_name: Optional[str] = None
    category_name: Optional[str] = None


# ── Asset ─────────────────────────────────────────────────────────────────────
class AssetCreate(BaseModel):
    serial_number: Optional[str] = None
    category_id: int
    product_id: Optional[int] = None
    manufacturer_id: Optional[int] = None
    model_name: Optional[str] = None
    status: str = "IN_STOCK"
    condition_rating: str = "NEW"
    location_id: Optional[int] = None
    vendor_id: Optional[int] = None
    purchase_cost: Optional[Decimal] = None
    currency: str = "INR"
    purchase_date: Optional[date] = None
    warranty_start: Optional[date] = None
    warranty_end: Optional[date] = None
    in_service_date: Optional[date] = None
    useful_life_years: Optional[int] = None
    specs: Optional[dict[str, Any]] = None
    notes: Optional[str] = None
    asset_tag: Optional[str] = None  # optional override; auto-generated if blank


class AssetUpdate(BaseModel):
    serial_number: Optional[str] = None
    category_id: Optional[int] = None
    product_id: Optional[int] = None
    manufacturer_id: Optional[int] = None
    model_name: Optional[str] = None
    status: Optional[str] = None
    condition_rating: Optional[str] = None
    location_id: Optional[int] = None
    vendor_id: Optional[int] = None
    purchase_cost: Optional[Decimal] = None
    currency: Optional[str] = None
    purchase_date: Optional[date] = None
    warranty_start: Optional[date] = None
    warranty_end: Optional[date] = None
    in_service_date: Optional[date] = None
    retirement_date: Optional[date] = None
    useful_life_years: Optional[int] = None
    specs: Optional[dict[str, Any]] = None
    notes: Optional[str] = None


class AssetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    asset_id: int
    asset_tag: str
    serial_number: Optional[str] = None
    category_id: int
    category_name: Optional[str] = None
    category_code: Optional[str] = None
    product_id: Optional[int] = None
    manufacturer_id: Optional[int] = None
    manufacturer_name: Optional[str] = None
    model_name: Optional[str] = None
    status: str
    condition_rating: str
    location_id: Optional[int] = None
    location_name: Optional[str] = None
    assigned_person_id: Optional[str] = None
    assigned_email: Optional[str] = None
    assigned_name: Optional[str] = None
    vendor_id: Optional[int] = None
    vendor_name: Optional[str] = None
    purchase_cost: Optional[Decimal] = None
    currency: str = "INR"
    purchase_date: Optional[date] = None
    warranty_start: Optional[date] = None
    warranty_end: Optional[date] = None
    in_service_date: Optional[date] = None
    retirement_date: Optional[date] = None
    useful_life_years: Optional[int] = None
    specs: Optional[dict[str, Any]] = None
    notes: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    # computed
    warranty_status: Optional[str] = None
    warranty_days_left: Optional[int] = None
    age_years: Optional[float] = None
    current_book_value: Optional[float] = None
    qr_payload: Optional[str] = None


class AssetListResponse(BaseModel):
    items: list[AssetOut]
    total: int
    page: int
    limit: int


class NextTagResponse(BaseModel):
    category_id: int
    category_code: str
    fy: int
    next_tag: str


class PersonRef(BaseModel):
    person_id: Optional[str] = None
    email: Optional[str] = None
    full_name: Optional[str] = None


class ScanLookupResponse(BaseModel):
    found: bool
    asset: Optional[AssetOut] = None


class AssignmentCreate(BaseModel):
    asset_id: int
    person_id: Optional[str] = None
    person_email: Optional[str] = None
    person_name: Optional[str] = None
    location_id: Optional[int] = None
    condition_out: Optional[str] = None
    notes: Optional[str] = None


class TransferCreate(BaseModel):
    asset_id: int
    location_id: Optional[int] = None
    person_id: Optional[str] = None
    person_email: Optional[str] = None
    person_name: Optional[str] = None
    notes: Optional[str] = None


class CheckinCreate(BaseModel):
    condition_in: Optional[str] = None
    location_id: Optional[int] = None
    notes: Optional[str] = None


class AssignmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    assignment_id: int
    asset_id: int
    action: str
    person_id: Optional[str] = None
    person_email: Optional[str] = None
    person_name: Optional[str] = None
    from_location_id: Optional[int] = None
    to_location_id: Optional[int] = None
    assigned_at: datetime
    returned_at: Optional[datetime] = None
    condition_out: Optional[str] = None
    condition_in: Optional[str] = None
    handover_doc_url: Optional[str] = None
    acknowledged_at: Optional[datetime] = None
    notes: Optional[str] = None
    asset_tag: Optional[str] = None


class PurchaseLineCreate(BaseModel):
    asset_id: Optional[int] = None
    category_id: Optional[int] = None
    description: Optional[str] = None
    quantity: int = 1
    unit_cost: Optional[Decimal] = None
    total_cost: Optional[Decimal] = None


class PurchaseCreate(BaseModel):
    vendor_id: Optional[int] = None
    invoice_number: Optional[str] = None
    invoice_date: Optional[date] = None
    currency: str = "INR"
    subtotal: Optional[Decimal] = None
    tax: Optional[Decimal] = None
    total: Optional[Decimal] = None
    notes: Optional[str] = None
    lines: list[PurchaseLineCreate] = Field(default_factory=list)


class PurchaseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    purchase_id: int
    vendor_id: Optional[int] = None
    vendor_name: Optional[str] = None
    invoice_number: Optional[str] = None
    invoice_date: Optional[date] = None
    currency: str = "INR"
    subtotal: Optional[Decimal] = None
    tax: Optional[Decimal] = None
    total: Optional[Decimal] = None
    drive_folder_id: Optional[str] = None
    invoice_file_url: Optional[str] = None
    notes: Optional[str] = None
    created_at: Optional[datetime] = None


class RepairCreate(BaseModel):
    asset_id: int
    reported_fault: str
    reported_by_person_id: Optional[str] = None
    reported_by_email: Optional[str] = None
    reported_by_name: Optional[str] = None
    vendor_id: Optional[int] = None
    expected_return_at: Optional[datetime] = None
    warranty_covered: bool = False
    estimated_cost: Optional[Decimal] = None
    loaner_asset_id: Optional[int] = None
    notes: Optional[str] = None


class RepairReturn(BaseModel):
    outcome: str = "REPAIRED"
    final_cost: Optional[Decimal] = None
    parts_replaced: Optional[str] = None
    condition_rating: Optional[str] = None
    return_to_owner: bool = False
    notes: Optional[str] = None


class RepairOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    repair_id: int
    asset_id: int
    asset_tag: Optional[str] = None
    reported_fault: str
    vendor_id: Optional[int] = None
    vendor_name: Optional[str] = None
    sent_at: datetime
    expected_return_at: Optional[datetime] = None
    returned_at: Optional[datetime] = None
    status: str
    outcome: Optional[str] = None
    warranty_covered: bool = False
    estimated_cost: Optional[Decimal] = None
    final_cost: Optional[Decimal] = None
    loaner_asset_id: Optional[int] = None
    notes: Optional[str] = None


class LicenseCreate(BaseModel):
    name: str
    vendor_id: Optional[int] = None
    license_type: Optional[str] = None
    billing_cycle: str = "ANNUAL"
    total_seats: int = 1
    cost: Optional[Decimal] = None
    currency: str = "INR"
    renewal_date: Optional[date] = None
    registered_email: Optional[str] = None
    notes: Optional[str] = None


class LicenseSeatCreate(BaseModel):
    person_id: Optional[str] = None
    person_email: Optional[str] = None
    person_name: Optional[str] = None
    asset_id: Optional[int] = None
    notes: Optional[str] = None


class LicenseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    license_id: int
    name: str
    vendor_id: Optional[int] = None
    vendor_name: Optional[str] = None
    license_type: Optional[str] = None
    billing_cycle: str
    total_seats: int
    assigned_seats: int = 0
    cost: Optional[Decimal] = None
    currency: str = "INR"
    renewal_date: Optional[date] = None
    registered_email: Optional[str] = None
    is_active: bool = True
    notes: Optional[str] = None


class LicenseSeatOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    seat_id: int
    license_id: int
    person_id: Optional[str] = None
    person_email: Optional[str] = None
    person_name: Optional[str] = None
    asset_id: Optional[int] = None
    assigned_at: datetime
    released_at: Optional[datetime] = None
    notes: Optional[str] = None


class ConsumableCreate(BaseModel):
    name: str
    category_id: Optional[int] = None
    unit: str = "pcs"
    current_qty: int = 0
    min_qty: int = 0
    location_id: Optional[int] = None


class ConsumableTxnCreate(BaseModel):
    direction: str
    qty: int
    person_id: Optional[str] = None
    person_email: Optional[str] = None
    person_name: Optional[str] = None
    reference: Optional[str] = None
    notes: Optional[str] = None


class ConsumableOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    consumable_id: int
    name: str
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    unit: str
    current_qty: int
    min_qty: int
    location_id: Optional[int] = None
    location_name: Optional[str] = None
    is_active: bool = True
    low_stock: bool = False


class ConsumableTxnOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    txn_id: int
    consumable_id: int
    direction: str
    qty: int
    person_email: Optional[str] = None
    person_name: Optional[str] = None
    reference: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime


class AttachmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    attachment_id: int
    entity_type: str
    entity_id: int
    kind: str
    filename: str
    content_type: Optional[str] = None
    drive_file_id: Optional[str] = None
    web_view_link: Optional[str] = None
    created_at: datetime


class BudgetCreate(BaseModel):
    fy: int
    category_id: Optional[int] = None
    planned_amount: Decimal
    notes: Optional[str] = None


class BudgetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    budget_id: int
    fy: int
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    planned_amount: Decimal
    notes: Optional[str] = None


class CostEventOut(BaseModel):
    cost_event_id: Optional[int] = None
    fy: int
    month: int
    cost_type: str
    source: str = "ACTUAL"
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    vendor_id: Optional[int] = None
    vendor_name: Optional[str] = None
    amount: Decimal
    currency: str = "INR"
    event_date: date
    description: Optional[str] = None


class FinanceSummaryOut(BaseModel):
    fy: int
    actual_total: float
    forecast_total: float
    budget_total: float
    variance: float
    monthly_actuals: list[dict[str, Any]]
    by_cost_type: list[dict[str, Any]]
    by_category: list[dict[str, Any]]
    five_year_projection: list[dict[str, Any]]


class AlertOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    alert_id: Optional[int] = None
    alert_type: str
    entity_type: str
    entity_id: int
    title: str
    due_date: Optional[date] = None
    status: str = "OPEN"
    severity: str = "MEDIUM"
    metadata_json: Optional[dict[str, Any]] = None


class DashboardSummaryOut(BaseModel):
    kpis: dict[str, Any]
    status_counts: list[dict[str, Any]]
    category_mix: list[dict[str, Any]]
    warranty_breakdown: list[dict[str, Any]]
    allotment: dict[str, Any]
    repair: dict[str, Any]
    license: dict[str, Any]
    consumables: dict[str, Any]
    alerts: list[AlertOut]


class DashboardViewCreate(BaseModel):
    name: str
    scope: str = "EXECUTIVE"
    filters: Optional[dict[str, Any]] = None


class DashboardViewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    view_id: int
    name: str
    scope: str
    filters: Optional[dict[str, Any]] = None
    created_by_email: Optional[str] = None
    created_at: datetime


# ── Bulk asset import ────────────────────────────────────────────────────────
class AssetImportRowOut(BaseModel):
    row_number: int
    action: str  # CREATE | UPDATE | UNCHANGED | ERROR
    asset_tag: Optional[str] = None
    changes: dict[str, list[Optional[str]]] = Field(default_factory=dict)  # field -> [old, new]
    error: Optional[str] = None


class AssetImportResult(BaseModel):
    rows: list[AssetImportRowOut]
    created: int
    updated: int
    unchanged: int
    errors: int
