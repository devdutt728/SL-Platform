from __future__ import annotations

from typing import Optional

from datetime import datetime
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_current_user
from app.constants import (
    IMS_ASSIGNMENT_ACTION_VALUES,
    IMS_ASSET_STATUS_VALUES,
    IMS_ATTACHMENT_KIND_VALUES,
    IMS_CONDITION_VALUES,
    IMS_CONSUMABLE_TXN_DIRECTION_VALUES,
    IMS_ITEM_KIND_VALUES,
    IMS_LICENSE_BILLING_VALUES,
    IMS_LOCATION_KIND_VALUES,
    IMS_REPAIR_OUTCOME_VALUES,
    IMS_REPAIR_STATUS_VALUES,
)
from app.db.platform_session import get_platform_session
from app.db.session import get_session
from app.models.ims import (
    ImsAsset,
    ImsAssetAssignment,
    ImsAttachment,
    ImsBudget,
    ImsCategory,
    ImsConsumable,
    ImsConsumableTxn,
    ImsDashboardView,
    ImsLicense,
    ImsLicenseSeat,
    ImsLocation,
    ImsManufacturer,
    ImsProduct,
    ImsPurchase,
    ImsPurchaseLine,
    ImsRepair,
    ImsVendor,
)
from app.models.platform import DimPerson
from app.rbac import require_employee, require_ims_admin, require_ims_manager, require_ims_operator, require_ims_viewer
from app.request_context import get_request_context
from app.schemas.ims import (
    AssetCreate,
    AssetImportResult,
    AssetListResponse,
    AssetOut,
    AssetUpdate,
    AssignmentCreate,
    AssignmentOut,
    AttachmentOut,
    AlertOut,
    BudgetCreate,
    BudgetOut,
    CheckinCreate,
    ConsumableCreate,
    ConsumableOut,
    ConsumableTxnCreate,
    ConsumableTxnOut,
    CostEventOut,
    CategoryCreate,
    CategoryOut,
    CategoryUpdate,
    DashboardSummaryOut,
    DashboardViewCreate,
    DashboardViewOut,
    FinanceSummaryOut,
    LicenseCreate,
    LicenseOut,
    LicenseSeatCreate,
    LicenseSeatOut,
    LocationCreate,
    LocationOut,
    ManufacturerCreate,
    ManufacturerOut,
    NextTagResponse,
    PersonRef,
    ProductCreate,
    ProductOut,
    ProductUpdate,
    PurchaseCreate,
    PurchaseOut,
    RepairCreate,
    RepairOut,
    RepairReturn,
    ScanLookupResponse,
    TransferCreate,
    VendorCreate,
    VendorOut,
    VendorUpdate,
)
from app.schemas.user import UserContext
from app.services.audit_service import write_audit_log
from app.services import drive_service
from app.services import ims_analytics
from app.services import ims_import
from app.services import ims_inventory as inv

router = APIRouter(prefix="/ims", tags=["ims"])

ASSET_LOADERS = (
    selectinload(ImsAsset.category),
    selectinload(ImsAsset.manufacturer),
    selectinload(ImsAsset.location),
    selectinload(ImsAsset.vendor),
)


# ── health / identity ─────────────────────────────────────────────────────────
@router.get("/health")
async def health():
    return {"ok": True, "module": "ims"}


@router.get("/me")
async def whoami(user: UserContext = Depends(get_current_user)):
    return {
        "email": user.email,
        "full_name": user.full_name,
        "person_id": user.person_id_platform,
        "roles": [r.value for r in user.roles],
        "platform_role_ids": user.platform_role_ids,
        "platform_role_codes": user.platform_role_codes,
    }


@router.get("/meta")
async def meta(user: UserContext = Depends(require_ims_viewer())):
    """Enums + option lists for building forms/filters on the client."""
    return {
        "asset_statuses": IMS_ASSET_STATUS_VALUES,
        "conditions": IMS_CONDITION_VALUES,
        "item_kinds": IMS_ITEM_KIND_VALUES,
        "location_kinds": IMS_LOCATION_KIND_VALUES,
        "assignment_actions": IMS_ASSIGNMENT_ACTION_VALUES,
        "repair_statuses": IMS_REPAIR_STATUS_VALUES,
        "repair_outcomes": IMS_REPAIR_OUTCOME_VALUES,
        "license_billing_cycles": IMS_LICENSE_BILLING_VALUES,
        "consumable_directions": IMS_CONSUMABLE_TXN_DIRECTION_VALUES,
        "attachment_kinds": IMS_ATTACHMENT_KIND_VALUES,
    }


# ── Categories ────────────────────────────────────────────────────────────────
@router.get("/categories", response_model=list[CategoryOut])
async def list_categories(
    include_inactive: bool = False,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_ims_viewer()),
):
    stmt = select(ImsCategory)
    if not include_inactive:
        stmt = stmt.where(ImsCategory.is_active.is_(True))
    stmt = stmt.order_by(ImsCategory.sort_order, ImsCategory.name)
    return (await session.execute(stmt)).scalars().all()


@router.post("/categories", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
async def create_category(
    body: CategoryCreate,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_ims_manager()),
):
    row = ImsCategory(**body.model_dump())
    row.code = row.code.upper().strip()
    session.add(row)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Category code already exists")
    await session.refresh(row)
    return row


