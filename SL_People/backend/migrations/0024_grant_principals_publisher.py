"""Grant the 4 org Principals the 'publisher' People access level.

Publisher = edit (move/draft/import) + publish + revert, but NOT group or
access-grant administration. These 4 are specific people, not a platform role,
so we grant them individually via sl_people.people_access_grant (which overrides
the role-derived default in resolve_access_level).

Resolution strategy per principal (from org_principal):
  1. If org_principal.employee_no is set -> dim_person.person_code == employee_no
  2. Else -> match dim_person.full_name / display_name == principal.name (active only)

Idempotent: re-running re-asserts the grant (ON DUPLICATE KEY style upsert).

Usage:
    python -m migrations.0024_grant_principals_publisher
"""

from __future__ import annotations

import asyncio

from sqlalchemy import or_, select

from app.db.platform_session import PlatformSessionLocal, platform_engine
from app.db.session import SessionLocal, engine
from app.models.people import OrgPrincipal, PeopleAccessGrant
from app.models.platform_person import DimPerson

GRANTED_BY = "migration:0024"
GRANT_LEVEL = "publisher"
GRANT_NOTE = "Principal — edit + publish (granted by migration 0024)"


async def _resolve_person_id(platform_session, principal: OrgPrincipal) -> tuple[str | None, str]:
    """Return (person_id, how) for a principal, or (None, reason) if unresolved."""
    if principal.employee_no:
        row = (
            await platform_session.execute(
                select(DimPerson).where(DimPerson.person_code == principal.employee_no)
            )
        ).scalar_one_or_none()
        if row:
            return row.person_id, f"employee_no={principal.employee_no}"

    # Fall back to a name match against active (non-deleted) people.
    rows = (
        await platform_session.execute(
            select(DimPerson).where(
                or_(
                    DimPerson.full_name == principal.name,
                    DimPerson.display_name == principal.name,
                )
            )
        )
    ).scalars().all()
    active = [r for r in rows if not r.is_deleted]
    candidates = active or rows
    if len(candidates) == 1:
        return candidates[0].person_id, f"name match '{principal.name}'"
    if not candidates:
        return None, f"no dim_person matched name '{principal.name}'"
    return None, f"ambiguous: {len(candidates)} dim_person rows match name '{principal.name}'"


async def main() -> None:
    granted = 0
    skipped: list[str] = []

    async with SessionLocal() as session, PlatformSessionLocal() as platform_session:
        principals = (
            await session.execute(select(OrgPrincipal).order_by(OrgPrincipal.sort_order))
        ).scalars().all()
        if not principals:
            print("No principals found in org_principal — run 0023 seed first.")
            return

        for p in principals:
            person_id, how = await _resolve_person_id(platform_session, p)
            if not person_id:
                skipped.append(f"{p.name}: {how}")
                continue

            existing = (
                await session.execute(
                    select(PeopleAccessGrant).where(PeopleAccessGrant.person_id == person_id)
                )
            ).scalar_one_or_none()
            if existing:
                existing.access_level = GRANT_LEVEL
                existing.granted_by = GRANTED_BY
                existing.notes = GRANT_NOTE
            else:
                session.add(
                    PeopleAccessGrant(
                        person_id=person_id,
                        access_level=GRANT_LEVEL,
                        granted_by=GRANTED_BY,
                        notes=GRANT_NOTE,
                    )
                )
            granted += 1
            print(f"OK  {p.name} -> person_id={person_id} ({how}) = {GRANT_LEVEL}")

        await session.commit()

    print(f"\nGranted/updated {granted} principal(s) to '{GRANT_LEVEL}'.")
    if skipped:
        print("Skipped (resolve manually and insert into people_access_grant):")
        for s in skipped:
            print(f"  - {s}")


if __name__ == "__main__":
    async def _run() -> None:
        try:
            await main()
        finally:
            await engine.dispose()
            await platform_engine.dispose()

    asyncio.run(_run())
