from __future__ import annotations

import csv
import io

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.platform_session import get_platform_session
from app.db.session import get_session
from app.models.platform import DimPerson, DimRole
from app.request_context import get_request_context
from app.rbac import require_superadmin
from app.schemas.user import PlatformRoleOut, PlatformUserCreate, PlatformUserListItem, PlatformUserUpdate, UserContext
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
    user: UserContext = Depends(require_superadmin()),
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
    user: UserContext = Depends(require_superadmin()),
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
    actor: UserContext = Depends(require_superadmin()),
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


@router.post("/users", response_model=PlatformUserListItem, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: PlatformUserCreate,
    request: Request,
    platform_session: AsyncSession = Depends(get_platform_session),
    it_session: AsyncSession = Depends(get_session),
    actor: UserContext = Depends(require_superadmin()),
):
    person_id = payload.person_id.strip()
    person_code = payload.person_code.strip()
    first_name = payload.first_name.strip()
    last_name = (payload.last_name or "").strip() or None
    email = (payload.email or "").strip().lower() or None
    status_value = (payload.status or "").strip() or None
    if not person_id or not person_code or not first_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="missing_required_fields")

    existing_stmt = select(DimPerson).where(DimPerson.person_id == person_id)
    if email:
        existing_stmt = existing_stmt.where(
            or_(DimPerson.person_id == person_id, func.lower(DimPerson.email) == email)
        )
    existing = (await platform_session.execute(existing_stmt)).scalars().first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="user_already_exists")

    full_name = " ".join(part for part in [first_name, last_name] if part).strip()
    person = DimPerson(
        person_id=person_id,
        person_code=person_code,
        email=email,
        first_name=first_name,
        last_name=last_name,
        role_id=payload.role_id,
        status=status_value or "working",
        is_deleted=0,
        full_name=full_name or None,
        display_name=full_name or None,
    )
    platform_session.add(person)
    await platform_session.commit()

    role = None
    if person.role_id is not None:
        role = (
            await platform_session.execute(select(DimRole).where(DimRole.role_id == person.role_id))
        ).scalars().one_or_none()

    await write_audit_log(
        it_session,
        actor=actor,
        action="USER_CREATE",
        entity_type="sl_platform.dim_person",
        entity_id=str(person.person_id),
        before=None,
        after={"role_id": person.role_id, "status": person.status, "email": person.email},
        context=get_request_context(request),
    )
    await it_session.commit()

    return PlatformUserListItem(
        person_id=person.person_id,
        email=person.email,
        full_name=_format_full_name(person),
        role_id=person.role_id,
        role_code=role.role_code if role else None,
        role_name=role.role_name if role else None,
        status=person.status,
        is_deleted=person.is_deleted,
    )


@router.post("/users/import", response_model=dict)
async def import_users_csv(
    request: Request,
    upload: UploadFile = File(...),
    platform_session: AsyncSession = Depends(get_platform_session),
    it_session: AsyncSession = Depends(get_session),
    actor: UserContext = Depends(require_superadmin()),
):
    if upload.content_type and "csv" not in upload.content_type.lower():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_file_type")
    raw = await upload.read()
    if len(raw) > 5 * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="file_too_large")

    text = raw.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    created = 0
    skipped = 0
    row_limit = 5000

    for row in reader:
        if created + skipped >= row_limit:
            break
        person_id = (row.get("person_id") or "").strip()
        person_code = (row.get("person_code") or "").strip()
        first_name = (row.get("first_name") or "").strip()
        if not person_id or not person_code or not first_name:
            skipped += 1
            continue

        last_name = (row.get("last_name") or "").strip() or None
        email = (row.get("email") or "").strip().lower() or None
        status_value = (row.get("status") or "").strip() or None
        role_raw = (row.get("role_id") or "").strip()
        role_id = int(role_raw) if role_raw.isdigit() else None

        existing_stmt = select(DimPerson).where(DimPerson.person_id == person_id)
        if email:
            existing_stmt = existing_stmt.where(
                or_(DimPerson.person_id == person_id, func.lower(DimPerson.email) == email)
            )
        exists = (await platform_session.execute(existing_stmt)).scalars().first()
        if exists:
            skipped += 1
            continue

        full_name = " ".join(part for part in [first_name, last_name] if part).strip()
        person = DimPerson(
            person_id=person_id,
            person_code=person_code,
            email=email,
            first_name=first_name,
            last_name=last_name,
            role_id=role_id,
            status=status_value or "working",
            is_deleted=0,
            full_name=full_name or None,
            display_name=full_name or None,
        )
        platform_session.add(person)
        created += 1

    await platform_session.commit()

    await write_audit_log(
        it_session,
        actor=actor,
        action="USER_IMPORT",
        entity_type="sl_platform.dim_person",
        entity_id="bulk",
        before=None,
        after={"created": created, "skipped": skipped, "filename": upload.filename},
        context=get_request_context(request),
    )
    await it_session.commit()

    return {"created": created, "skipped": skipped}