@router.patch("/categories/{category_id}", response_model=CategoryOut)
async def update_category(
    category_id: int,
    body: CategoryUpdate,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_ims_manager()),
):
    row = await session.get(ImsCategory, category_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found")
    data = body.model_dump(exclude_unset=True)
    if "code" in data and data["code"]:
        data["code"] = str(data["code"]).upper().strip()
    for k, v in data.items():
        setattr(row, k, v)
    await session.commit()
    await session.refresh(row)
    return row


# ── Manufacturers ─────────────────────────────────────────────────────────────
@router.get("/manufacturers", response_model=list[ManufacturerOut])
async def list_manufacturers(
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_ims_viewer()),
):
    return (
        await session.execute(select(ImsManufacturer).order_by(ImsManufacturer.name))
    ).scalars().all()


@router.post("/manufacturers", response_model=ManufacturerOut, status_code=status.HTTP_201_CREATED)
async def create_manufacturer(
    body: ManufacturerCreate,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_ims_manager()),
):
    row = ImsManufacturer(**body.model_dump())
    session.add(row)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Manufacturer already exists")
    await session.refresh(row)
    return row


# ── Vendors ───────────────────────────────────────────────────────────────────
@router.get("/vendors", response_model=list[VendorOut])
async def list_vendors(
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_ims_viewer()),
):
    return (await session.execute(select(ImsVendor).order_by(ImsVendor.name))).scalars().all()


@router.post("/vendors", response_model=VendorOut, status_code=status.HTTP_201_CREATED)
async def create_vendor(
    body: VendorCreate,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_ims_manager()),
):
    row = ImsVendor(**body.model_dump())
    session.add(row)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Vendor already exists")
    await session.refresh(row)
    return row


@router.patch("/vendors/{vendor_id}", response_model=VendorOut)
async def update_vendor(
    vendor_id: int,
    body: VendorUpdate,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_ims_manager()),
):
    row = await session.get(ImsVendor, vendor_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Vendor not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    await session.commit()
    await session.refresh(row)
    return row


# ── Locations ─────────────────────────────────────────────────────────────────
@router.get("/locations", response_model=list[LocationOut])
async def list_locations(
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_ims_viewer()),
):
    return (await session.execute(select(ImsLocation).order_by(ImsLocation.name))).scalars().all()


@router.post("/locations", response_model=LocationOut, status_code=status.HTTP_201_CREATED)
async def create_location(
    body: LocationCreate,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_ims_manager()),
):
    row = ImsLocation(**body.model_dump())
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row


# ── Products (catalog) ────────────────────────────────────────────────────────
def _product_out(p: ImsProduct) -> ProductOut:
    return ProductOut(
        product_id=p.product_id,
        category_id=p.category_id,
        manufacturer_id=p.manufacturer_id,
        model_name=p.model_name,
        specs=p.specs,
        default_warranty_months=p.default_warranty_months,
        default_depreciation_rate=p.default_depreciation_rate,
        default_useful_life_years=p.default_useful_life_years,
        is_active=p.is_active,
        manufacturer_name=p.manufacturer.name if p.manufacturer else None,
        category_name=p.category.name if p.category else None,
    )


@router.get("/products", response_model=list[ProductOut])
async def list_products(
    category_id: Optional[int] = None,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_ims_viewer()),
):
    stmt = select(ImsProduct).options(
        selectinload(ImsProduct.manufacturer), selectinload(ImsProduct.category)
    )
    if category_id:
        stmt = stmt.where(ImsProduct.category_id == category_id)
    stmt = stmt.order_by(ImsProduct.model_name)
    rows = (await session.execute(stmt)).scalars().all()
    return [_product_out(p) for p in rows]


@router.post("/products", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
async def create_product(
    body: ProductCreate,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_ims_manager()),
):
    row = ImsProduct(**body.model_dump())
    session.add(row)
    await session.commit()
    row = (
        await session.execute(
            select(ImsProduct)
            .options(selectinload(ImsProduct.manufacturer), selectinload(ImsProduct.category))
            .where(ImsProduct.product_id == row.product_id)
        )
    ).scalar_one()
    return _product_out(row)


@router.patch("/products/{product_id}", response_model=ProductOut)
async def update_product(
    product_id: int,
    body: ProductUpdate,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_ims_manager()),
):
    row = await session.get(ImsProduct, product_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    await session.commit()
    row = (
        await session.execute(
            select(ImsProduct)
            .options(selectinload(ImsProduct.manufacturer), selectinload(ImsProduct.category))
            .where(ImsProduct.product_id == product_id)
        )
    ).scalar_one()
    return _product_out(row)


# ── Assets ────────────────────────────────────────────────────────────────────
async def _load_asset(session: AsyncSession, asset_id: int) -> ImsAsset:
    row = (
        await session.execute(
            select(ImsAsset).options(*ASSET_LOADERS).where(ImsAsset.asset_id == asset_id)
        )
    ).scalar_one_or_none()
    if not row or row.is_deleted:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Asset not found")
    return row


async def _ensure_unique_serial(
    session: AsyncSession, serial: Optional[str], *, exclude_id: Optional[int] = None
) -> Optional[str]:
    """Normalize a serial number and guard against duplicates.

    Blank/whitespace serials collapse to NULL and are always allowed (many
    assets have no printed S/N, so multiple no-serial rows are expected). A
    non-empty serial must be unique across non-deleted assets.
    """
    serial = (serial or "").strip()
    if not serial:
        return None
    filters = [
        ImsAsset.is_deleted.is_(False),
        func.lower(ImsAsset.serial_number) == serial.lower(),
    ]
    if exclude_id is not None:
        filters.append(ImsAsset.asset_id != exclude_id)
    existing = (
        await session.execute(select(ImsAsset.asset_tag).where(*filters).limit(1))
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Serial number '{serial}' already exists on asset {existing}",
        )
    return serial


@router.get("/assets/next-tag", response_model=NextTagResponse)
async def next_tag(
    category_id: int,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_ims_operator()),
):
    category = await session.get(ImsCategory, category_id)
    if not category:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found")
    fy, tag = await inv.peek_next_tag(session, category)
    return NextTagResponse(category_id=category_id, category_code=category.code, fy=fy, next_tag=tag)


