from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.platform_person import DimPerson, DimPersonRole, DimRole

ACTIVE_STATUSES = {"working", "active"}


@dataclass(frozen=True)
class PlatformIdentity:
    person_id: str
    person_code: str | None
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


def is_active_status(status: str | None) -> bool:
    if not status:
        return True
    return status.strip().lower() in ACTIVE_STATUSES


async def _load_roles(session: AsyncSession, person_id: str, fallback_role_id: int | None):
    role_rows = (
        await session.execute(
            select(DimRole.role_id, DimRole.role_code, DimRole.role_name)
            .select_from(DimPersonRole)
            .join(DimRole, DimRole.role_id == DimPersonRole.role_id)
            .where(DimPersonRole.person_id == person_id)
            .order_by(DimRole.role_id.asc())
        )
    ).all()

    role_ids: list[int] = []
    role_codes: list[str] = []
    role_names: list[str] = []
    for r in role_rows:
        if r.role_id is not None:
            role_ids.append(int(r.role_id))
        if r.role_code:
            role_codes.append(str(r.role_code))
        if r.role_name:
            role_names.append(str(r.role_name))

    primary_id = role_ids[0] if role_ids else fallback_role_id
    primary_code = role_codes[0] if role_codes else None
    primary_name = role_names[0] if role_names else None
    return role_ids, role_codes, role_names, primary_id, primary_code, primary_name


async def resolve_identity_by_email(session: AsyncSession, email: str) -> Optional[PlatformIdentity]:
    email_norm = email.strip().lower()
    row = (
        await session.execute(
            select(
                DimPerson.person_id,
                DimPerson.person_code,
                DimPerson.email,
                DimPerson.first_name,
                DimPerson.last_name,
                DimPerson.display_name,
                DimPerson.full_name,
                DimPerson.status,
                DimPerson.is_deleted,
                DimPerson.role_id,
            )
            .where(DimPerson.email == email_norm)
            .limit(1)
        )
    ).first()

    if not row:
        return None

    role_ids, role_codes, role_names, primary_id, primary_code, primary_name = await _load_roles(
        session, row.person_id, row.role_id
    )

    first_name = row.first_name or ""
    last_name = row.last_name or ""
    full_name = (row.display_name or row.full_name or f"{first_name} {last_name}").strip() or email_norm

    return PlatformIdentity(
        person_id=str(row.person_id),
        person_code=row.person_code,
        email=row.email,
        full_name=full_name,
        role_id=primary_id,
        role_code=primary_code,
        role_name=primary_name,
        role_ids=role_ids,
        role_codes=role_codes,
        role_names=role_names,
        status=row.status,
        is_deleted=row.is_deleted,
    )
