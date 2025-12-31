from __future__ import annotations

import argparse
import asyncio

from sqlalchemy import select

from app.core.config import settings
from app.db.platform_session import PlatformSessionLocal
from app.models.platform import DimPerson


def _infer_superadmin_role_id() -> int | None:
    for role_id, roles in settings.role_map.items():
        if any(str(role).lower() == "superadmin" for role in roles):
            return int(role_id)
    return None


async def _run(email: str, role_id: int | None) -> None:
    role_id = role_id or _infer_superadmin_role_id()
    if role_id is None:
        raise SystemExit("No superadmin role_id found. Set SL_ROLE_MAP_JSON or pass --role-id.")

    async with PlatformSessionLocal() as session:
        stmt = select(DimPerson).where(DimPerson.email == email.lower()).limit(1)
        person = (await session.execute(stmt)).scalars().one_or_none()
        if not person:
            raise SystemExit("User not found in sl_platform.dim_person. Create the user first.")

        person.role_id = role_id
        if person.status is None:
            person.status = "working"
        session.add(person)
        await session.commit()
        print(f"Superadmin ensured for {email} (role_id={role_id}).")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--email", required=True)
    parser.add_argument("--role-id", type=int, default=None)
    args = parser.parse_args()
    asyncio.run(_run(args.email.strip().lower(), args.role_id))


if __name__ == "__main__":
    main()
