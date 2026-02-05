from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_superadmin
from app.db.platform_session import get_platform_session
from app.models.platform_person import DimPerson, DimPersonRole
from app.models.platform_role import DimRole
from app.schemas.platform_roles import (
    PlatformRoleAssignIn,
    PlatformRoleCreateIn,
    PlatformRoleOut,
    PlatformRoleUpdateIn,
)
from app.schemas.user import UserContext

router = APIRouter(prefix="/platform/roles", tags=["platform"])


def _normalize_code(value: str) -> str:
    return value.strip()


@router.get("", response_model=list[PlatformRoleOut])
async def list_roles(
    session: AsyncSession = Depends(get_platform_session),
    _user: UserContext = Depends(require_superadmin()),
):
    rows = (await session.execute(select(DimRole).order_by(DimRole.role_id.asc()))).scalars().all()
    return [PlatformRoleOut.model_validate(row) for row in rows]


@router.post("", response_model=PlatformRoleOut, status_code=status.HTTP_201_CREATED)
async def create_role(
    payload: PlatformRoleCreateIn,
    session: AsyncSession = Depends(get_platform_session),
    _user: UserContext = Depends(require_superadmin()),
):
    code = _normalize_code(payload.role_code)
    if not code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="role_code is required")
    existing = (
        await session.execute(select(DimRole).where(DimRole.role_code == code))
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Role code already exists")

    role_id = payload.role_id
    if role_id is None:
        role_id = (await session.execute(select(func.coalesce(func.max(DimRole.role_id), 0)))).scalar_one() + 1
    else:
        exists_id = (
            await session.execute(select(DimRole).where(DimRole.role_id == role_id))
        ).scalar_one_or_none()
        if exists_id:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Role id already exists")

    role = DimRole(role_id=role_id, role_code=code, role_name=(payload.role_name or "").strip() or None)
    session.add(role)
    await session.commit()
    await session.refresh(role)
    return PlatformRoleOut.model_validate(role)


@router.patch("/{role_id}", response_model=PlatformRoleOut)
async def update_role(
    role_id: int,
    payload: PlatformRoleUpdateIn,
    session: AsyncSession = Depends(get_platform_session),
    _user: UserContext = Depends(require_superadmin()),
):
    role = await session.get(DimRole, role_id)
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
    if payload.role_code is not None:
        code = _normalize_code(payload.role_code)
        if not code:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="role_code cannot be empty")
        existing = (
            await session.execute(select(DimRole).where(DimRole.role_code == code, DimRole.role_id != role_id))
        ).scalar_one_or_none()
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Role code already exists")
        role.role_code = code
    if payload.role_name is not None:
        role.role_name = payload.role_name.strip() or None
    await session.commit()
    await session.refresh(role)
    return PlatformRoleOut.model_validate(role)


@router.delete("/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_role(
    role_id: int,
    session: AsyncSession = Depends(get_platform_session),
    _user: UserContext = Depends(require_superadmin()),
):
    role = await session.get(DimRole, role_id)
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")
    await session.delete(role)
    await session.commit()
    return None


@router.patch("/assign/{person_id}", status_code=status.HTTP_200_OK)
async def assign_role(
    person_id: str,
    payload: PlatformRoleAssignIn,
    session: AsyncSession = Depends(get_platform_session),
    _user: UserContext = Depends(require_superadmin()),
):
    person = await session.get(DimPerson, person_id)
    if not person:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Person not found")
    role_ids = sorted({int(role_id) for role_id in payload.role_ids if role_id is not None})
    if role_ids:
        found_roles = (
            await session.execute(select(DimRole.role_id).where(DimRole.role_id.in_(role_ids)))
        ).scalars().all()
        found_set = {int(role_id) for role_id in found_roles}
        missing = [role_id for role_id in role_ids if role_id not in found_set]
        if missing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")

    await session.execute(delete(DimPersonRole).where(DimPersonRole.person_id == person_id))
    if role_ids:
        session.add_all(
            [DimPersonRole(person_id=person_id, role_id=role_id) for role_id in role_ids]
        )

    await session.commit()
    return {"person_id": person_id, "role_ids": role_ids}
