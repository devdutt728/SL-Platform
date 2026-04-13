from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.exc import OperationalError, ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_superadmin
from app.db.platform_session import get_platform_session
from app.models.platform_person import DimPerson, DimPersonFeatureAccess
from app.schemas.platform_feature_access import (
    FeatureAccessAssignmentOut,
    FeatureAccessFeatureOut,
    FeatureAccessToggleIn,
    ReportsAccessAssignmentOut,
    ReportsAccessToggleIn,
)
from app.schemas.user import UserContext
from app.services.platform_feature_access import feature_label, is_supported_feature_code, normalize_feature_code, supported_feature_codes

router = APIRouter(prefix="/platform/feature-access", tags=["platform"])


def _person_full_name(row) -> str:
    first_name = str(row.first_name or "").strip()
    last_name = str(row.last_name or "").strip()
    fallback = " ".join(part for part in [first_name, last_name] if part).strip()
    return str(row.display_name or row.full_name or fallback or row.email or row.person_id).strip()


def _feature_access_schema_unavailable() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=(
            "Feature access schema is unavailable. Apply migration "
            "`backend/migrations/0061_dim_person_feature_access.sql`."
        ),
    )


@router.get("/reports", response_model=list[ReportsAccessAssignmentOut])
async def list_reports_access(
    session: AsyncSession = Depends(get_platform_session),
    _user: UserContext = Depends(require_superadmin()),
):
    return await list_feature_access("reports", session=session, _user=_user)


@router.patch("/reports/{person_id}", response_model=ReportsAccessAssignmentOut)
async def set_reports_access(
    person_id: str,
    payload: ReportsAccessToggleIn,
    session: AsyncSession = Depends(get_platform_session),
    user: UserContext = Depends(require_superadmin()),
):
    return await set_feature_access("reports", person_id=person_id, payload=payload, session=session, user=user)


def _normalized_feature_code_or_404(feature_code: str) -> str:
    normalized = normalize_feature_code(feature_code)
    if not is_supported_feature_code(normalized):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feature code not supported")
    return normalized


@router.get("", response_model=list[FeatureAccessFeatureOut])
async def list_feature_catalog(_user: UserContext = Depends(require_superadmin())):
    return [FeatureAccessFeatureOut(feature_code=code, feature_label=feature_label(code)) for code in supported_feature_codes()]


@router.get("/{feature_code}", response_model=list[FeatureAccessAssignmentOut])
async def list_feature_access(
    feature_code: str,
    session: AsyncSession = Depends(get_platform_session),
    _user: UserContext = Depends(require_superadmin()),
):
    normalized_feature_code = _normalized_feature_code_or_404(feature_code)
    try:
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
                    DimPerson.status,
                    DimPerson.is_deleted,
                    DimPersonFeatureAccess.granted_at,
                    DimPersonFeatureAccess.granted_by_person_id,
                )
                .select_from(DimPersonFeatureAccess)
                .join(DimPerson, DimPerson.person_id == DimPersonFeatureAccess.person_id)
                .where(DimPersonFeatureAccess.feature_code == normalized_feature_code)
                .order_by(
                    func.coalesce(DimPerson.is_deleted, 0).asc(),
                    func.coalesce(DimPerson.display_name, DimPerson.full_name, DimPerson.first_name, DimPerson.email).asc(),
                )
            )
        ).all()
    except (ProgrammingError, OperationalError):
        raise _feature_access_schema_unavailable()

    return [
        FeatureAccessAssignmentOut(
            feature_code=normalized_feature_code,
            feature_label=feature_label(normalized_feature_code),
            person_id=row.person_id,
            person_code=row.person_code,
            full_name=_person_full_name(row),
            email=row.email,
            status=row.status,
            is_deleted=row.is_deleted,
            granted_at=row.granted_at,
            granted_by_person_id=row.granted_by_person_id,
            enabled=True,
        )
        for row in rows
    ]


@router.patch("/{feature_code}/{person_id}", response_model=FeatureAccessAssignmentOut)
async def set_feature_access(
    feature_code: str,
    person_id: str,
    payload: FeatureAccessToggleIn,
    session: AsyncSession = Depends(get_platform_session),
    user: UserContext = Depends(require_superadmin()),
):
    normalized_feature_code = _normalized_feature_code_or_404(feature_code)
    person = await session.get(DimPerson, person_id)
    if not person:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Person not found")

    try:
        await session.execute(
            delete(DimPersonFeatureAccess).where(
                DimPersonFeatureAccess.person_id == person_id,
                DimPersonFeatureAccess.feature_code == normalized_feature_code,
            )
        )
    except (ProgrammingError, OperationalError):
        raise _feature_access_schema_unavailable()

    granted_at = None
    granted_by_person_id = None
    if payload.enabled:
        try:
            assignment = DimPersonFeatureAccess(
                person_id=person_id,
                feature_code=normalized_feature_code,
                granted_by_person_id=user.person_id_platform,
            )
            session.add(assignment)
            await session.flush()
            granted_at = assignment.granted_at
            granted_by_person_id = assignment.granted_by_person_id
        except (ProgrammingError, OperationalError):
            raise _feature_access_schema_unavailable()

    await session.commit()

    full_name = (
        str(
            person.display_name
            or person.full_name
            or " ".join(part for part in [str(person.first_name or "").strip(), str(person.last_name or "").strip()] if part)
            or person.email
        ).strip()
        or person.email
    )

    return FeatureAccessAssignmentOut(
        feature_code=normalized_feature_code,
        feature_label=feature_label(normalized_feature_code),
        person_id=person.person_id,
        person_code=person.person_code,
        full_name=full_name,
        email=person.email,
        status=person.status,
        is_deleted=person.is_deleted,
        granted_at=granted_at,
        granted_by_person_id=granted_by_person_id,
        enabled=payload.enabled,
    )
