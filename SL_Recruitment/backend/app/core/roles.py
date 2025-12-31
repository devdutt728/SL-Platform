from enum import Enum
from typing import Iterable


class Role(str, Enum):
    HR_ADMIN = "hr_admin"
    HR_EXEC = "hr_exec"
    INTERVIEWER = "interviewer"
    HIRING_MANAGER = "hiring_manager"
    APPROVER = "approver"
    VIEWER = "viewer"


ROLE_HIERARCHY = {
    Role.HR_ADMIN: {Role.HR_ADMIN, Role.HR_EXEC, Role.INTERVIEWER, Role.HIRING_MANAGER, Role.APPROVER, Role.VIEWER},
    Role.HR_EXEC: {Role.HR_EXEC, Role.INTERVIEWER, Role.HIRING_MANAGER, Role.APPROVER, Role.VIEWER},
    Role.HIRING_MANAGER: {Role.HIRING_MANAGER, Role.INTERVIEWER, Role.VIEWER},
    Role.INTERVIEWER: {Role.INTERVIEWER, Role.VIEWER},
    Role.APPROVER: {Role.APPROVER, Role.VIEWER},
    Role.VIEWER: {Role.VIEWER},
}


def has_required_role(user_roles: Iterable[Role], required: Iterable[Role]) -> bool:
    user_roles_set = {Role(r) for r in user_roles}
    required_set = {Role(r) for r in required}
    return bool(user_roles_set & required_set)
