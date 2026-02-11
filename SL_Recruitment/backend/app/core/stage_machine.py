from __future__ import annotations

from typing import Iterable


# Canonical stage identifiers used across backend flows.
ENQUIRY = "enquiry"
HR_SCREENING = "hr_screening"
L2_SHORTLIST = "l2_shortlist"
L2_INTERVIEW = "l2_interview"
L2_FEEDBACK = "l2_feedback"
SPRINT = "sprint"
L1_SHORTLIST = "l1_shortlist"
L1_INTERVIEW = "l1_interview"
L1_FEEDBACK = "l1_feedback"
OFFER = "offer"
JOINING_DOCUMENTS = "joining_documents"
HIRED = "hired"
DECLINED = "declined"
REJECTED = "rejected"


ALL_STAGES: tuple[str, ...] = (
    ENQUIRY,
    HR_SCREENING,
    L2_SHORTLIST,
    L2_INTERVIEW,
    L2_FEEDBACK,
    SPRINT,
    L1_SHORTLIST,
    L1_INTERVIEW,
    L1_FEEDBACK,
    OFFER,
    JOINING_DOCUMENTS,
    HIRED,
    DECLINED,
    REJECTED,
)


TERMINAL_STAGES: frozenset[str] = frozenset({HIRED, DECLINED, REJECTED})


# Backward compatibility aliases seen in legacy payloads/UI.
_ALIASES = {
    "caf": HR_SCREENING,
    "l2": L2_INTERVIEW,
    "l1": L1_INTERVIEW,
}


# Explicit state diagram:
# each key can only move to the listed next states in normal progression.
STAGE_GRAPH: dict[str, frozenset[str]] = {
    ENQUIRY: frozenset({HR_SCREENING, REJECTED, DECLINED}),
    HR_SCREENING: frozenset({L2_SHORTLIST, L2_INTERVIEW, SPRINT, L1_SHORTLIST, OFFER, REJECTED, DECLINED}),
    L2_SHORTLIST: frozenset({L2_INTERVIEW, REJECTED, DECLINED}),
    L2_INTERVIEW: frozenset({L2_FEEDBACK, REJECTED, DECLINED}),
    L2_FEEDBACK: frozenset({SPRINT, L1_SHORTLIST, OFFER, REJECTED, DECLINED}),
    SPRINT: frozenset({L1_SHORTLIST, REJECTED, DECLINED}),
    L1_SHORTLIST: frozenset({L1_INTERVIEW, REJECTED, DECLINED}),
    L1_INTERVIEW: frozenset({L1_FEEDBACK, REJECTED, DECLINED}),
    L1_FEEDBACK: frozenset({OFFER, REJECTED, DECLINED}),
    OFFER: frozenset({JOINING_DOCUMENTS, DECLINED, REJECTED}),
    JOINING_DOCUMENTS: frozenset({HIRED, DECLINED, REJECTED}),
    HIRED: frozenset(),
    DECLINED: frozenset(),
    REJECTED: frozenset(),
}


def normalize_stage_name(raw: str | None) -> str | None:
    if raw is None:
        return None
    normalized = raw.strip().lower().replace(" ", "_")
    if not normalized:
        return None
    return _ALIASES.get(normalized, normalized)


def is_known_stage(stage: str | None) -> bool:
    normalized = normalize_stage_name(stage)
    return normalized in STAGE_GRAPH


def is_terminal_stage(stage: str | None) -> bool:
    normalized = normalize_stage_name(stage)
    return normalized in TERMINAL_STAGES


def allowed_next_stages(stage: str | None) -> frozenset[str]:
    normalized = normalize_stage_name(stage)
    if normalized is None:
        return frozenset()
    return STAGE_GRAPH.get(normalized, frozenset())


def can_transition(
    from_stage: str | None,
    to_stage: str | None,
    *,
    allow_terminal_reopen: bool = False,
) -> bool:
    to_normalized = normalize_stage_name(to_stage)
    from_normalized = normalize_stage_name(from_stage)

    if to_normalized is None or to_normalized not in STAGE_GRAPH:
        return False

    # Initial entry state for records with no stage yet.
    if from_normalized is None:
        return to_normalized == ENQUIRY

    if from_normalized not in STAGE_GRAPH:
        return False

    if from_normalized in TERMINAL_STAGES and not allow_terminal_reopen:
        return False

    if from_normalized == to_normalized:
        return False

    return to_normalized in STAGE_GRAPH[from_normalized]


def stage_diagram_nodes() -> tuple[str, ...]:
    return ALL_STAGES


def stage_diagram_edges() -> dict[str, frozenset[str]]:
    return STAGE_GRAPH.copy()


def path_is_valid(path: Iterable[str]) -> bool:
    items = [normalize_stage_name(item) for item in path]
    if len(items) < 2:
        return False
    for index in range(len(items) - 1):
        if not can_transition(items[index], items[index + 1]):
            return False
    return True