@router.get("/assets/import/template.csv")
async def import_template_csv(
    user: UserContext = Depends(require_ims_admin()),
):
    from fastapi.responses import Response

    return Response(
        ims_import.build_template_csv(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="ims-asset-template.csv"'},
    )


@router.get("/assets/export.csv")
async def export_assets_csv(
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_ims_admin()),
):
    from fastapi.responses import Response

    return Response(
        await ims_import.build_export_csv(session),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="ims-assets-export.csv"'},
    )


@router.post("/assets/import/preview", response_model=AssetImportResult)
async def import_assets_preview(
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
    platform_session: AsyncSession = Depends(get_platform_session),
    user: UserContext = Depends(require_ims_admin()),
):
    rows = ims_import.parse_csv(await file.read())
    return await ims_import.run_import(session, platform_session, user, rows, dry_run=True)


@router.post("/assets/import/commit", response_model=AssetImportResult)
async def import_assets_commit(
    request: Request,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
    platform_session: AsyncSession = Depends(get_platform_session),
    user: UserContext = Depends(require_ims_admin()),
):
    rows = ims_import.parse_csv(await file.read())
    return await ims_import.run_import(
        session, platform_session, user, rows, dry_run=False, context=get_request_context(request)
    )


@router.get("/assets", response_model=AssetListResponse)
async def list_assets(
    q: Optional[str] = None,
    category_id: Optional[int] = None,
    asset_status: Optional[str] = Query(None, alias="status"),
    location_id: Optional[int] = None,
    assigned_email: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=500),
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_ims_viewer()),
):
    filters = [ImsAsset.is_deleted.is_(False)]
    if category_id:
        filters.append(ImsAsset.category_id == category_id)
    if asset_status:
        filters.append(ImsAsset.status == asset_status)
    if location_id:
        filters.append(ImsAsset.location_id == location_id)
    if assigned_email:
        filters.append(func.lower(ImsAsset.assigned_email) == assigned_email.strip().lower())
    if q:
        like = f"%{q.strip()}%"
        filters.append(
            or_(
                ImsAsset.asset_tag.like(like),
                ImsAsset.serial_number.like(like),
                ImsAsset.model_name.like(like),
                ImsAsset.assigned_name.like(like),
            )
        )

    total = (
        await session.execute(select(func.count()).select_from(ImsAsset).where(*filters))
    ).scalar_one()
    rows = (
        await session.execute(
            select(ImsAsset)
            .options(*ASSET_LOADERS)
            .where(*filters)
            .order_by(ImsAsset.created_at.desc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
    ).scalars().all()
    return AssetListResponse(
        items=[inv.asset_to_out(a) for a in rows], total=total, page=page, limit=limit
    )


@router.get("/assets/{asset_id}", response_model=AssetOut)
async def get_asset(
    asset_id: int,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_ims_viewer()),
):
    return inv.asset_to_out(await _load_asset(session, asset_id))


@router.post("/assets", response_model=AssetOut, status_code=status.HTTP_201_CREATED)
async def create_asset(
    body: AssetCreate,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_ims_operator()),
):
    category = await session.get(ImsCategory, body.category_id)
    if not category:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found")

    data = body.model_dump()
    tag = (data.pop("asset_tag", None) or "").strip()

    # Autofill from product catalog when fields are blank.
    product = None
    if body.product_id:
        product = await session.get(ImsProduct, body.product_id)
        if not product:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
        if not data.get("model_name"):
            data["model_name"] = product.model_name
        if not data.get("manufacturer_id"):
            data["manufacturer_id"] = product.manufacturer_id

    # Derive useful life (asset -> product -> category default).
    if not data.get("useful_life_years"):
        data["useful_life_years"] = (
            (product.default_useful_life_years if product else None)
            or category.default_useful_life_years
        )

    # Derive warranty window from purchase date + default warranty months.
    if data.get("purchase_date"):
        if not data.get("warranty_start"):
            data["warranty_start"] = data["purchase_date"]
        if not data.get("warranty_end"):
            months = (
                (product.default_warranty_months if product else None)
                or category.default_warranty_months
            )
            if months:
                data["warranty_end"] = inv.add_months(data["purchase_date"], int(months))
        if not data.get("in_service_date"):
            data["in_service_date"] = data["purchase_date"]

    data["serial_number"] = await _ensure_unique_serial(session, data.get("serial_number"))

    asset = ImsAsset(**data)
    asset.asset_tag = tag or await inv.generate_asset_tag(session, category)
    asset.created_by_email = user.email
    asset.updated_by_email = user.email
    session.add(asset)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Asset tag already exists")

    await write_audit_log(
        session,
        actor=user,
        action="asset.create",
        entity_type="ims_asset",
        entity_id=str(asset.asset_id),
        before=None,
        after={"asset_tag": asset.asset_tag, "serial_number": asset.serial_number},
        context=get_request_context(request),
    )
    await session.commit()
    return inv.asset_to_out(await _load_asset(session, asset.asset_id))


