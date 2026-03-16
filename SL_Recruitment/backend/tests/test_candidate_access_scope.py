from __future__ import annotations

import unittest

from app.api.routes.candidates import _is_interviewer_scope
from app.core.roles import Role
from app.schemas.user import UserContext


def _user(*, roles: list[Role], platform_role_ids: list[int] | None = None, platform_role_id: int | None = None) -> UserContext:
    return UserContext(
        user_id="user@example.com",
        email="user@example.com",
        roles=roles,
        person_id_platform="123",
        full_name="Test User",
        platform_role_id=platform_role_id,
        platform_role_ids=platform_role_ids,
    )


class CandidateAccessScopeTests(unittest.TestCase):
    def test_role_5_users_are_assignment_scoped(self) -> None:
        user = _user(roles=[Role.GROUP_LEAD], platform_role_ids=[5])

        self.assertTrue(_is_interviewer_scope(user))

    def test_role_6_users_are_assignment_scoped(self) -> None:
        user = _user(roles=[Role.GROUP_LEAD], platform_role_ids=[6])

        self.assertTrue(_is_interviewer_scope(user))

    def test_hr_users_are_not_assignment_scoped_even_with_role_5_or_6(self) -> None:
        user = _user(roles=[Role.HR_EXEC, Role.GROUP_LEAD], platform_role_ids=[5, 6])

        self.assertFalse(_is_interviewer_scope(user))

    def test_superadmin_users_are_not_assignment_scoped_even_with_role_5_or_6(self) -> None:
        user = _user(roles=[Role.GROUP_LEAD], platform_role_ids=[2, 5])

        self.assertFalse(_is_interviewer_scope(user))


if __name__ == "__main__":
    unittest.main()
