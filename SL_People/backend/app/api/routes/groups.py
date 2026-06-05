from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db_session, get_platform_db_session, require_view
from app.schemas.assets import GroupOverviewResponse
from app.schemas.user import UserContext
from app.services import assets

router = APIRouter(prefix="/ppl/groups", tags=["groups"])


@router.get("/overview", response_model=GroupOverviewResponse)
async def overview(
    user: UserContext = Depends(require_view),
    db: AsyncSession = Depends(get_db_session),
    platform: AsyncSession = Depends(get_platform_db_session),
) -> GroupOverviewResponse:
    return await assets.groups_overview(db, platform)