@router.patch("/assets/{asset_id}", response_model=AssetOut)
async def update_asset(
    asset_id: int,
    body: AssetUpdate,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_ims_operator()),
):
    asset = await _load_asset(session, asset_id)
    before = {"status": asset.status, "condition_rating": asset.condition_rating}
    fields = body.model_dump(exclude_unset=True)
    if "serial_number" in fields:
        fields["serial_number"] = await _ensure_unique_serial(
            session, fields["serial_number"], exclude_id=asset_id
        )
    for k, v in fields.items():
        setattr(asset, k, v)
    asset.updated_by_email = user.email
    await write_audit_log(
        session,
        actor=user,
        action="asset.update",
        entity_type="ims_asset",
        entity_id=str(asset.asset_id),
        before=before,
        after={"status": asset.status, "condition_rating": asset.condition_rating},
        context=get_request_context(request),
    )
    await session.commit()
    return inv.asset_to_out(await _load_asset(session, asset_id))


@router.delete("/assets/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_asset(
    asset_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_ims_admin()),
):
    asset = await _load_asset(session, asset_id)
    asset.is_deleted = True
    asset.updated_by_email = user.email
    await write_audit_log(
        session,
        actor=user,
        action="asset.delete",
        entity_type="ims_asset",
        entity_id=str(asset.asset_id),
        before={"asset_tag": asset.asset_tag},
        after=None,
        context=get_request_context(request),
    )
    await session.commit()


# ── People + scanning ─────────────────────────────────────────────────────────
@router.get("/people/search", response_model=list[PersonRef])
async def search_people(
    q: str = Query(..., min_length=2),
    platform_session: AsyncSession = Depends(get_platform_session),
    user: UserContext = Depends(require_ims_operator()),
):
    like = f"%{q.strip().lower()}%"
    rows = (
        await platform_session.execute(
            select(DimPerson)
            .where(
                or_(
                    func.lower(DimPerson.email).like(like),
                    func.lower(DimPerson.full_name).like(like),
                    func.lower(DimPerson.display_name).like(like),
                    func.lower(DimPerson.first_name).like(like),
                ),
                or_(DimPerson.is_deleted.is_(None), DimPerson.is_deleted == 0),
            )
            .order_by(DimPerson.display_name, DimPerson.full_name, DimPerson.email)
            .limit(20)
        )
    ).scalars().all()
    return [
        PersonRef(
            person_id=p.person_id,
            email=p.email,
            full_name=(p.display_name or p.full_name or f"{p.first_name or ''} {p.last_name or ''}").strip(),
        )
        for p in rows
    ]


@router.get("/scan/{code:path}", response_model=ScanLookupResponse)
async def scan_lookup(
    code: str,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_ims_viewer()),
):
    needle = code.strip()
    row = (
        await session.execute(
            select(ImsAsset)
            .options(*ASSET_LOADERS)
            .where(
                ImsAsset.is_deleted.is_(False),
                or_(ImsAsset.asset_tag == needle, ImsAsset.serial_number == needle),
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    return ScanLookupResponse(found=bool(row), asset=inv.asset_to_out(row) if row else None)


def _assignment_out(row: ImsAssetAssignment) -> AssignmentOut:
    return AssignmentOut(
        assignment_id=row.assignment_id,
        asset_id=row.asset_id,
        action=row.action,
        person_id=row.person_id,
        person_email=row.person_email,
        person_name=row.person_name,
        from_location_id=row.from_location_id,
        to_location_id=row.to_location_id,
        assigned_at=row.assigned_at,
        returned_at=row.returned_at,
        condition_out=row.condition_out,
        condition_in=row.condition_in,
        handover_doc_url=row.handover_doc_url,
        acknowledged_at=row.acknowledged_at,
        notes=row.notes,
        asset_tag=row.asset.asset_tag if row.asset else None,
    )


@router.get("/assignments", response_model=list[AssignmentOut])
async def list_assignments(
    asset_id: Optional[int] = None,
    person_email: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_ims_viewer()),
):
    stmt = select(ImsAssetAssignment).options(selectinload(ImsAssetAssignment.asset))
    if asset_id:
        stmt = stmt.where(ImsAssetAssignment.asset_id == asset_id)
    if person_email:
        stmt = stmt.where(func.lower(ImsAssetAssignment.person_email) == person_email.strip().lower())
    rows = (await session.execute(stmt.order_by(ImsAssetAssignment.assigned_at.desc()).limit(200))).scalars().all()
    return [_assignment_out(r) for r in rows]


@router.post("/assignments/checkout", response_model=AssetOut)
async def checkout_asset(
    body: AssignmentCreate,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_ims_operator()),
):
    asset = await _load_asset(session, body.asset_id)
    if asset.status not in {"IN_STOCK", "RESERVED"}:
        raise HTTPException(status.HTTP_409_CONFLICT, "Asset is not available for checkout")
    row = ImsAssetAssignment(
        asset_id=asset.asset_id,
        action="CHECKOUT",
        person_id=body.person_id,
        person_email=body.person_email,
        person_name=body.person_name,
        from_location_id=asset.location_id,
        to_location_id=body.location_id or asset.location_id,
        condition_out=body.condition_out or asset.condition_rating,
        notes=body.notes,
        created_by_email=user.email,
    )
    asset.status = "ASSIGNED"
    asset.assigned_person_id = body.person_id
    asset.assigned_email = body.person_email
    asset.assigned_name = body.person_name
    if body.location_id:
        asset.location_id = body.location_id
    asset.updated_by_email = user.email
    session.add(row)
    await write_audit_log(session, actor=user, action="asset.checkout", entity_type="ims_asset", entity_id=str(asset.asset_id), before=None, after={"assigned_email": asset.assigned_email}, context=get_request_context(request))
    await session.commit()
    return inv.asset_to_out(await _load_asset(session, asset.asset_id))


@router.post("/assets/{asset_id}/checkin", response_model=AssetOut)
async def checkin_asset(
    asset_id: int,
    body: CheckinCreate,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_ims_operator()),
):
    asset = await _load_asset(session, asset_id)
    if asset.status != "ASSIGNED":
        raise HTTPException(status.HTTP_409_CONFLICT, "Only assigned assets can be checked in")
    row = ImsAssetAssignment(
        asset_id=asset.asset_id,
        action="CHECKIN",
        person_id=asset.assigned_person_id,
        person_email=asset.assigned_email,
        person_name=asset.assigned_name,
        from_location_id=asset.location_id,
        to_location_id=body.location_id or asset.location_id,
        returned_at=datetime.utcnow(),
        condition_in=body.condition_in,
        notes=body.notes,
        created_by_email=user.email,
    )
    asset.status = "IN_STOCK"
    asset.assigned_person_id = None
    asset.assigned_email = None
    asset.assigned_name = None
    if body.location_id:
        asset.location_id = body.location_id
    if body.condition_in:
        asset.condition_rating = body.condition_in
    asset.updated_by_email = user.email
    session.add(row)
    await write_audit_log(session, actor=user, action="asset.checkin", entity_type="ims_asset", entity_id=str(asset.asset_id), before=None, after={"status": asset.status}, context=get_request_context(request))
    await session.commit()
    return inv.asset_to_out(await _load_asset(session, asset.asset_id))


