from __future__ import annotations

from enum import Enum
from typing import Iterable


class Role(str, Enum):
    # Platform-wide roles (shared across all Studio Lotus modules)
    SUPERADMIN = "superadmin"   # granted via SL_ROLE_MAP_JSON {"2":["superadmin"]}
    ADMIN = "admin"

    # Fresh IMS (IT Inventory Management System) roles.
    # Role codes match sl_platform.dim_role: ims_admin(9), ims_manager(10),
    # ims_operator(11), ims_viewer(18).
    IMS_ADMIN = "ims_admin"
    IMS_MANAGER = "ims_manager"
    IMS_OPERATOR = "ims_operator"
    IMS_VIEWER = "ims_viewer"

    # Regular employee self-service ("My Assets"). dim_role id 1 = 'user'.
    USER = "user"
    EMPLOYEE = "employee"
    VIEWER = "viewer"


def has_required_role(user_roles: Iterable[Role], required: Iterable[Role]) -> bool:
    user_role_set = set(user_roles)
    if Role.SUPERADMIN in user_role_set:
        return True
    return any(role in user_role_set for role in required)
