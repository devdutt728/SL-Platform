from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.platform import DimPerson, DimPersonRole, DimRole


@dataclass(frozen=True)
class PlatformIdentity:
    person_id: str
    email: str
    full_name: str
    role_id: int | None
    role_code: str | None
    role_name: str | None
    role_ids: list[int]
    role_codes: list[str]
    role_names: list[str]
    status: str | None
    is_deleted: int | None


def _pick_primary_role(role_ids: list[int]) -> int | None:
    if not role_ids:
        return None
    if 2 in role_ids:
        return 2
    return sorted(role_ids)[0]


def _role_row_value(row, key: str, index: int):
    if hasattr(row, key):
        return getattr(row, key)
    if isinstance(row, (tuple, list)) and len(row) > index:
        return row[index]
    return None


async def resolve_identity_by_email(session: AsyncSession, email: str) -> Optional[PlatformIdentity]:
    email_norm = email.strip().lower()
    row = (
        await session.execute(
            select(
                DimPerson.person_id,
                DimPerson.email,
                DimPerson.first_name,
                DimPerson.last_name,
                DimPerson.display_name,
                DimPerson.full_name,
                DimPerson.status,
                DimPerson.is_deleted,
                DimPerson.role_id,
                DimRole.role_code,
                DimRole.role_name,
            )
            .select_from(DimPerson)
            .outerjoin(DimRole, DimRole.role_id == DimPerson.role_id)
            .where(DimPerson.email == email_norm)
            .limit(1)
        )
    ).first()

    if not row:
        return None

    role_rows = (
        await session.execute(
            select(DimRole.role_id, DimRole.role_code, DimRole.role_name)
            .select_from(DimPersonRole)
            .join(DimRole, DimRole.role_id == DimPersonRole.role_id)
            .where(DimPersonRole.person_id == row.person_id)
            .order_by(DimRole.role_id.asc())
        )
    ).all()
    if not role_rows and row.role_id is not None:
        role_rows = [(row.role_id, row.role_code, row.role_name)]

    role_ids = []
    role_codes = []
    role_names = []
    for r in role_rows:
        role_id = _role_row_value(r, "role_id", 0)
        role_code = _role_row_value(r, "role_code", 1)
        role_name = _role_row_value(r, "role_name", 2)
        if role_id is not None:
            role_ids.append(int(role_id))
        if role_code:
            role_codes.append(str(role_code))
        if role_name:
            role_names.append(str(role_name))
    primary_role_id = _pick_primary_role(role_ids) or row.role_id
    primary_role_code = None
    primary_role_name = None
    if primary_role_id is not None:
        for r in role_rows:
            if _role_row_value(r, "role_id", 0) == primary_role_id:
                primary_role_code = _role_row_value(r, "role_code", 1)
                primary_role_name = _role_row_value(r, "role_name", 2)
                break

    first_name = row.first_name or ""
    last_name = row.last_name or ""
    full_name = (row.display_name or row.full_name or f"{first_name} {last_name}").strip() or email_norm

    return PlatformIdentity(
        person_id=row.person_id,
        email=row.email,
        full_name=full_name,
        role_id=primary_role_id,
        role_code=primary_role_code,
        role_name=primary_role_name,
        role_ids=role_ids,
        role_codes=role_codes,
        role_names=role_names,
        status=row.status,
        is_deleted=row.is_deleted,
    )


async def resolve_identity_by_person_id(session: AsyncSession, person_id: str) -> Optional[PlatformIdentity]:
    row = (
        await session.execute(
            select(
                DimPerson.person_id,
                DimPerson.email,
                DimPerson.first_name,
                DimPerson.last_name,
                DimPerson.display_name,
                DimPerson.full_name,
                DimPerson.status,
                DimPerson.is_deleted,
                DimPerson.role_id,
                DimRole.role_code,
                DimRole.role_name,
            )
            .select_from(DimPerson)
            .outerjoin(DimRole, DimRole.role_id == DimPerson.role_id)
            .where(DimPerson.person_id == person_id)
            .limit(1)
        )
    ).first()

    if not row:
        return None

    role_rows = (
        await session.execute(
            select(DimRole.role_id, DimRole.role_code, DimRole.role_name)
            .select_from(DimPersonRole)
            .join(DimRole, DimRole.role_id == DimPersonRole.role_id)
            .where(DimPersonRole.person_id == row.person_id)
            .order_by(DimRole.role_id.asc())
        )
    ).all()
    if not role_rows and row.role_id is not None:
        role_rows = [(row.role_id, row.role_code, row.role_name)]

    role_ids = []
    role_codes = []
    role_names = []
    for r in role_rows:
        role_id = _role_row_value(r, "role_id", 0)
        role_code = _role_row_value(r, "role_code", 1)
        role_name = _role_row_value(r, "role_name", 2)
        if role_id is not None:
            role_ids.append(int(role_id))
        if role_code:
            role_codes.append(str(role_code))
        if role_name:
            role_names.append(str(role_name))
    primary_role_id = _pick_primary_role(role_ids) or row.role_id
    primary_role_code = None
    primary_role_name = None
    if primary_role_id is not None:
        for r in role_rows:
            if _role_row_value(r, "role_id", 0) == primary_role_id:
                primary_role_code = _role_row_value(r, "role_code", 1)
                primary_role_name = _role_row_value(r, "role_name", 2)
                break

    first_name = row.first_name or ""
    last_name = row.last_name or ""
    full_name = (row.display_name or row.full_name or f"{first_name} {last_name}").strip() or person_id

    return PlatformIdentity(
        person_id=row.person_id,
        email=row.email or "",
        full_name=full_name,
        role_id=primary_role_id,
        role_code=primary_role_code,
        role_name=primary_role_name,
        role_ids=role_ids,
        role_codes=role_codes,
        role_names=role_names,
        status=row.status,
        is_deleted=row.is_deleted,
    )
