from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.constants import (
    IT_IMPACT_VALUES,
    IT_PRIORITY_VALUES,
    IT_STATUS_VALUES,
    IT_URGENCY_VALUES,
    IT_ASSET_STATUS_VALUES,
    IT_ASSET_TYPE_VALUES,
    IT_LICENSE_TYPE_VALUES,
    IT_BILLING_CYCLE_VALUES,
)


class CategoryBase(BaseModel):
    name: str
    is_active: bool = True


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(BaseModel):
    name: str | None = None
    is_active: bool | None = None


class CategoryOut(CategoryBase):
    category_id: int

    class Config:
        from_attributes = True


class SubcategoryBase(BaseModel):
    category_id: int
    name: str
    is_active: bool = True


class SubcategoryCreate(SubcategoryBase):
    pass


class SubcategoryUpdate(BaseModel):
    name: str | None = None
    is_active: bool | None = None


class SubcategoryOut(SubcategoryBase):
    subcategory_id: int

    class Config:
        from_attributes = True


class SlaPolicyBase(BaseModel):
    name: str
    category_id: int | None = None
    priority: str | None = None
    first_response_minutes: int
    resolution_minutes: int
    is_active: bool = True

    @field_validator("priority")
    @classmethod
    def validate_priority(cls, value: str | None) -> str | None:
        if value is None:
            return value
        if value not in IT_PRIORITY_VALUES:
            raise ValueError("invalid_priority")
        return value


class SlaPolicyCreate(SlaPolicyBase):
    pass


class SlaPolicyUpdate(BaseModel):
    name: str | None = None
    category_id: int | None = None
    priority: str | None = None
    first_response_minutes: int | None = None
    resolution_minutes: int | None = None
    is_active: bool | None = None


class SlaPolicyOut(SlaPolicyBase):
    sla_policy_id: int

    class Config:
        from_attributes = True


class TicketCreate(BaseModel):
    subject: str = Field(min_length=3, max_length=256)
    description: str = Field(min_length=3)
    category_id: int | None = None
    subcategory_id: int | None = None
    impact: str
    urgency: str
    priority: str | None = None

    @field_validator("impact")
    @classmethod
    def validate_impact(cls, value: str) -> str:
        if value not in IT_IMPACT_VALUES:
            raise ValueError("invalid_impact")
        return value

    @field_validator("urgency")
    @classmethod
    def validate_urgency(cls, value: str) -> str:
        if value not in IT_URGENCY_VALUES:
            raise ValueError("invalid_urgency")
        return value

    @field_validator("priority")
    @classmethod
    def validate_priority(cls, value: str | None) -> str | None:
        if value is None:
            return value
        if value not in IT_PRIORITY_VALUES:
            raise ValueError("invalid_priority")
        return value


class TicketUpdate(BaseModel):
    subject: str | None = Field(default=None, min_length=3, max_length=256)
    description: str | None = Field(default=None, min_length=3)


class TicketAssign(BaseModel):
    assignee_person_id: str | None


class TicketTransition(BaseModel):
    new_status: str
    comment: str | None = None
    is_internal: bool = False

    @field_validator("new_status")
    @classmethod
    def validate_status(cls, value: str) -> str:
        if value not in IT_STATUS_VALUES:
            raise ValueError("invalid_status")
        return value


class TicketCommentCreate(BaseModel):
    body: str = Field(min_length=1)
    is_internal: bool = False


class TicketCommentOut(BaseModel):
    comment_id: int
    ticket_id: int
    author_person_id: str
    author_email: str
    body: str
    is_internal: bool
    created_at: datetime

    class Config:
        from_attributes = True


class TicketListItem(BaseModel):
    ticket_id: int
    ticket_number: str
    subject: str
    priority: str
    impact: str
    urgency: str
    status: str
    requester_person_id: str
    requester_email: str
    requester_name: str
    assignee_person_id: str | None
    assignee_email: str | None
    assignee_name: str | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TicketDetail(BaseModel):
    ticket_id: int
    ticket_number: str
    subject: str
    description: str
    priority: str
    impact: str
    urgency: str
    status: str
    requester_person_id: str
    requester_email: str
    requester_name: str
    assignee_person_id: str | None
    assignee_email: str | None
    assignee_name: str | None
    category_id: int | None
    subcategory_id: int | None
    sla_policy_id: int | None
    first_response_due_at: datetime | None
    resolution_due_at: datetime | None
    first_response_at: datetime | None
    created_at: datetime
    updated_at: datetime
    resolved_at: datetime | None
    closed_at: datetime | None
    reopened_at: datetime | None
    calendar_event_id: str | None
    calendar_event_html_link: str | None
    comments: list[TicketCommentOut] = []

    class Config:
        from_attributes = True


