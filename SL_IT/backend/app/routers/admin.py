from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.platform_session import get_platform_session
from app.db.session import get_session
from app.models.platform import DimPerson, DimRole
from app.request_context import get_request_context
from app.rbac import require_admin
from app.schemas.user import PlatformRoleOut, PlatformUserListItem, PlatformUserUpdate, UserContext
from app.services.audit_service import write_audit_log
from app.services.user_service import prevent_last_superadmin_change

router = APIRouter(prefix="/admin", tags=["admin"])


def _format_full_name(person: DimPerson) -> str:
    first_name = person.first_name or ""
    last_name = person.last_name or ""
    return (person.display_name or person.full_name or f"{first_name} {last_name}").strip() or (person.email or "")


@router.get("/users", response_model=list[PlatformUserListItem])
async def list_users(
    q: str | None = None,
    platform_session: AsyncSession = Depends(get_platform_session),
    user: UserContext = Depends(require_admin()),
):
    stmt = select(DimPerson, DimRole).outerjoin(DimRole, DimRole.role_id == DimPerson.role_id)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            or_(
                DimPerson.email.like(like),
                DimPerson.first_name.like(like),
                DimPerson.last_name.like(like),
                DimPerson.display_name.like(like),
                DimRole.role_name.like(like),
            )
        )
    stmt = stmt.order_by(DimPerson.email.asc())

    result = await platform_session.execute(stmt)
    rows = result.all()
    users: list[PlatformUserListItem] = []
    for person, role in rows:
        users.append(
            PlatformUserListItem(
                person_id=person.person_id,
                email=person.email,
                full_name=_format_full_name(person),
                role_id=person.role_id,
                role_code=role.role_code if role else None,
                role_name=role.role_name if role else None,
                status=person.status,
                is_deleted=person.is_deleted,
            )
        )
    return users


@router.get("/roles", response_model=list[PlatformRoleOut])
async def list_roles(
    platform_session: AsyncSession = Depends(get_platform_session),
    user: UserContext = Depends(require_admin()),
):
    result = await platform_session.execute(select(DimRole).order_by(DimRole.role_name.asc()))
    roles = result.scalars().all()
    return [PlatformRoleOut(role_id=role.role_id, role_code=role.role_code, role_name=role.role_name) for role in roles]


@router.patch("/users/{person_id}", response_model=PlatformUserListItem)
async def update_user(
    person_id: str,
    payload: PlatformUserUpdate,
    request: Request,
    platform_session: AsyncSession = Depends(get_platform_session),
    it_session: AsyncSession = Depends(get_session),
    actor: UserContext = Depends(require_admin()),
):
    result = await platform_session.execute(
        select(DimPerson, DimRole).outerjoin(DimRole, DimRole.role_id == DimPerson.role_id).where(DimPerson.person_id == person_id)
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user_not_found")

    person, role = row
    before = {"role_id": person.role_id, "status": person.status}

    try:
        await prevent_last_superadmin_change(
            platform_session,
            person=person,
            new_role_id=payload.role_id,
            new_status=payload.status,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    if payload.role_id is not None:
        person.role_id = payload.role_id
    if payload.status is not None:
        person.status = payload.status

    platform_session.add(person)
    await platform_session.commit()

    updated_role = None
    if person.role_id is not None:
        updated_role = (
            await platform_session.execute(select(DimRole).where(DimRole.role_id == person.role_id))
        ).scalars().one_or_none()

    await write_audit_log(
        it_session,
        actor=actor,
        action="USER_ROLE_CHANGE",
        entity_type="sl_platform.dim_person",
        entity_id=str(person.person_id),
        before=before,
        after={"role_id": person.role_id, "status": person.status},
        context=get_request_context(request),
    )
    await it_session.commit()

    role_to_use = updated_role or role
    return PlatformUserListItem(
        person_id=person.person_id,
        email=person.email,
        full_name=_format_full_name(person),
        role_id=person.role_id,
        role_code=role_to_use.role_code if role_to_use else None,
        role_name=role_to_use.role_name if role_to_use else None,
        status=person.status,
        is_deleted=person.is_deleted,
    )
