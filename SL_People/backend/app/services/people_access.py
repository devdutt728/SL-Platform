from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.user import AccessLevel
from app.services.platform_identity import PlatformIdentity

# Platform role codes that map to People ADMIN by default (plan §10).
ADMIN_ROLE_CODES = {"superadmin", "super_admin", "s_admin", "hr_admin", "it_lead"}
# Platform role codes that map to People EDIT by default.
EDIT_ROLE_CODES = {"hr_exec", "it_agent", "hiring_manager"}


def _normalise(value: str | None) -> str:
    return str(value or "").strip().lower().replace(" ", "_").replace("-", "_")


def default_access_for_identity(identity: PlatformIdentity) -> AccessLevel:
    """Default People access level derived from platform roles (before grant overrides)."""
    tokens = {
        _normalise(v)
        for v in [
            *(identity.role_codes or []),
            *(identity.role_names or []),
            identity.role_code,
            identity.role_name,
        ]
        if str(v or "").strip()
    }
    # role_id 2 is the platform superadmin in this deployment.
    if 2 in (identity.role_ids or []) or (tokens & ADMIN_ROLE_CODES):
        return AccessLevel.ADMIN
    if tokens & EDIT_ROLE_CODES:
        return AccessLevel.EDIT
    return AccessLevel.VIEW


async def get_access_grant(session: AsyncSession, person_id: str) -> AccessLevel | None:
    """Explicit per-person override from sl_people.people_access_grant, if any."""
    from app.models.people import PeopleAccessGrant  # local import to avoid cycle at startup

    row = (
        await session.execute(
            select(PeopleAccessGrant.access_level).where(PeopleAccessGrant.person_id == person_id)
        )
    ).first()
    if not row or not row[0]:
        return None
    try:
        return AccessLevel(str(row[0]).strip().lower())
    except ValueError:
        return None


async def resolve_access_level(
    people_session: AsyncSession,
    identity: PlatformIdentity,
) -> AccessLevel:
    """Grant override wins; otherwise fall back to the role-derived default."""
    override = await get_access_grant(people_session, identity.person_id)
    if override is not None:
        return override
    return default_access_for_identity(identity)
