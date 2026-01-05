from __future__ import annotations

import csv
import io
from datetime import date

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.platform_session import get_platform_session
from app.db.session import get_session
from app.models.platform import DimPerson, DimRole
from app.request_context import get_request_context
from app.rbac import require_admin
from app.schemas.user import (
    PlatformRoleOut,
    PlatformUserCreate,
    PlatformUserListItem,
    PlatformUserUpdate,
    UserContext,
)
from app.services.audit_service import write_audit_log
from app.services.user_service import prevent_last_superadmin_change

router = APIRouter(prefix="/admin", tags=["admin"])


def _format_full_name(person: DimPerson) -> str:
    first_name = person.first_name or ""
    last_name = person.last_name or ""
    return (person.display_name or person.full_name or f"{first_name} {last_name}").strip() or (person.email or "")


def _derive_names(first_name: str | None, last_name: str | None, full_name: str | None, display_name: str | None, email: str | None) -> tuple[str | None, str | None]:
    if first_name:
        return first_name, last_name
    source = full_name or display_name
    if source:
        parts = source.split()
        if len(parts) == 1:
            return parts[0], last_name
        return parts[0], " ".join(parts[1:])
    if email:
        handle = email.split("@")[0]
        return handle, last_name
    return None, last_name


@router.get("/users", response_model=list[PlatformUserListItem])
async def list_users(
    q: str | None = None,
    status: str | None = None,
    status_group: str | None = None,
    role_id: int | None = None,
    include_relived: bool = False,
    include_deleted: bool = False,
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
    if status:
        stmt = stmt.where(DimPerson.status == status)
    elif status_group == "active":
        stmt = stmt.where(DimPerson.status.in_(["Working", "Active"]))
    if role_id is not None:
        stmt = stmt.where(DimPerson.role_id == role_id)
    if not include_relived:
        stmt = stmt.where(or_(DimPerson.status.is_(None), DimPerson.status.notin_(["Relieved", "relieved"])))
    if not include_deleted:
        stmt = stmt.where(or_(DimPerson.is_deleted.is_(None), DimPerson.is_deleted != 1))
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


@router.get("/users/export")
async def export_users(
    platform_session: AsyncSession = Depends(get_platform_session),
    user: UserContext = Depends(require_admin()),
):
    result = await platform_session.execute(
        select(DimPerson, DimRole)
        .outerjoin(DimRole, DimRole.role_id == DimPerson.role_id)
        .order_by(DimPerson.email.asc())
    )
    rows = result.all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "person_id",
            "person_code",
            "personal_id",
            "email",
            "first_name",
            "last_name",
            "role_id",
            "role_code",
            "role_name",
            "grade_id",
            "department_id",
            "manager_id",
            "employment_type",
            "join_date",
            "exit_date",
            "mobile_number",
            "status",
            "is_deleted",
            "source_system",
            "created_at",
            "updated_at",
            "full_name",
            "display_name",
        ]
    )
    for person, role in rows:
        writer.writerow(
            [
                person.person_id,
                person.person_code,
                person.personal_id,
                person.email,
                person.first_name,
                person.last_name,
                person.role_id,
                role.role_code if role else None,
                role.role_name if role else None,
                person.grade_id,
                person.department_id,
                person.manager_id,
                person.employment_type,
                person.join_date.isoformat() if person.join_date else None,
                person.exit_date.isoformat() if person.exit_date else None,
                person.mobile_number,
                person.status,
                person.is_deleted,
                person.source_system,
                person.created_at.isoformat() if person.created_at else None,
                person.updated_at.isoformat() if person.updated_at else None,
                person.full_name,
                person.display_name,
            ]
        )

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=users_export.csv"},
    )


