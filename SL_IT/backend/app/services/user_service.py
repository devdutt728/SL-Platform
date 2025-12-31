from __future__ import annotations

from sqlalchemy import func, select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.platform import DimPerson


def _superadmin_role_ids() -> set[int]:
    role_ids = {
        role_id
        for role_id, roles in settings.role_map.items()
        if any(str(role).lower() == "superadmin" for role in roles)
    }
    return role_ids


def is_active_status(status: str | None) -> bool:
    if status is None:
        return True
    return status.strip().lower() in {"working", "active"}


async def is_last_superadmin(session: AsyncSession, person_id: str) -> bool:
    superadmin_role_ids = _superadmin_role_ids()
    if not superadmin_role_ids:
        return False

    active_status = or_(
        DimPerson.status.is_(None),
        func.lower(DimPerson.status).in_(["working", "active"]),
    )
    count_stmt = select(func.count(DimPerson.person_id)).where(
        DimPerson.role_id.in_(superadmin_role_ids),
        DimPerson.is_deleted.is_(None) | (DimPerson.is_deleted == 0),
        active_status,
    )
    result = await session.execute(count_stmt)
    count = result.scalar() or 0
    if count == 0:
        return True
    if count > 1:
        return False

    current_stmt = select(DimPerson).where(DimPerson.person_id == person_id).limit(1)
    current = (await session.execute(current_stmt)).scalars().one_or_none()
    if not current:
        return False
    if not is_active_status(current.status):
        return False
    return current.role_id in superadmin_role_ids


async def prevent_last_superadmin_change(
    session: AsyncSession,
    *,
    person: DimPerson,
    new_role_id: int | None,
    new_status: str | None,
) -> None:
    superadmin_role_ids = _superadmin_role_ids()
    if not superadmin_role_ids:
        return
    if person.role_id not in superadmin_role_ids:
        return

    if new_role_id in superadmin_role_ids and (new_status is None or is_active_status(new_status)):
        return

    if await is_last_superadmin(session, person.person_id):
        raise ValueError("cannot_modify_last_superadmin")


async def ensure_superadmin_for_email(session: AsyncSession, email: str) -> bool:
    if not settings.superadmin_email:
        return False
    if email.strip().lower() != settings.superadmin_email.strip().lower():
        return False

    superadmin_role_ids = _superadmin_role_ids()
    if not superadmin_role_ids:
        return False

    stmt = select(DimPerson).where(DimPerson.email == email.strip().lower()).limit(1)
    person = (await session.execute(stmt)).scalars().one_or_none()
    if not person:
        return False

    target_role_id = sorted(superadmin_role_ids)[0]
    if person.role_id == target_role_id and is_active_status(person.status):
        return False

    person.role_id = target_role_id
    if person.status is None:
        person.status = "working"
    session.add(person)
    await session.commit()
    return True
