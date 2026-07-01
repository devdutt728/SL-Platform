from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db_session, require_edit, require_view
from app.models.people import SystemInventory
from app.schemas.assets import (
    SystemGradePreviewRequest,
    SystemGradePreviewResponse,
    SystemInventoryCreate,
    SystemInventoryListResponse,
    SystemInventoryPatch,
)
from app.schemas.user import UserContext
from app.services import assets
from app.services.console_logic import grade_pc

router = APIRouter(prefix="/ppl/systems", tags=["systems"])


async def _load_system(db: AsyncSession, key: str) -> SystemInventory:
    row = await db.get(SystemInventory, key)
    if row:
        return row
    row = (
        await db.execute(select(SystemInventory).where(SystemInventory.system_id == key))
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="System not found")
    return row


@router.get("", response_model=SystemInventoryListResponse)
async def list_systems(
    search: Optional[str] = None,
    tier: Optional[str] = None,
    team: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    visibility: str = Query("current", pattern="^(current|fixed|stock|all|non_current|non-current)$"),
    page: int = Query(1, ge=1),
    limit: int = Query(200, ge=1, le=500),
    user: UserContext = Depends(require_view),
    db: AsyncSession = Depends(get_db_session),
) -> SystemInventoryListResponse:
    items, total, tier_counts = await assets.list_systems(
        db,
        search=search,
        tier=tier,
        team=team,
        status=status_filter,
        visibility=visibility,
        page=page,
        limit=limit,
    )
    return SystemInventoryListResponse(items=items, total=total, tier_counts=tier_counts, page=page, limit=limit)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_system(
    body: SystemInventoryCreate,
    user: UserContext = Depends(require_edit),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    exists = (
        await db.execute(select(SystemInventory.id).where(SystemInventory.system_id == body.system_id))
    ).scalar_one_or_none()
    if exists:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="system_id already exists")
    data = assets.normalize_system_payload(body.model_dump(exclude_unset=True))
    row = SystemInventory(**data)
    assets.regrade_system(row)
    db.add(row)
    await db.commit()
    return {"id": row.id, "system_id": row.system_id, "tier": row.capability_tier, "score": row.composite_score}


@router.post("/grade-preview", response_model=SystemGradePreviewResponse)
async def grade_preview(
    body: SystemGradePreviewRequest,
    user: UserContext = Depends(require_view),
) -> SystemGradePreviewResponse:
    grade = grade_pc(body.processor, body.graphics_card, str(body.ram_gb or ""))
    return SystemGradePreviewResponse(
        cpu_score=grade.cpu_score,
        gpu_score=grade.gpu_score,
        ram_score=grade.ram_score,
        ram_gb=grade.ram_gb,
        score=grade.score,
        tier=grade.tier,
        capability=grade.capability,
        suggestion=grade.suggestion,
    )


@router.patch("/{system_id}")
async def patch_system(
    system_id: str,
    body: SystemInventoryPatch,
    user: UserContext = Depends(require_edit),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    row = await _load_system(db, system_id)
    data = assets.normalize_system_payload(body.model_dump(exclude_unset=True))
    for key, value in data.items():
        setattr(row, key, value)
    assets.regrade_system(row)
    await db.commit()
    return {"updated": True, "tier": row.capability_tier, "score": row.composite_score}


@router.post("/{system_id}/regrade")
async def regrade_system(
    system_id: str,
    user: UserContext = Depends(require_edit),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    row = await _load_system(db, system_id)
    assets.regrade_system(row)
    await db.commit()
    return {"tier": row.capability_tier, "score": row.composite_score, "suggestion": row.upgrade_suggestion}


@router.delete("/{system_id}")
async def delete_system(
    system_id: str,
    user: UserContext = Depends(require_edit),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    row = await _load_system(db, system_id)
    await db.delete(row)
    await db.commit()
    return {"deleted": True}
