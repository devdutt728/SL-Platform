from __future__ import annotations

from typing import Iterable

from app.core.roles import Role

SUPERADMIN_TOKENS = {"2", "superadmin", "s_admin", "super_admin"}
RECRUITMENT_ROLE_TOKENS = {
    "hr_admin",
    "hr_exec",
    "interviewer",
    "gl",
    "group_lead",
    "grouplead",
    "hiring_manager",
    "approver",
}
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


def normalize_access_token(value: object) -> str:
    return str(value or "").strip().lower().replace(" ", "_").replace("-", "_")


def normalized_tokens(values: Iterable[object]) -> set[str]:
    return {normalize_access_token(value) for value in values if str(value or "").strip()}


def is_superadmin_identity(*, role_ids: Iterable[int | None], role_values: Iterable[object]) -> bool:
    numeric_ids = {int(role_id) for role_id in role_ids if role_id is not None}
    return 2 in numeric_ids or bool(SUPERADMIN_TOKENS & normalized_tokens(role_values))


def is_recruitment_role_eligible(
    *,
    app_roles: Iterable[Role | str],
    role_ids: Iterable[int | None],
    role_values: Iterable[object],
) -> bool:
    normalized_app_roles = {normalize_access_token(role.value if isinstance(role, Role) else role) for role in app_roles}
    if is_superadmin_identity(role_ids=role_ids, role_values=[*role_values, *normalized_app_roles]):
        return True
    return bool(RECRUITMENT_ROLE_TOKENS & (normalized_tokens(role_values) | normalized_app_roles))


def is_planner_profile_eligible(
    *,
    role_ids: Iterable[int | None],
    role_values: Iterable[object],
    title_values: Iterable[object],
) -> bool:
    combined_tokens = normalized_tokens([*role_values, *title_values])
    title_blob = " ".join(str(value or "").strip().lower() for value in title_values if str(value or "").strip())
    if is_superadmin_identity(role_ids=role_ids, role_values=[*role_values, *title_values]):
        return True
    if "principal" in title_blob:
        return True
    if "project anchor" in title_blob or PROJECT_ANCHOR_TOKENS & combined_tokens:
        return True
    if "group leader" in title_blob or GROUP_LEADER_TOKENS & combined_tokens:
        return True
    if any(phrase in title_blob for phrase in SENIOR_ARCHITECT_PHRASES):
        return True
    return any(phrase in title_blob for phrase in ARCHITECT_PHRASES)