@router.post("/assignments/transfer", response_model=AssetOut)
async def transfer_asset(
    body: TransferCreate,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_ims_operator()),
):
    asset = await _load_asset(session, body.asset_id)
    row = ImsAssetAssignment(
        asset_id=asset.asset_id,
        action="TRANSFER",
        person_id=body.person_id or asset.assigned_person_id,
        person_email=body.person_email or asset.assigned_email,
        person_name=body.person_name or asset.assigned_name,
        from_location_id=asset.location_id,
        to_location_id=body.location_id or asset.location_id,
        notes=body.notes,
        created_by_email=user.email,
    )
    if body.person_id or body.person_email or body.person_name:
        asset.assigned_person_id = body.person_id
        asset.assigned_email = body.person_email
        asset.assigned_name = body.person_name
        asset.status = "ASSIGNED"
    if body.location_id:
        asset.location_id = body.location_id
    asset.updated_by_email = user.email
    session.add(row)
    await write_audit_log(session, actor=user, action="asset.transfer", entity_type="ims_asset", entity_id=str(asset.asset_id), before=None, after={"location_id": asset.location_id, "assigned_email": asset.assigned_email}, context=get_request_context(request))
    await session.commit()
    return inv.asset_to_out(await _load_asset(session, asset.asset_id))


@router.get("/assets/{asset_id}/label")
async def asset_label(
    asset_id: int,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_ims_viewer()),
):
    asset = await _load_asset(session, asset_id)
    return {
        "asset_id": asset.asset_id,
        "asset_tag": asset.asset_tag,
        "serial_number": asset.serial_number,
        "qr_payload": asset.asset_tag,
        "label_text": f"{asset.asset_tag}\n{asset.model_name or ''}\n{asset.serial_number or ''}".strip(),
    }


def _purchase_out(row: ImsPurchase) -> PurchaseOut:
    return PurchaseOut(
        purchase_id=row.purchase_id,
        vendor_id=row.vendor_id,
        vendor_name=row.vendor.name if row.vendor else None,
        invoice_number=row.invoice_number,
        invoice_date=row.invoice_date,
        currency=row.currency,
        subtotal=row.subtotal,
        tax=row.tax,
        total=row.total,
        drive_folder_id=row.drive_folder_id,
        invoice_file_url=row.invoice_file_url,
        notes=row.notes,
        created_at=row.created_at,
    )


@router.get("/purchases", response_model=list[PurchaseOut])
async def list_purchases(
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_ims_viewer()),
):
    rows = (await session.execute(select(ImsPurchase).options(selectinload(ImsPurchase.vendor)).order_by(ImsPurchase.created_at.desc()).limit(200))).scalars().all()
    return [_purchase_out(r) for r in rows]


@router.post("/purchases", response_model=PurchaseOut, status_code=status.HTTP_201_CREATED)
async def create_purchase(
    body: PurchaseCreate,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_ims_operator()),
):
    data = body.model_dump(exclude={"lines"})
    row = ImsPurchase(**data, created_by_email=user.email)
    session.add(row)
    await session.flush()
    for line in body.lines:
        line_total = line.total_cost
        if line_total is None and line.unit_cost is not None:
            line_total = line.unit_cost * line.quantity
        session.add(ImsPurchaseLine(**line.model_dump(exclude={"total_cost"}), total_cost=line_total, purchase_id=row.purchase_id))
        if line.asset_id:
            asset = await session.get(ImsAsset, line.asset_id)
            if asset:
                asset.vendor_id = body.vendor_id or asset.vendor_id
                asset.purchase_date = body.invoice_date or asset.purchase_date
                asset.purchase_cost = line.unit_cost or asset.purchase_cost
                asset.updated_by_email = user.email
    await write_audit_log(session, actor=user, action="purchase.create", entity_type="ims_purchase", entity_id=str(row.purchase_id), before=None, after={"invoice_number": row.invoice_number}, context=get_request_context(request))
    await session.commit()
    row = (await session.execute(select(ImsPurchase).options(selectinload(ImsPurchase.vendor)).where(ImsPurchase.purchase_id == row.purchase_id))).scalar_one()
    return _purchase_out(row)