@router.post("/users/import", response_model=dict)
async def import_users(
    request: Request,
    file: UploadFile = File(...),
    platform_session: AsyncSession = Depends(get_platform_session),
    it_session: AsyncSession = Depends(get_session),
    actor: UserContext = Depends(require_admin()),
):
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="csv_required")

    content = (await file.read()).decode("utf-8").splitlines()
    reader = csv.DictReader(content)
    inserted = 0
    updated = 0
    skipped = 0
    errors: list[dict] = []

    def _non_empty(value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value if value else None

    def _to_int(value: str | None) -> int | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            return None
        return int(value)

    def _to_date(value: str | None) -> date | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            return None
        return date.fromisoformat(value)

    for index, row in enumerate(reader, start=2):
        person_id = _non_empty(row.get("person_id"))
        person_code = _non_empty(row.get("person_code"))
        email = _non_empty(row.get("email"))
        if not person_id:
            person_id = person_code or email
        email = _non_empty(row.get("email"))
        if not person_id:
            errors.append({"row": index, "error": "missing_person_id"})
            continue

        person = (
            await platform_session.execute(select(DimPerson).where(DimPerson.person_id == person_id))
        ).scalars().one_or_none()

        if not person:
            first_name = _non_empty(row.get("first_name"))
            last_name = _non_empty(row.get("last_name"))
            full_name = _non_empty(row.get("full_name"))
            display_name = _non_empty(row.get("display_name"))
            derived_first, derived_last = _derive_names(first_name, last_name, full_name, display_name, email)
            if not person_code:
                person_code = person_id
            if not person_code or not derived_first:
                errors.append({"row": index, "error": "missing_required_fields"})
                continue

            person = DimPerson(
                person_id=person_id,
                person_code=person_code,
                personal_id=_non_empty(row.get("personal_id")),
                email=email,
                first_name=derived_first,
                last_name=derived_last,
                role_id=_to_int(row.get("role_id")),
                grade_id=_to_int(row.get("grade_id")),
                department_id=_to_int(row.get("department_id")),
                manager_id=_non_empty(row.get("manager_id")),
                employment_type=_non_empty(row.get("employment_type")),
                join_date=_to_date(row.get("join_date")),
                exit_date=_to_date(row.get("exit_date")),
                mobile_number=_non_empty(row.get("mobile_number")),
                status=_non_empty(row.get("status")),
                is_deleted=_to_int(row.get("is_deleted")),
                full_name=full_name,
                display_name=display_name,
                source_system=_non_empty(row.get("source_system")),
            )
            platform_session.add(person)
            inserted += 1
            continue

        updates: dict[str, object] = {}
        for field, parser in [
            ("person_code", _non_empty),
            ("personal_id", _non_empty),
            ("email", _non_empty),
            ("first_name", _non_empty),
            ("last_name", _non_empty),
            ("role_id", _to_int),
            ("grade_id", _to_int),
            ("department_id", _to_int),
            ("manager_id", _non_empty),
            ("employment_type", _non_empty),
            ("join_date", _to_date),
            ("exit_date", _to_date),
            ("mobile_number", _non_empty),
            ("status", _non_empty),
            ("is_deleted", _to_int),
            ("full_name", _non_empty),
            ("display_name", _non_empty),
            ("source_system", _non_empty),
        ]:
            try:
                value = parser(row.get(field))
            except ValueError:
                errors.append({"row": index, "error": f"invalid_{field}"})
                value = None
            if value is not None and getattr(person, field) != value:
                setattr(person, field, value)
                updates[field] = value

        if updates:
            try:
                await prevent_last_superadmin_change(
                    platform_session,
                    person=person,
                    new_role_id=updates.get("role_id", person.role_id),
                    new_status=updates.get("status", person.status),
                )
            except ValueError as exc:
                errors.append({"row": index, "error": str(exc)})
                continue
            updated += 1
        else:
            skipped += 1

    await platform_session.commit()

    await write_audit_log(
        it_session,
        actor=actor,
        action="USER_BULK_IMPORT",
        entity_type="sl_platform.dim_person",
        entity_id="bulk",
        before=None,
        after={"inserted": inserted, "updated": updated, "skipped": skipped, "errors": len(errors)},
        context=get_request_context(request),
    )
    await it_session.commit()

    return {"inserted": inserted, "updated": updated, "skipped": skipped, "errors": errors}


@router.post("/users", response_model=PlatformUserListItem, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: PlatformUserCreate,
    request: Request,
    platform_session: AsyncSession = Depends(get_platform_session),
    it_session: AsyncSession = Depends(get_session),
    actor: UserContext = Depends(require_admin()),
):
    person_id = payload.person_id or payload.person_code or payload.email
    if not person_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="person_id_required")

    existing = (
        await platform_session.execute(select(DimPerson).where(DimPerson.person_id == person_id))
    ).scalars().one_or_none()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="person_id_exists")

    first_name, last_name = _derive_names(
        payload.first_name,
        payload.last_name,
        payload.full_name,
        payload.display_name,
        payload.email,
    )
    if not first_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="first_name_required")

    person = DimPerson(
        person_id=person_id,
        person_code=payload.person_code or person_id,
        personal_id=payload.personal_id,
        email=str(payload.email) if payload.email else None,
        first_name=first_name,
        last_name=last_name,
        role_id=payload.role_id,
        grade_id=payload.grade_id,
        department_id=payload.department_id,
        manager_id=payload.manager_id,
        employment_type=payload.employment_type,
        join_date=payload.join_date,
        exit_date=payload.exit_date,
        mobile_number=payload.mobile_number,
        status=payload.status,
        is_deleted=payload.is_deleted,
        full_name=payload.full_name or f"{first_name} {last_name}".strip(),
        display_name=payload.display_name or f"{first_name} {last_name}".strip(),
        source_system=payload.source_system,
    )

    platform_session.add(person)
    await platform_session.commit()

    await write_audit_log(
        it_session,
        actor=actor,
        action="USER_CREATE",
        entity_type="sl_platform.dim_person",
        entity_id=str(person.person_id),
        before=None,
        after={"person_id": person.person_id, "email": person.email},
        context=get_request_context(request),
    )
    await it_session.commit()

    role = None
    if person.role_id is not None:
        role = (
            await platform_session.execute(select(DimRole).where(DimRole.role_id == person.role_id))
        ).scalars().one_or_none()

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
