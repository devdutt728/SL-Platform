from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_roles
from app.core.roles import Role
from app.db.platform_session import get_platform_session
from app.models.platform_person import DimPerson
from app.models.platform_role import DimRole
from app.schemas.platform import PlatformPersonSuggestion
from app.schemas.user import UserContext

router = APIRouter(prefix="/platform/people", tags=["platform"])


@router.get("", response_model=list[PlatformPersonSuggestion])
async def search_people(
    q: str = Query(default="", max_length=100),
    limit: int = Query(default=10, ge=1, le=25),
    session: AsyncSession = Depends(get_platform_session),
    _user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.HIRING_MANAGER])),
):
    q_norm = q.strip().lower()
    like = f"%{q_norm}%"

    base_filters = [
        (DimPerson.is_deleted == 0) | (DimPerson.is_deleted.is_(None)),
    ]

    # If query is too short, return a small "default" list for dropdown convenience.
    if len(q_norm) < 2:
        rows = (
            await session.execute(
                select(
                    DimPerson.person_id,
                    DimPerson.person_code,
                    DimPerson.email,
                    DimPerson.first_name,
                    DimPerson.last_name,
                    DimPerson.display_name,
                    DimPerson.full_name,
                    DimRole.role_code,
                    DimRole.role_name,
                )
                .select_from(DimPerson)
                .outerjoin(DimRole, DimRole.role_id == DimPerson.role_id)
                .where(*base_filters)
                .order_by(func.coalesce(DimPerson.display_name, DimPerson.full_name, DimPerson.first_name, DimPerson.email).asc())
                .limit(limit)
            )
        ).all()
    else:
        rows = (
            await session.execute(
                select(
                    DimPerson.person_id,
                    DimPerson.person_code,
                    DimPerson.email,
                    DimPerson.first_name,
                    DimPerson.last_name,
                    DimPerson.display_name,
                    DimPerson.full_name,
                    DimRole.role_code,
                    DimRole.role_name,
                )
                .select_from(DimPerson)
                .outerjoin(DimRole, DimRole.role_id == DimPerson.role_id)
                .where(
                    *base_filters,
                    or_(
                        func.lower(DimPerson.email).like(like),
                        func.lower(func.coalesce(DimPerson.display_name, "")).like(like),
                        func.lower(func.coalesce(DimPerson.full_name, "")).like(like),
                        func.lower(func.coalesce(DimPerson.first_name, "")).like(like),
                        func.lower(func.coalesce(DimPerson.last_name, "")).like(like),
                        func.lower(
                            func.concat(
                                func.coalesce(DimPerson.first_name, ""),
                                " ",
                                func.coalesce(DimPerson.last_name, ""),
                            )
                        ).like(like),
                    ),
                )
                .limit(limit)
            )
        ).all()

    out: list[PlatformPersonSuggestion] = []
    for row in rows:
        first = (row.first_name or "").strip()
        last = (row.last_name or "").strip()
        full_name = (row.display_name or row.full_name or f"{first} {last}").strip() or row.email
        out.append(
            PlatformPersonSuggestion(
                person_id=row.person_id,
                person_code=row.person_code,
                full_name=full_name,
                email=row.email,
                role_code=row.role_code,
                role_name=row.role_name,
            )
        )
    return out