def _repair_out(row: ImsRepair) -> RepairOut:
    return RepairOut(
        repair_id=row.repair_id,
        asset_id=row.asset_id,
        asset_tag=row.asset.asset_tag if row.asset else None,
        reported_fault=row.reported_fault,
        vendor_id=row.vendor_id,
        vendor_name=row.vendor.name if row.vendor else None,
        sent_at=row.sent_at,
        expected_return_at=row.expected_return_at,
        returned_at=row.returned_at,
        status=row.status,
        outcome=row.outcome,
        warranty_covered=row.warranty_covered,
        estimated_cost=row.estimated_cost,
        final_cost=row.final_cost,
        loaner_asset_id=row.loaner_asset_id,
        notes=row.notes,
    )


@router.get("/repairs", response_model=list[RepairOut])
async def list_repairs(
    asset_id: Optional[int] = None,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_ims_viewer()),
):
    stmt = select(ImsRepair).options(selectinload(ImsRepair.asset), selectinload(ImsRepair.vendor))
    if asset_id:
        stmt = stmt.where(ImsRepair.asset_id == asset_id)
    rows = (await session.execute(stmt.order_by(ImsRepair.created_at.desc()).limit(200))).scalars().all()
    return [_repair_out(r) for r in rows]


@router.post("/repairs", response_model=RepairOut, status_code=status.HTTP_201_CREATED)
async def send_for_repair(
    body: RepairCreate,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_ims_operator()),
):
    asset = await _load_asset(session, body.asset_id)
    if asset.status == "RETIRED":
        raise HTTPException(status.HTTP_409_CONFLICT, "Retired assets cannot be repaired")
    repair = ImsRepair(**body.model_dump(), created_by_email=user.email, updated_by_email=user.email)
    asset.status = "IN_REPAIR"
    asset.updated_by_email = user.email
    session.add(repair)
    await session.flush()
    await write_audit_log(session, actor=user, action="repair.send", entity_type="ims_repair", entity_id=str(repair.repair_id), before=None, after={"asset_id": asset.asset_id}, context=get_request_context(request))
    await session.commit()
    repair = (await session.execute(select(ImsRepair).options(selectinload(ImsRepair.asset), selectinload(ImsRepair.vendor)).where(ImsRepair.repair_id == repair.repair_id))).scalar_one()
    return _repair_out(repair)


@router.post("/repairs/{repair_id}/return", response_model=RepairOut)
async def mark_repair_returned(
    repair_id: int,
    body: RepairReturn,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_ims_operator()),
):
    repair = (await session.execute(select(ImsRepair).options(selectinload(ImsRepair.asset), selectinload(ImsRepair.vendor)).where(ImsRepair.repair_id == repair_id))).scalar_one_or_none()
    if not repair:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Repair not found")
    repair.status = "RETURNED"
    repair.outcome = body.outcome
    repair.returned_at = datetime.utcnow()
    repair.final_cost = body.final_cost
    repair.parts_replaced = body.parts_replaced
    repair.notes = body.notes or repair.notes
    repair.updated_by_email = user.email
    if repair.asset:
        repair.asset.status = "RETIRED" if body.outcome == "BER" else "ASSIGNED" if body.return_to_owner and repair.asset.assigned_email else "IN_STOCK"
        if body.condition_rating:
            repair.asset.condition_rating = body.condition_rating
        repair.asset.updated_by_email = user.email
    await write_audit_log(session, actor=user, action="repair.return", entity_type="ims_repair", entity_id=str(repair.repair_id), before=None, after={"status": repair.status, "outcome": repair.outcome}, context=get_request_context(request))
    await session.commit()
    return _repair_out(repair)


@router.post("/attachments", response_model=AttachmentOut, status_code=status.HTTP_201_CREATED)
async def upload_attachment(
    entity_type: str,
    entity_id: int,
    kind: str = "OTHER",
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_ims_operator()),
):
    content = await file.read()
    folder_parts = [kind.title(), entity_type, str(entity_id)]
    try:
        drive_result = drive_service.upload_file(folder_parts, file.filename or "attachment", file.content_type, content)
    except RuntimeError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc))
    row = ImsAttachment(
        entity_type=entity_type,
        entity_id=entity_id,
        kind=kind,
        filename=file.filename or "attachment",
        content_type=file.content_type,
        drive_file_id=drive_result.drive_file_id,
        web_view_link=drive_result.web_view_link,
        created_by_email=user.email,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row


@router.get("/attachments", response_model=list[AttachmentOut])
async def list_attachments(
    entity_type: str,
    entity_id: int,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_ims_viewer()),
):
    rows = (await session.execute(select(ImsAttachment).where(ImsAttachment.entity_type == entity_type, ImsAttachment.entity_id == entity_id).order_by(ImsAttachment.created_at.desc()))).scalars().all()
    return rows


