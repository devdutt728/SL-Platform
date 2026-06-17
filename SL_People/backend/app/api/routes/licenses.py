from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db_session, get_platform_db_session, require_edit, require_view
from app.models.people import LicenseAssignment, LicenseContract
from app.schemas.licenses import (
    LicenseAssignmentCreate,
    LicenseAssignmentListResponse,
    LicenseAssignmentPatch,
    LicenseContractCreate,
    LicenseContractListResponse,
    LicenseContractPatch,
    LicenseSummaryResponse,
)
from app.schemas.user import UserContext
from app.services import licenses as license_service

router = APIRouter(prefix="/ppl/licenses", tags=["licenses"])


@router.get("/summary", response_model=LicenseSummaryResponse)
async def summary(
    user: UserContext = Depends(require_view),
    db: AsyncSession = Depends(get_db_session),
    platform: AsyncSession = Depends(get_platform_db_session),
) -> LicenseSummaryResponse:
    return await license_service.license_summary(db, platform)


@router.get("/assignments", response_model=LicenseAssignmentListResponse)
async def list_assignments(
    search: Optional[str] = None,
    tool: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    holder_kind: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(100, ge=1, le=500),
    user: UserContext = Depends(require_view),
    db: AsyncSession = Depends(get_db_session),
    platform: AsyncSession = Depends(get_platform_db_session),
) -> LicenseAssignmentListResponse:
    items, total = await license_service.list_assignments(
        db,
        platform,
        search=search,
        tool=tool,
        status=status_filter,
        holder_kind=holder_kind,
        page=page,
        limit=limit,
    )
    return LicenseAssignmentListResponse(items=items, total=total, page=page, limit=limit)


@router.post("/assignments", status_code=status.HTTP_201_CREATED)
async def create_assignment(
    body: LicenseAssignmentCreate,
    user: UserContext = Depends(require_edit),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    data = license_service.stamp_assignment_defaults(
        body.model_dump(exclude_unset=True),
        default_assigned_on=True,
    )
    row = LicenseAssignment(**data)
    db.add(row)
    await db.commit()
    return {"id": row.id}


@router.patch("/assignments/{assignment_id}")
async def patch_assignment(
    assignment_id: str,
    body: LicenseAssignmentPatch,
    user: UserContext = Depends(require_edit),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    row = await db.get(LicenseAssignment, assignment_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")
    data = license_service.stamp_assignment_defaults(body.model_dump(exclude_unset=True))
    for key, value in data.items():
        setattr(row, key, value)
    await db.commit()
    return {"updated": True}


@router.delete("/assignments/{assignment_id}")
async def delete_assignment(
    assignment_id: str,
    user: UserContext = Depends(require_edit),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    row = await db.get(LicenseAssignment, assignment_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")
    await db.delete(row)
    await db.commit()
    return {"deleted": True}


@router.get("/contracts", response_model=LicenseContractListResponse)
async def list_contracts(
    search: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    limit: int = Query(100, ge=1, le=500),
    user: UserContext = Depends(require_view),
    db: AsyncSession = Depends(get_db_session),
) -> LicenseContractListResponse:
    items, total = await license_service.list_contracts(
        db, search=search, status=status_filter, page=page, limit=limit
    )
    return LicenseContractListResponse(items=items, total=total, page=page, limit=limit)


@router.post("/contracts", status_code=status.HTTP_201_CREATED)
async def create_contract(
    body: LicenseContractCreate,
    user: UserContext = Depends(require_edit),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    exists = (
        await db.execute(
            select(LicenseContract.id).where(LicenseContract.contract_key == body.contract_key)
        )
    ).scalar_one_or_none()
    if exists:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="contract_key already exists")
    data = license_service.stamp_contract_defaults(body.model_dump(exclude_unset=True))
    row = LicenseContract(**data)
    db.add(row)
    await db.commit()
    return {"id": row.id}


@router.patch("/contracts/{contract_id}")
async def patch_contract(
    contract_id: str,
    body: LicenseContractPatch,
    user: UserContext = Depends(require_edit),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    row = await db.get(LicenseContract, contract_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contract not found")
    data = license_service.stamp_contract_defaults(body.model_dump(exclude_unset=True))
    for key, value in data.items():
        setattr(row, key, value)
    await db.commit()
    return {"updated": True}


@router.delete("/contracts/{contract_id}")
async def delete_contract(
    contract_id: str,
    user: UserContext = Depends(require_edit),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    row = await db.get(LicenseContract, contract_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contract not found")
    await db.delete(row)
    await db.commit()
    return {"deleted": True}
