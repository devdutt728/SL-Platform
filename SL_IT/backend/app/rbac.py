from __future__ import annotations

from fastapi import Depends

from app.core.auth import get_current_user, require_roles
from app.core.roles import Role
from app.schemas.user import UserContext


def require_admin():
    return require_roles([Role.ADMIN, Role.SUPERADMIN])


def require_superadmin():
    return require_roles([Role.SUPERADMIN])


# ── IMS role gates (hierarchical: admin ⊃ manager ⊃ operator ⊃ viewer) ─────────
def require_ims_admin():
    return require_roles([Role.IMS_ADMIN, Role.ADMIN, Role.SUPERADMIN])


def require_ims_manager():
    return require_roles([Role.IMS_MANAGER, Role.IMS_ADMIN, Role.ADMIN, Role.SUPERADMIN])


def require_ims_operator():
    return require_roles(
        [Role.IMS_OPERATOR, Role.IMS_MANAGER, Role.IMS_ADMIN, Role.ADMIN, Role.SUPERADMIN]
    )


def require_ims_viewer():
    return require_roles(
        [
            Role.IMS_VIEWER,
            Role.IMS_OPERATOR,
            Role.IMS_MANAGER,
            Role.IMS_ADMIN,
            Role.ADMIN,
            Role.SUPERADMIN,
        ]
    )


def require_employee():
    """Any authenticated staff member — used for self-service ("My Assets")."""
    return require_roles(
        [
            Role.USER,
            Role.EMPLOYEE,
            Role.IMS_VIEWER,
            Role.IMS_OPERATOR,
            Role.IMS_MANAGER,
            Role.IMS_ADMIN,
            Role.ADMIN,
            Role.SUPERADMIN,
        ]
    )


def get_user(user: UserContext = Depends(get_current_user)) -> UserContext:
    return user