def _license_out(row: ImsLicense, assigned: int = 0) -> LicenseOut:
    return LicenseOut(
        license_id=row.license_id,
        name=row.name,
        vendor_id=row.vendor_id,
        vendor_name=row.vendor.name if row.vendor else None,
        license_type=row.license_type,
        billing_cycle=row.billing_cycle,
        total_seats=row.total_seats,
        assigned_seats=assigned,
        cost=row.cost,
        currency=row.currency,
        renewal_date=row.renewal_date,
        registered_email=row.registered_email,
        is_active=row.is_active,
        notes=row.notes,
    )


@router.get("/licenses", response_model=list[LicenseOut])
async def list_licenses(
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_ims_viewer()),
):
    rows = (await session.execute(select(ImsLicense).options(selectinload(ImsLicense.vendor)).order_by(ImsLicense.name))).scalars().all()
    counts = dict((await session.execute(select(ImsLicenseSeat.license_id, func.count()).where(ImsLicenseSeat.released_at.is_(None)).group_by(ImsLicenseSeat.license_id))).all())
    return [_license_out(r, int(counts.get(r.license_id, 0))) for r in rows]


@router.post("/licenses", response_model=LicenseOut, status_code=status.HTTP_201_CREATED)
async def create_license(
    body: LicenseCreate,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_ims_operator()),
):
    row = ImsLicense(**body.model_dump(), created_by_email=user.email)
    session.add(row)
    await session.commit()
    row = (await session.execute(select(ImsLicense).options(selectinload(ImsLicense.vendor)).where(ImsLicense.license_id == row.license_id))).scalar_one()
    return _license_out(row)


@router.get("/licenses/{license_id}/seats", response_model=list[LicenseSeatOut])
async def list_license_seats(
    license_id: int,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_ims_viewer()),
):
    rows = (await session.execute(select(ImsLicenseSeat).where(ImsLicenseSeat.license_id == license_id).order_by(ImsLicenseSeat.assigned_at.desc()))).scalars().all()
    return rows


@router.post("/licenses/{license_id}/seats", response_model=LicenseSeatOut, status_code=status.HTTP_201_CREATED)
async def assign_license_seat(
    license_id: int,
    body: LicenseSeatCreate,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_ims_operator()),
):
    license_row = await session.get(ImsLicense, license_id)
    if not license_row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "License not found")
    used = (await session.execute(select(func.count()).select_from(ImsLicenseSeat).where(ImsLicenseSeat.license_id == license_id, ImsLicenseSeat.released_at.is_(None)))).scalar_one()
    if used >= license_row.total_seats:
        raise HTTPException(status.HTTP_409_CONFLICT, "No free seats available")
    row = ImsLicenseSeat(license_id=license_id, **body.model_dump(), created_by_email=user.email)
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row


@router.post("/license-seats/{seat_id}/release", response_model=LicenseSeatOut)
async def release_license_seat(
    seat_id: int,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_ims_operator()),
):
    row = await session.get(ImsLicenseSeat, seat_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Seat not found")
    row.released_at = datetime.utcnow()
    await session.commit()
    await session.refresh(row)
    return row


def _consumable_out(row: ImsConsumable) -> ConsumableOut:
    return ConsumableOut(
        consumable_id=row.consumable_id,
        name=row.name,
        category_id=row.category_id,
        category_name=row.category.name if row.category else None,
        unit=row.unit,
        current_qty=row.current_qty,
        min_qty=row.min_qty,
        location_id=row.location_id,
        location_name=row.location.name if row.location else None,
        is_active=row.is_active,
        low_stock=row.current_qty <= row.min_qty,
    )


@router.get("/consumables", response_model=list[ConsumableOut])
async def list_consumables(
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_ims_viewer()),
):
    rows = (await session.execute(select(ImsConsumable).options(selectinload(ImsConsumable.category), selectinload(ImsConsumable.location)).order_by(ImsConsumable.name))).scalars().all()
    return [_consumable_out(r) for r in rows]


@router.post("/consumables", response_model=ConsumableOut, status_code=status.HTTP_201_CREATED)
async def create_consumable(
    body: ConsumableCreate,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_ims_operator()),
):
    row = ImsConsumable(**body.model_dump(), created_by_email=user.email)
    session.add(row)
    await session.commit()
    row = (await session.execute(select(ImsConsumable).options(selectinload(ImsConsumable.category), selectinload(ImsConsumable.location)).where(ImsConsumable.consumable_id == row.consumable_id))).scalar_one()
    return _consumable_out(row)


@router.post("/consumables/{consumable_id}/transactions", response_model=ConsumableTxnOut, status_code=status.HTTP_201_CREATED)
async def create_consumable_txn(
    consumable_id: int,
    body: ConsumableTxnCreate,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_ims_operator()),
):
    item = await session.get(ImsConsumable, consumable_id)
    if not item:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Consumable not found")
    if body.direction == "IN":
        item.current_qty += body.qty
    elif body.direction == "OUT":
        if item.current_qty < body.qty:
            raise HTTPException(status.HTTP_409_CONFLICT, "Not enough stock")
        item.current_qty -= body.qty
    elif body.direction == "ADJUST":
        item.current_qty = body.qty
    else:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid transaction direction")
    row = ImsConsumableTxn(consumable_id=consumable_id, **body.model_dump(), created_by_email=user.email)
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row


@router.get("/consumables/{consumable_id}/transactions", response_model=list[ConsumableTxnOut])
async def list_consumable_txns(
    consumable_id: int,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_ims_viewer()),
):
    rows = (await session.execute(select(ImsConsumableTxn).where(ImsConsumableTxn.consumable_id == consumable_id).order_by(ImsConsumableTxn.created_at.desc()).limit(100))).scalars().all()
    return rows