class AssetBase(BaseModel):
    asset_tag: str
    asset_type: str
    status: str
    serial_number: str | None = None
    manufacturer: str | None = None
    model: str | None = None
    operating_system: str | None = None
    purchase_date: datetime | None = None
    warranty_end: datetime | None = None
    location: str | None = None
    assigned_person_id: str | None = None
    assigned_email: str | None = None
    assigned_name: str | None = None
    notes: str | None = None

    @field_validator("asset_type")
    @classmethod
    def validate_asset_type(cls, value: str) -> str:
        if value not in IT_ASSET_TYPE_VALUES:
            raise ValueError("invalid_asset_type")
        return value

    @field_validator("status")
    @classmethod
    def validate_asset_status(cls, value: str) -> str:
        if value not in IT_ASSET_STATUS_VALUES:
            raise ValueError("invalid_asset_status")
        return value


class AssetCreate(AssetBase):
    pass


class AssetUpdate(BaseModel):
    asset_type: str | None = None
    status: str | None = None
    serial_number: str | None = None
    manufacturer: str | None = None
    model: str | None = None
    operating_system: str | None = None
    purchase_date: datetime | None = None
    warranty_end: datetime | None = None
    location: str | None = None
    assigned_person_id: str | None = None
    assigned_email: str | None = None
    assigned_name: str | None = None
    notes: str | None = None


class AssetOut(AssetBase):
    asset_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class VendorCreate(BaseModel):
    name: str
    website: str | None = None
    support_email: str | None = None
    support_phone: str | None = None
    is_active: bool = True


class VendorOut(BaseModel):
    vendor_id: int
    name: str
    website: str | None = None
    support_email: str | None = None
    support_phone: str | None = None
    is_active: bool | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    class Config:
        from_attributes = True


class LicenseBase(BaseModel):
    name: str
    vendor_id: int | None = None
    sku: str | None = None
    license_type: str
    billing_cycle: str
    total_seats: int = 1
    contract_start: datetime | None = None
    contract_end: datetime | None = None
    renewal_date: datetime | None = None
    registered_email: str | None = None
    cost_currency: str = "INR"
    cost_amount: int | None = None
    notes: str | None = None
    is_active: bool = True

    @field_validator("license_type")
    @classmethod
    def validate_license_type(cls, value: str) -> str:
        if value not in IT_LICENSE_TYPE_VALUES:
            raise ValueError("invalid_license_type")
        return value

    @field_validator("billing_cycle")
    @classmethod
    def validate_billing_cycle(cls, value: str) -> str:
        if value not in IT_BILLING_CYCLE_VALUES:
            raise ValueError("invalid_billing_cycle")
        return value


class LicenseCreate(LicenseBase):
    pass


class LicenseUpdate(BaseModel):
    name: str | None = None
    vendor_id: int | None = None
    sku: str | None = None
    license_type: str | None = None
    billing_cycle: str | None = None
    total_seats: int | None = None
    contract_start: datetime | None = None
    contract_end: datetime | None = None
    renewal_date: datetime | None = None
    registered_email: str | None = None
    cost_currency: str | None = None
    cost_amount: int | None = None
    notes: str | None = None
    is_active: bool | None = None


class LicenseOut(LicenseBase):
    license_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class LicenseAssignmentCreate(BaseModel):
    license_id: int
    asset_id: int | None = None
    assignee_person_id: str | None = None
    assignee_email: str | None = None
    assignee_name: str | None = None
    status: str | None = None
    notes: str | None = None


class LicenseAssignmentOut(BaseModel):
    assignment_id: int
    license_id: int
    asset_id: int | None
    assignee_person_id: str | None
    assignee_email: str | None
    assignee_name: str | None
    assigned_at: datetime
    unassigned_at: datetime | None
    status: str | None
    notes: str | None
    created_at: datetime

    class Config:
        from_attributes = True
