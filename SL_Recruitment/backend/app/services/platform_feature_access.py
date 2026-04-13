from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.exc import OperationalError, ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.platform_person import DimPersonFeatureAccess

REPORTS_FEATURE_CODE = "reports"
RECRUITMENT_APP_FEATURE_CODE = "recruitment_app"
PLANNER_APP_FEATURE_CODE = "planner_app"
FEATURE_LABELS = {
    RECRUITMENT_APP_FEATURE_CODE: "Recruitment",
    PLANNER_APP_FEATURE_CODE: "Project Planner",
    REPORTS_FEATURE_CODE: "Reports",
}


def normalize_feature_code(value: object) -> str:
    return str(value or "").strip().lower().replace(" ", "_").replace("-", "_")


def feature_label(feature_code: str) -> str:
    return FEATURE_LABELS.get(normalize_feature_code(feature_code), str(feature_code or "").strip() or "Feature")


def supported_feature_codes() -> list[str]:
    return list(FEATURE_LABELS.keys())


def is_supported_feature_code(feature_code: object) -> bool:
    return normalize_feature_code(feature_code) in FEATURE_LABELS


async def person_has_feature_access(
    session: AsyncSession,
    *,
    person_id: str | None,
    feature_code: str,
) -> bool:
    normalized_person_id = str(person_id or "").strip()
    normalized_feature_code = normalize_feature_code(feature_code)
    if not normalized_person_id or not normalized_feature_code:
        return False

    try:
        row = (
            await session.execute(
                select(DimPersonFeatureAccess.person_id).where(
                    DimPersonFeatureAccess.person_id == normalized_person_id,
                    DimPersonFeatureAccess.feature_code == normalized_feature_code,
                )
            )
        ).first()
    except (ProgrammingError, OperationalError):
        return False
    return row is not None