# ── P5: finance, cost ledger, forecasting ─────────────────────────────────────
def _budget_out(row: ImsBudget) -> BudgetOut:
    return BudgetOut(
        budget_id=row.budget_id,
        fy=row.fy,
        category_id=row.category_id,
        category_name=row.category.name if row.category else None,
        planned_amount=row.planned_amount,
        notes=row.notes,
    )


@router.get("/finance/summary", response_model=FinanceSummaryOut)
async def finance_summary(
    fy: Optional[int] = None,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_ims_manager()),
):
    return await ims_analytics.finance_summary(session, fy)


@router.get("/finance/cost-events", response_model=list[CostEventOut])
async def finance_cost_events(
    fy: Optional[int] = None,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_ims_manager()),
):
    rows = await ims_analytics.ledger_events(session)
    return [row for row in rows if fy is None or row.fy == fy]


@router.get("/finance/budgets", response_model=list[BudgetOut])
async def list_budgets(
    fy: Optional[int] = None,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_ims_manager()),
):
    stmt = select(ImsBudget).options(selectinload(ImsBudget.category)).order_by(ImsBudget.fy.desc())
    if fy:
        stmt = stmt.where(ImsBudget.fy == fy)
    rows = (await session.execute(stmt)).scalars().all()
    return [_budget_out(row) for row in rows]


@router.post("/finance/budgets", response_model=BudgetOut, status_code=status.HTTP_201_CREATED)
async def create_budget(
    body: BudgetCreate,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_ims_admin()),
):
    row = ImsBudget(**body.model_dump(), created_by_email=user.email)
    session.add(row)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Budget already exists for this FY/category")
    row = (
        await session.execute(
            select(ImsBudget).options(selectinload(ImsBudget.category)).where(ImsBudget.budget_id == row.budget_id)
        )
    ).scalar_one()
    return _budget_out(row)


@router.get("/finance/export.csv")
async def export_finance_csv(
    fy: Optional[int] = None,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_ims_manager()),
):
    from fastapi.responses import Response

    rows = await ims_analytics.ledger_events(session)
    rows = [row for row in rows if fy is None or row.fy == fy]
    lines = ["fy,month,cost_type,source,category,vendor,amount,currency,event_date,description"]
    for row in rows:
        safe_desc = (row.description or "").replace(",", " ")
        lines.append(
            f"{row.fy},{row.month},{row.cost_type},{row.source},{row.category_name or ''},{row.vendor_name or ''},{row.amount},{row.currency},{row.event_date},{safe_desc}"
        )
    return Response("\n".join(lines), media_type="text/csv")


# ── P6: dashboards, alerts, saved views, self-service ─────────────────────────
@router.get("/dashboard/summary", response_model=DashboardSummaryOut)
async def dashboard_summary(
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_ims_viewer()),
):
    return await ims_analytics.dashboard_summary(session)


@router.get("/alerts", response_model=list[AlertOut])
async def list_alerts(
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_ims_viewer()),
):
    return await ims_analytics.computed_alerts(session)


@router.get("/dashboard/views", response_model=list[DashboardViewOut])
async def list_dashboard_views(
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_ims_viewer()),
):
    rows = (
        await session.execute(
            select(ImsDashboardView).order_by(ImsDashboardView.created_at.desc()).limit(100)
        )
    ).scalars().all()
    return rows


@router.post("/dashboard/views", response_model=DashboardViewOut, status_code=status.HTTP_201_CREATED)
async def create_dashboard_view(
    body: DashboardViewCreate,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_ims_viewer()),
):
    row = ImsDashboardView(**body.model_dump(), created_by_email=user.email)
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row


@router.get("/my/assets", response_model=list[AssetOut])
async def my_assets(
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_employee()),
):
    email = (user.email or "").strip().lower()
    person_id = user.person_id_platform
    filters = [ImsAsset.is_deleted.is_(False)]
    if person_id:
        filters.append(or_(func.lower(ImsAsset.assigned_email) == email, ImsAsset.assigned_person_id == person_id))
    else:
        filters.append(func.lower(ImsAsset.assigned_email) == email)
    rows = (
        await session.execute(
            select(ImsAsset).options(*ASSET_LOADERS).where(*filters).order_by(ImsAsset.asset_tag)
        )
    ).scalars().all()
    return [inv.asset_to_out(row) for row in rows]


@router.post("/assignments/{assignment_id}/acknowledge", response_model=AssignmentOut)
async def acknowledge_assignment(
    assignment_id: int,
    session: AsyncSession = Depends(get_session),
    user: UserContext = Depends(require_employee()),
):
    row = (
        await session.execute(
            select(ImsAssetAssignment).options(selectinload(ImsAssetAssignment.asset)).where(ImsAssetAssignment.assignment_id == assignment_id)
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Assignment not found")
    user_email = (user.email or "").strip().lower()
    if row.person_email and row.person_email.strip().lower() != user_email:
        # IMS operators/admins can acknowledge while correcting records; employees cannot acknowledge someone else's handover.
        role_codes = {r.value for r in user.roles}
        if not role_codes.intersection({"ims_operator", "ims_manager", "ims_admin", "admin", "superadmin"}):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Cannot acknowledge another person's assignment")
    row.acknowledged_at = datetime.utcnow()
    await session.commit()
    await session.refresh(row)
    return _assignment_out(row)
