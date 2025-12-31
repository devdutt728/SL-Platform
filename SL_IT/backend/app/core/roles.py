from __future__ import annotations

from enum import Enum
from typing import Iterable


class Role(str, Enum):
    SUPERADMIN = "superadmin"
    ADMIN = "admin"
    IT_LEAD = "it_lead"
    IT_AGENT = "it_agent"
    RECRUITER = "recruiter"
    MANAGER = "manager"
    EMPLOYEE = "employee"
    VIEWER = "viewer"


def has_required_role(user_roles: Iterable[Role], required: Iterable[Role]) -> bool:
    user_role_set = set(user_roles)
    if Role.SUPERADMIN in user_role_set:
        return True
    return any(role in user_role_set for role in required)
