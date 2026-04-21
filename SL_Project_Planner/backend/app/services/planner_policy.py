from __future__ import annotations

from dataclasses import dataclass

from app.models.platform_person import DimPerson
from app.schemas.planner import PlannerRoleCode
from app.schemas.user import UserContext

SUPER_ADMIN_TOKENS = {"s_admin", "superadmin", "super_admin"}
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
ROLE_PRIORITY: list[PlannerRoleCode] = [
    "super_admin",
    "principal",
    "group_leader",
    "project_anchor",
    "senior_architect",
    "architect",
    "viewer",
]


def normalize_role_token(value: object) -> str:
    return str(value or "").strip().lower().replace("-", "_").replace(" ", "_")


def is_superadmin_user(user: UserContext) -> bool:
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
    return bool(SUPER_ADMIN_TOKENS & normalized)


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


def _ordered_roles(values: set[PlannerRoleCode]) -> list[PlannerRoleCode]:
    ordered = [role for role in ROLE_PRIORITY if role in values]
    return ordered or ["viewer"]


def resolve_planner_roles(
    user: UserContext,
    person: DimPerson | None,
    explicit_roles: list[PlannerRoleCode] | tuple[PlannerRoleCode, ...] | None = None,
) -> list[PlannerRoleCode]:
    matched: set[PlannerRoleCode] = set()
    if is_superadmin_user(user):
        matched.add("super_admin")

    title_blob = _title_blob(user, person)
    normalized_tokens = {normalize_role_token(token) for token in title_blob.split() if token}

    if "principal" in title_blob:
        matched.add("principal")
    if "project anchor" in title_blob or PROJECT_ANCHOR_TOKENS & normalized_tokens:
        matched.add("project_anchor")
    if "group leader" in title_blob or GROUP_LEADER_TOKENS & normalized_tokens:
        matched.add("group_leader")
    if any(phrase in title_blob for phrase in SENIOR_ARCHITECT_PHRASES):
        matched.add("senior_architect")
    if any(phrase in title_blob for phrase in ARCHITECT_PHRASES):
        matched.add("architect")
    for role in explicit_roles or []:
        if role != "viewer":
            matched.add(role)
    return _ordered_roles(matched)


def resolve_planner_role(user: UserContext, person: DimPerson | None) -> PlannerRoleCode:
    return resolve_planner_roles(user, person)[0]


@dataclass(frozen=True)
class PlannerActorPolicy:
    roles: tuple[PlannerRoleCode, ...]
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
        return PlannerActorPolicy((role,), role, True, True, True, True, True, True, True, True)
    if role == "principal":
        return PlannerActorPolicy((role,), role, True, False, False, False, False, False, False, False)
    if role == "group_leader":
        return PlannerActorPolicy((role,), role, False, True, True, True, True, True, True, False)
    if role == "project_anchor":
        return PlannerActorPolicy((role,), role, False, True, True, True, True, True, True, False)
    if role == "senior_architect":
        return PlannerActorPolicy((role,), role, False, True, True, True, True, False, False, False)
    if role == "architect":
        return PlannerActorPolicy((role,), role, False, True, False, True, False, False, False, False)
    return PlannerActorPolicy((role,), role, False, False, False, False, False, False, False, False)


def policy_for_roles(roles: list[PlannerRoleCode] | tuple[PlannerRoleCode, ...]) -> PlannerActorPolicy:
    ordered_roles = tuple(_ordered_roles(set(roles)))
    policies = [policy_for_role(role) for role in ordered_roles]
    primary = ordered_roles[0]
    return PlannerActorPolicy(
        roles=ordered_roles,
        role=primary,
        can_view_all=any(policy.can_view_all for policy in policies),
        can_create=any(policy.can_create for policy in policies),
        can_edit_scoped=any(policy.can_edit_scoped for policy in policies),
        can_edit_assigned=any(policy.can_edit_assigned for policy in policies),
        can_approve_architect=any(policy.can_approve_architect for policy in policies),
        can_approve_senior_architect=any(policy.can_approve_senior_architect for policy in policies),
        can_soft_delete=any(policy.can_soft_delete for policy in policies),
        can_hard_delete=any(policy.can_hard_delete for policy in policies),
    )


def can_approve_requester(
    actor: PlannerActorPolicy,
    requester_role: PlannerRoleCode | None = None,
    requester_roles: list[PlannerRoleCode] | tuple[PlannerRoleCode, ...] | None = None,
) -> bool:
    actor_roles = set(actor.roles)
    if "super_admin" in actor_roles:
        return True
    normalized_requester_roles = tuple(_ordered_roles(set(requester_roles or ([] if requester_role is None else [requester_role]))))
    if not normalized_requester_roles:
        return False
    if {"group_leader", "project_anchor"} & actor_roles:
        return bool({"architect", "senior_architect"} & set(normalized_requester_roles))
    if "senior_architect" in actor_roles:
        return "architect" in normalized_requester_roles
    return False
