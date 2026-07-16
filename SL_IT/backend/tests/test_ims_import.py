import pytest

from app.models.ims import ImsAsset, ImsAuditLog, ImsCategory, ImsManufacturer
from app.models.platform import DimPerson
from app.schemas.user import UserContext
from app.services import ims_import


@pytest.fixture()
async def seeded(db_session):
    cat = ImsCategory(name="Laptop", code="LP")
    db_session.add(cat)
    person = DimPerson(person_id="p1", person_code="p1", email="jane@studiolotus.in", first_name="Jane", full_name="Jane Doe")
    db_session.add(person)
    await db_session.flush()
    return {"category": cat, "person": person}


@pytest.fixture()
def user():
    return UserContext(user_id="u1", email="admin@studiolotus.in", roles=["superadmin"])


async def _import(db_session, user, rows, dry_run):
    return await ims_import.run_import(db_session, db_session, user, rows, dry_run=dry_run)


@pytest.mark.asyncio
async def test_create_new_asset(db_session, seeded, user):
    # Explicit asset_tag here — the auto-tag sequence generator
    # (ims_inventory.generate_asset_tag) uses MySQL's ON DUPLICATE KEY UPDATE,
    # which the sqlite test harness doesn't support; that codepath is shared
    # with the existing single-asset create endpoint and isn't new here.
    rows = ims_import.parse_csv(
        b"asset_tag,serial_number,category,manufacturer,model_name,status,condition_rating,location,assigned_email,vendor,purchase_cost,currency,purchase_date,warranty_start,warranty_end,in_service_date,useful_life_years,notes\n"
        b"SL-LP-2026-0009,SN-001,Laptop,Dell,Latitude 5440,,,,,,75000,INR,,,,,,\n"
    )
    result = await _import(db_session, user, rows, dry_run=False)
    assert result.created == 1 and result.errors == 0
    row = result.rows[0]
    assert row.action == "CREATE"
    assert row.asset_tag == "SL-LP-2026-0009"

    asset = (await db_session.execute(ImsAsset.__table__.select())).mappings().first()
    assert asset["serial_number"] == "SN-001"
    assert asset["status"] == "IN_STOCK"


@pytest.mark.asyncio
async def test_update_only_touches_changed_fields(db_session, seeded, user):
    cat = seeded["category"]
    asset = ImsAsset(asset_tag="SL-LP-2026-0001", serial_number="SN-100", category_id=cat.category_id, model_name="Old Model", notes="keep me")
    db_session.add(asset)
    await db_session.flush()

    rows = ims_import.parse_csv(
        (
            "asset_tag,serial_number,category,manufacturer,model_name,status,condition_rating,location,assigned_email,vendor,purchase_cost,currency,purchase_date,warranty_start,warranty_end,in_service_date,useful_life_years,notes\n"
            "SL-LP-2026-0001,SN-100,Laptop,,New Model,,,,,,,,,,,,,\n"
        ).encode()
    )
    result = await _import(db_session, user, rows, dry_run=False)
    assert result.updated == 1 and result.errors == 0
    assert set(result.rows[0].changes.keys()) == {"model_name"}

    await db_session.refresh(asset)
    assert asset.model_name == "New Model"
    assert asset.notes == "keep me"  # untouched — blank cell means leave-as-is
    assert asset.serial_number == "SN-100"


@pytest.mark.asyncio
async def test_unchanged_row_writes_no_audit_log(db_session, seeded, user):
    cat = seeded["category"]
    asset = ImsAsset(asset_tag="SL-LP-2026-0002", serial_number="SN-200", category_id=cat.category_id, model_name="Same Model")
    db_session.add(asset)
    await db_session.flush()

    rows = ims_import.parse_csv(
        (
            "asset_tag,serial_number,category,manufacturer,model_name,status,condition_rating,location,assigned_email,vendor,purchase_cost,currency,purchase_date,warranty_start,warranty_end,in_service_date,useful_life_years,notes\n"
            "SL-LP-2026-0002,SN-200,Laptop,,Same Model,,,,,,,,,,,,,\n"
        ).encode()
    )
    result = await _import(db_session, user, rows, dry_run=False)
    assert result.unchanged == 1 and result.updated == 0 and result.created == 0

    logs = (await db_session.execute(ImsAuditLog.__table__.select())).mappings().all()
    assert len(logs) == 0


@pytest.mark.asyncio
async def test_unknown_category_errors_without_writing(db_session, seeded, user):
    rows = ims_import.parse_csv(
        (
            "asset_tag,serial_number,category,manufacturer,model_name,status,condition_rating,location,assigned_email,vendor,purchase_cost,currency,purchase_date,warranty_start,warranty_end,in_service_date,useful_life_years,notes\n"
            ",SN-300,Server Rack,,,,,,,,,,,,,,,\n"
        ).encode()
    )
    result = await _import(db_session, user, rows, dry_run=False)
    assert result.errors == 1 and result.created == 0
    assert "Unknown category" in result.rows[0].error

    count = (await db_session.execute(ImsAsset.__table__.select())).mappings().all()
    assert len(count) == 0


@pytest.mark.asyncio
async def test_unknown_manufacturer_autocreates_on_commit_not_preview(db_session, seeded, user):
    rows = ims_import.parse_csv(
        (
            "asset_tag,serial_number,category,manufacturer,model_name,status,condition_rating,location,assigned_email,vendor,purchase_cost,currency,purchase_date,warranty_start,warranty_end,in_service_date,useful_life_years,notes\n"
            "SL-LP-2026-0010,SN-400,Laptop,BrandNewCo,,,,,,,,,,,,,,\n"
        ).encode()
    )
    preview = await _import(db_session, user, rows, dry_run=True)
    assert preview.created == 1
    assert preview.rows[0].changes["manufacturer"] == [None, "(new) BrandNewCo"]
    makers = (await db_session.execute(ImsManufacturer.__table__.select())).mappings().all()
    assert len(makers) == 0  # preview must not write

    commit = await _import(db_session, user, rows, dry_run=False)
    assert commit.created == 1
    makers = (await db_session.execute(ImsManufacturer.__table__.select())).mappings().all()
    assert len(makers) == 1 and makers[0]["name"] == "BrandNewCo"
