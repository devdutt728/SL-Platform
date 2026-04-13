from __future__ import annotations

from dataclasses import dataclass

from app.models.platform_person import DimPerson
from app.schemas.planner import PlannerRoleCode
from app.schemas.user import UserContext

SUPER_ADMIN_TOKENS = {"2", "s_admin", "superadmin", "super_admin"}
GROUP_LEADER_TOKENS = {"group_leader", "groupleader", "gl", "design_lead", "project_lead", "team_lead"}
PROJECT_ANCHOR_TOKENS = {"project_anchor", "projectanchor", "anchor"}
SENIOR_ARCHITECT_PHRASES = {
    "senior architect",
    "sr architect",
    "sr. architect",
    "senior interior designer",
    "senior designer",
    "sr designer",
    "sr. designer",
}
ARCHITECT_PHRASES = {"architect", "designer", "interior", "interior designer"}


def normalize_role_token(value: object) -> str:
    return str(value or "").strip().lower().replace("-", "_").replace(" ", "_")


def is_superadmin_user(user: UserContext) -> bool:
    role_ids = [*(user.platform_role_ids or []), user.platform_role_id]
    normalized = {
        normalize_role_token(value)
        for value in [
            *(user.roles or []),
            *(user.platform_role_codes or []),
            *(user.platform_role_names or []),
            user.platform_role_code,
            user.platform_role_name,
        ]
        if value
    }
    return 2 in role_ids or bool(SUPER_ADMIN_TOKENS & normalized)


def _title_blob(user: UserContext, person: DimPerson | None) -> str:
    values: list[str] = []
    if person is not None:
        values.extend([person.job_title or "", person.secondary_job_title or "", person.department or "", person.sub_department or ""])
    values.extend(user.roles or [])
    values.extend(user.platform_role_codes or [])
    values.extend(user.platform_role_names or [])
    if user.platform_role_code:
        values.append(user.platform_role_code)
    if user.platform_role_name:
        values.append(user.platform_role_name)
    return " ".join(value for value in values if value).strip().lower()


def resolve_planner_role(user: UserContext, person: DimPerson | None) -> PlannerRoleCode:
    if is_superadmin_user(user):
        return "super_admin"

    title_blob = _title_blob(user, person)
    normalized_tokens = {normalize_role_token(token) for token in title_blob.split() if token}

    if "principal" in title_blob:
        return "principal"
    if "project anchor" in title_blob or PROJECT_ANCHOR_TOKENS & normalized_tokens:
        return "project_anchor"
    if "group leader" in title_blob or GROUP_LEADER_TOKENS & normalized_tokens:
        return "group_leader"
    if any(phrase in title_blob for phrase in SENIOR_ARCHITECT_PHRASES):
        return "senior_architect"
    if any(phrase in title_blob for phrase in ARCHITECT_PHRASES):
        return "architect"
    return "viewer"


@dataclass(frozen=True)
class PlannerActorPolicy:
    role: PlannerRoleCode
    can_view_all: bool
    can_create: bool
    can_edit_scoped: bool
    can_edit_assigned: bool
    can_approve_architect: bool
    can_approve_senior_architect: bool
    can_soft_delete: bool
    can_hard_delete: bool


def policy_for_role(role: PlannerRoleCode) -> PlannerActorPolicy:
    if role == "super_admin":
        return PlannerActorPolicy(role, True, True, True, True, True, True, True, True)
    if role == "principal":
        return PlannerActorPolicy(role, True, False, False, False, False, False, False, False)
    if role == "group_leader":
        return PlannerActorPolicy(role, False, True, True, True, True, True, True, False)
    if role == "project_anchor":
        return PlannerActorPolicy(role, False, True, True, True, True, True, True, False)
    if role == "senior_architect":
        return PlannerActorPolicy(role, False, True, True, True, True, False, False, False)
    if role == "architect":
        return PlannerActorPolicy(role, False, True, False, True, False, False, False, False)
    return PlannerActorPolicy(role, False, False, False, False, False, False, False, False)


def can_approve_requester(actor: PlannerActorPolicy, requester_role: PlannerRoleCode | None) -> bool:
    if actor.role == "super_admin":
        return True
    if requester_role is None:
        return False
    if actor.role in {"group_leader", "project_anchor"}:
        return requester_role in {"architect", "senior_architect"}
    if actor.role == "senior_architect":
        return requester_role == "architect"
    return False
