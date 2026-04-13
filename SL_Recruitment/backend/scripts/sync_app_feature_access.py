from __future__ import annotations

import argparse
import asyncio
from collections import Counter
from pathlib import Path
import sys

from sqlalchemy import select

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.db.platform_session import PlatformSessionLocal, platform_engine
from app.models.platform_person import DimPerson, DimPersonFeatureAccess, DimPersonRole
from app.models.platform_role import DimRole
from app.services.app_access import is_planner_profile_eligible, is_recruitment_role_eligible
from app.services.platform_feature_access import PLANNER_APP_FEATURE_CODE, RECRUITMENT_APP_FEATURE_CODE


async def main(dry_run: bool) -> None:
    try:
        async with PlatformSessionLocal() as session:
            people = (
                await session.execute(
                    select(DimPerson).where(
                        (DimPerson.is_deleted.is_(None)) | (DimPerson.is_deleted == 0)
                    )
                )
            ).scalars().all()

            role_map: dict[str, dict[str, list[object]]] = {}
            primary_role_rows = (
                await session.execute(
                    select(DimPerson.person_id, DimRole.role_id, DimRole.role_code, DimRole.role_name)
                    .select_from(DimPerson)
                    .join(DimRole, DimRole.role_id == DimPerson.role_id, isouter=True)
                )
            ).all()
            for person_id, role_id, role_code, role_name in primary_role_rows:
                bucket = role_map.setdefault(person_id, {"role_ids": [], "role_values": []})
                if role_id is not None:
                    bucket["role_ids"].append(int(role_id))
                if role_code:
                    bucket["role_values"].append(role_code)
                if role_name:
                    bucket["role_values"].append(role_name)

            secondary_role_rows = (
                await session.execute(
                    select(DimPersonRole.person_id, DimRole.role_id, DimRole.role_code, DimRole.role_name)
                    .select_from(DimPersonRole)
                    .join(DimRole, DimRole.role_id == DimPersonRole.role_id)
                )
            ).all()
            for person_id, role_id, role_code, role_name in secondary_role_rows:
                bucket = role_map.setdefault(person_id, {"role_ids": [], "role_values": []})
                if role_id is not None:
                    numeric_role_id = int(role_id)
                    if numeric_role_id not in bucket["role_ids"]:
                        bucket["role_ids"].append(numeric_role_id)
                if role_code:
                    if role_code not in bucket["role_values"]:
                        bucket["role_values"].append(role_code)
                if role_name:
                    if role_name not in bucket["role_values"]:
                        bucket["role_values"].append(role_name)

            existing = {
                (row.person_id, row.feature_code)
                for row in (await session.execute(select(DimPersonFeatureAccess))).scalars().all()
            }

            counters = Counter()
            for person in people:
                if person.status and str(person.status).strip().lower() not in {"working", "active"}:
                    continue
                role_info = role_map.get(person.person_id, {"role_ids": [], "role_values": []})
                recruitment_eligible = is_recruitment_role_eligible(
                    app_roles=[],
                    role_ids=role_info["role_ids"],
                    role_values=role_info["role_values"],
                )
                planner_eligible = is_planner_profile_eligible(
                    role_ids=role_info["role_ids"],
                    role_values=role_info["role_values"],
                    title_values=[person.job_title, person.secondary_job_title, person.department, person.sub_department],
                )
                if recruitment_eligible:
                    counters["recruitment_eligible"] += 1
                    key = (person.person_id, RECRUITMENT_APP_FEATURE_CODE)
                    if key not in existing:
                        counters["recruitment_inserted"] += 1
                        if not dry_run:
                            session.add(DimPersonFeatureAccess(person_id=person.person_id, feature_code=RECRUITMENT_APP_FEATURE_CODE))
                            existing.add(key)
                if planner_eligible:
                    counters["planner_eligible"] += 1
                    key = (person.person_id, PLANNER_APP_FEATURE_CODE)
                    if key not in existing:
                        counters["planner_inserted"] += 1
                        if not dry_run:
                            session.add(DimPersonFeatureAccess(person_id=person.person_id, feature_code=PLANNER_APP_FEATURE_CODE))
                            existing.add(key)

            if not dry_run:
                await session.commit()

        mode = "dry-run" if dry_run else "apply"
        print(f"App feature sync mode: {mode}")
        print(f"Recruitment eligible: {counters['recruitment_eligible']}")
        print(f"Recruitment inserted: {counters['recruitment_inserted']}")
        print(f"Planner eligible: {counters['planner_eligible']}")
        print(f"Planner inserted: {counters['planner_inserted']}")
    finally:
        await platform_engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill and sync explicit app grants in sl_platform.dim_person_feature_access.")
    parser.add_argument("--dry-run", action="store_true", help="Preview inserts without committing changes.")
    args = parser.parse_args()
    asyncio.run(main(dry_run=args.dry_run))
