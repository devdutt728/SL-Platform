from __future__ import annotations

from collections import deque
import unittest

from app.core.stage_machine import (
    ALL_STAGES,
    DECLINED,
    ENQUIRY,
    HIRED,
    HR_SCREENING,
    JOINING_DOCUMENTS,
    OFFER,
    REJECTED,
    STAGE_GRAPH,
    TERMINAL_STAGES,
    can_transition,
    is_known_stage,
    is_terminal_stage,
    normalize_stage_name,
    path_is_valid,
)


class StageMachineDiagramTests(unittest.TestCase):
    def test_graph_covers_all_known_stages(self) -> None:
        self.assertSetEqual(set(STAGE_GRAPH.keys()), set(ALL_STAGES))

    def test_all_edges_point_to_known_stages(self) -> None:
        known = set(ALL_STAGES)
        for source, targets in STAGE_GRAPH.items():
            self.assertIn(source, known)
            for target in targets:
                self.assertIn(target, known)

    def test_terminal_stages_have_no_outgoing_edges(self) -> None:
        for stage in TERMINAL_STAGES:
            self.assertTrue(is_terminal_stage(stage))
            self.assertEqual(STAGE_GRAPH[stage], frozenset())

    def test_non_terminal_stages_have_outgoing_edges(self) -> None:
        for stage in ALL_STAGES:
            if stage in TERMINAL_STAGES:
                continue
            self.assertGreater(len(STAGE_GRAPH[stage]), 0, msg=f"{stage} has no outgoing edges")

    def test_stage_name_normalization_and_aliases(self) -> None:
        self.assertEqual(normalize_stage_name("  HR Screening "), HR_SCREENING)
        self.assertEqual(normalize_stage_name("caf"), HR_SCREENING)
        self.assertEqual(normalize_stage_name("l2"), "l2_interview")
        self.assertEqual(normalize_stage_name("l1"), "l1_interview")
        self.assertIsNone(normalize_stage_name(""))
        self.assertIsNone(normalize_stage_name(None))

    def test_known_stage_detection(self) -> None:
        self.assertTrue(is_known_stage(ENQUIRY))
        self.assertTrue(is_known_stage("caf"))
        self.assertFalse(is_known_stage("unknown_stage"))

    def test_happy_path_to_hired_is_valid(self) -> None:
        happy_path = [
            ENQUIRY,
            HR_SCREENING,
            "l2_shortlist",
            "l2_interview",
            "l2_feedback",
            "sprint",
            "l1_shortlist",
            "l1_interview",
            "l1_feedback",
            OFFER,
            JOINING_DOCUMENTS,
            HIRED,
        ]
        self.assertTrue(path_is_valid(happy_path))

    def test_offer_decline_branch_is_valid(self) -> None:
        decline_path = [ENQUIRY, HR_SCREENING, OFFER, DECLINED]
        self.assertTrue(path_is_valid(decline_path))

    def test_reject_branch_is_valid(self) -> None:
        reject_path = [ENQUIRY, HR_SCREENING, REJECTED]
        self.assertTrue(path_is_valid(reject_path))

    def test_invalid_jumps_are_rejected(self) -> None:
        self.assertFalse(can_transition(ENQUIRY, OFFER))
        self.assertFalse(can_transition(HR_SCREENING, HIRED))
        self.assertFalse(can_transition(OFFER, HIRED))
        self.assertFalse(can_transition("sprint", JOINING_DOCUMENTS))

    def test_same_stage_transition_is_rejected(self) -> None:
        self.assertFalse(can_transition(ENQUIRY, ENQUIRY))

    def test_terminal_stage_cannot_reopen_without_override(self) -> None:
        self.assertFalse(can_transition(HIRED, HR_SCREENING))
        self.assertFalse(can_transition(DECLINED, OFFER))
        self.assertFalse(can_transition(REJECTED, ENQUIRY))

    def test_terminal_stage_reopen_with_override_still_requires_edge(self) -> None:
        # Even with override, an edge must exist in the explicit diagram.
        self.assertFalse(can_transition(HIRED, HR_SCREENING, allow_terminal_reopen=True))

    def test_connectivity_from_enquiry_to_terminal_states(self) -> None:
        # Validate the stage diagram has a route from entry stage to each terminal stage.
        graph = STAGE_GRAPH
        reachable: set[str] = set()
        queue = deque([ENQUIRY])
        while queue:
            node = queue.popleft()
            if node in reachable:
                continue
            reachable.add(node)
            queue.extend(graph[node])

        self.assertIn(HIRED, reachable)
        self.assertIn(DECLINED, reachable)
        self.assertIn(REJECTED, reachable)


if __name__ == "__main__":
    unittest.main()

