from __future__ import annotations

from fastapi import Depends

from app.core.auth import get_current_user, require_roles
from app.core.roles import Role
from app.schemas.user import UserContext


def require_admin():
    return require_roles([Role.ADMIN, Role.SUPERADMIN])


def require_superadmin():
    return require_roles([Role.SUPERADMIN])


def require_it_agent():
    return require_roles([Role.IT_AGENT, Role.IT_LEAD, Role.ADMIN, Role.SUPERADMIN])


def require_it_lead():
    return require_roles([Role.IT_LEAD, Role.ADMIN, Role.SUPERADMIN])


def require_employee():
    return require_roles(
        [
            Role.EMPLOYEE,
            Role.MANAGER,
            Role.RECRUITER,
            Role.IT_AGENT,
            Role.IT_LEAD,
            Role.ADMIN,
            Role.SUPERADMIN,
        ]
    )


def get_user(user: UserContext = Depends(get_current_user)) -> UserContext:
    return user
