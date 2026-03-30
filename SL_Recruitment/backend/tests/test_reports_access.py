from __future__ import annotations

import unittest

from app.core.feature_access import has_reports_access
from app.core.roles import Role
from app.schemas.user import UserContext


def _user(
    *,
    roles: list[Role] | None = None,
    platform_role_id: int | None = None,
    platform_role_ids: list[int] | None = None,
    platform_role_code: str | None = None,
    platform_role_codes: list[str] | None = None,
    platform_role_name: str | None = None,
    platform_role_names: list[str] | None = None,
    reports_access: bool = False,
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
        reports_access=reports_access,
    )


class ReportsAccessTests(unittest.TestCase):
    def test_superadmin_keeps_reports_access(self) -> None:
        user = _user(platform_role_ids=[2], roles=[Role.HR_ADMIN])

        self.assertTrue(has_reports_access(user))

    def test_explicit_reports_assignment_grants_access(self) -> None:
        user = _user(reports_access=True, roles=[Role.VIEWER])

        self.assertTrue(has_reports_access(user))

    def test_reports_role_code_no_longer_grants_access(self) -> None:
        user = _user(platform_role_codes=["recruitment_reports"], roles=[Role.VIEWER])

        self.assertFalse(has_reports_access(user))

    def test_hr_admin_role_without_feature_assignment_no_longer_grants_access(self) -> None:
        user = _user(roles=[Role.HR_ADMIN], platform_role_ids=[3], platform_role_codes=["hr_admin"])

        self.assertFalse(has_reports_access(user))

    def test_regular_user_without_assignment_cannot_access_reports(self) -> None:
        user = _user(roles=[Role.VIEWER], platform_role_ids=[9], platform_role_codes=["viewer"])

        self.assertFalse(has_reports_access(user))


if __name__ == "__main__":
    unittest.main()
