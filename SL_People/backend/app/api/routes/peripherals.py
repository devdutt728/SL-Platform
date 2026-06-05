from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db_session, require_edit, require_view
from app.models.people import PeripheralInventory
from app.schemas.assets import (
    PeripheralInventoryCreate,
    PeripheralInventoryListResponse,
    PeripheralInventoryPatch,
)
from app.schemas.user import UserContext
from app.services import assets

router = APIRouter(prefix="/ppl/peripherals", tags=["peripherals"])


async def _load_peripheral(db: AsyncSession, key: str) -> PeripheralInventory:
    row = await db.get(PeripheralInventory, key)
    if row:
        return row
    row = (
        await db.execute(select(PeripheralInventory).where(PeripheralInventory.item_id == key))
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Peripheral not found")
    return row


@router.get("", response_model=PeripheralInventoryListResponse)
async def list_peripherals(
    search: Optional[str] = None,
    category: Optional[str] = None,
    condition: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    limit: int = Query(200, ge=1, le=500),
    user: UserContext = Depends(require_view),
    db: AsyncSession = Depends(get_db_session),
) -> PeripheralInventoryListResponse:
    items, total = await assets.list_peripherals(
        db,
        search=search,
        category=category,
        condition=condition,
        status=status_filter,
        page=page,
        limit=limit,
    )
    return PeripheralInventoryListResponse(items=items, total=total, page=page, limit=limit)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_peripheral(
    body: PeripheralInventoryCreate,
    user: UserContext = Depends(require_edit),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    exists = (
        await db.execute(select(PeripheralInventory.id).where(PeripheralInventory.item_id == body.item_id))
    ).scalar_one_or_none()
    if exists:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="item_id already exists")
    row = PeripheralInventory(**assets.normalize_peripheral_payload(body.model_dump(exclude_unset=True)))
    db.add(row)
    await db.commit()
    return {"id": row.id, "item_id": row.item_id}


@router.patch("/{item_id}")
async def patch_peripheral(
    item_id: str,
    body: PeripheralInventoryPatch,
    user: UserContext = Depends(require_edit),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    row = await _load_peripheral(db, item_id)
    data = assets.normalize_peripheral_payload(body.model_dump(exclude_unset=True))
    for key, value in data.items():
        setattr(row, key, value)
    await db.commit()
    return {"updated": True}


@router.delete("/{item_id}")
async def delete_peripheral(
    item_id: str,
    user: UserContext = Depends(require_edit),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    row = await _load_peripheral(db, item_id)
    await db.delete(row)
    await db.commit()
    return {"deleted": True}
