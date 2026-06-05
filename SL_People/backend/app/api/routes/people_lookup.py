from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_platform_db_session, require_view
from app.models.platform_person import DimPerson
from app.schemas.user import UserContext

router = APIRouter(prefix="/ppl/people", tags=["people-lookup"])


class PersonLookupItem(BaseModel):
    email: str
    name: str
    employee_no: Optional[str] = None
    team: Optional[str] = None
    title: Optional[str] = None


class PersonLookupResponse(BaseModel):
    items: list[PersonLookupItem]


def _name(row: DimPerson) -> str:
    return (
        row.full_name
        or row.display_name
        or " ".join(filter(None, [row.first_name, row.last_name]))
        or row.email
    )


@router.get("/lookup", response_model=PersonLookupResponse)
async def lookup_people(
    q: str = Query("", description="Search by name or email"),
    limit: int = Query(8, ge=1, le=25),
    user: UserContext = Depends(require_view),
    platform_db: AsyncSession = Depends(get_platform_db_session),
) -> PersonLookupResponse:
    """Lightweight type-ahead over the shared identity table.

    Powers the assignee/holder comboboxes on Systems and Licenses so users pick a
    real person instead of free-typing. Read-only; never mutates dim_person.
    """
    term = q.strip().lower()
    stmt = select(DimPerson).where(
        func.coalesce(DimPerson.is_deleted, 0) == 0
    )
    if term:
        like = f"%{term}%"
        stmt = stmt.where(
            or_(
                func.lower(DimPerson.email).like(like),
                func.lower(func.coalesce(DimPerson.full_name, "")).like(like),
                func.lower(func.coalesce(DimPerson.display_name, "")).like(like),
                func.lower(func.coalesce(DimPerson.first_name, "")).like(like),
                func.lower(func.coalesce(DimPerson.last_name, "")).like(like),
            )
        )
    stmt = stmt.order_by(DimPerson.full_name).limit(limit)

    rows = (await platform_db.execute(stmt)).scalars().all()
    items = [
        PersonLookupItem(
            email=row.email,
            name=_name(row),
            employee_no=row.person_code,
            team=row.department,
            title=row.job_title,
        )
        for row in rows
        if row.email
    ]
    return PersonLookupResponse(items=items)
