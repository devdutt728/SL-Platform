from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.platform_person import DimPerson
from app.models.platform_role import DimRole


@dataclass(frozen=True)
class PlatformIdentity:
    person_id: str
    email: str
    full_name: str
    role_id: int | None
    role_code: str | None
    role_name: str | None
    status: str | None
    is_deleted: int | None


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

    first_name = row.first_name or ""
    last_name = row.last_name or ""
    full_name = (row.display_name or row.full_name or f"{first_name} {last_name}").strip() or email_norm

    return PlatformIdentity(
        person_id=row.person_id,
        email=row.email,
        full_name=full_name,
        role_id=row.role_id,
        role_code=row.role_code,
        role_name=row.role_name,
        status=row.status,
        is_deleted=row.is_deleted,
    )
