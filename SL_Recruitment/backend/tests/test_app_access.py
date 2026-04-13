from __future__ import annotations

import unittest

from app.core.app_access import has_planner_app_access, has_recruitment_app_access
from app.core.roles import Role
from app.schemas.user import UserContext
from app.services.app_access import is_planner_profile_eligible, is_recruitment_role_eligible


def _user(
    *,
    roles: list[Role] | None = None,
    platform_role_id: int | None = None,
    platform_role_ids: list[int] | None = None,
    platform_role_code: str | None = None,
    platform_role_codes: list[str] | None = None,
    platform_role_name: str | None = None,
    platform_role_names: list[str] | None = None,
    can_access_recruitment: bool = False,
    can_access_planner: bool = False,
) -> UserContext:
    return UserContext(
        user_id="user@example.com",
        email="user@example.com",
        roles=roles or [Role.VIEWER],
        person_id_platform="123",
        full_name="Test User",
        platform_role_id=platform_role_id,
        platform_role_ids=platform_role_ids,
        platform_role_code=platform_role_code,
        platform_role_codes=platform_role_codes,
        platform_role_name=platform_role_name,
        platform_role_names=platform_role_names,
        can_access_recruitment=can_access_recruitment,
        can_access_planner=can_access_planner,
        reports_access=False,
    )


class AppAccessTests(unittest.TestCase):
    def test_recruitment_role_eligibility_allows_hr_roles(self) -> None:
        self.assertTrue(
            is_recruitment_role_eligible(
                app_roles=[Role.HR_EXEC],
                role_ids=[3],
                role_values=["hr_exec"],
            )
        )

    def test_planner_profile_eligibility_allows_project_anchor_title(self) -> None:
        self.assertTrue(
            is_planner_profile_eligible(
                role_ids=[9],
                role_values=["viewer"],
                title_values=["Project Anchor", None, None, None],
            )
        )

    def test_recruitment_access_requires_explicit_flag_for_non_superadmin(self) -> None:
        user = _user(roles=[Role.HR_EXEC], can_access_recruitment=True)
        self.assertTrue(has_recruitment_app_access(user))

    def test_planner_access_requires_explicit_flag_for_non_superadmin(self) -> None:
        user = _user(roles=[Role.VIEWER], can_access_planner=True)
        self.assertTrue(has_planner_app_access(user))

    def test_superadmin_keeps_global_app_access(self) -> None:
        user = _user(
            roles=[Role.HR_ADMIN],
            platform_role_ids=[2],
            platform_role_codes=["s_admin"],
            can_access_recruitment=False,
            can_access_planner=False,
        )
        self.assertTrue(has_recruitment_app_access(user))
        self.assertTrue(has_planner_app_access(user))


if __name__ == "__main__":
    unittest.main()
