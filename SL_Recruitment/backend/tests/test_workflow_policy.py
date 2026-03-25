from __future__ import annotations

import unittest

from app.services.workflow_policy import (
    INTERN_L2_ONLY_WORKFLOW,
    STANDARD_WORKFLOW,
    WorkflowPolicy,
    extract_intern_hiring_recommendation,
    is_l1_round,
    is_stage_disabled_for_policy,
    workflow_variant_for_opening_code,
)


class WorkflowPolicyTests(unittest.TestCase):
    def test_intern_openings_get_intern_workflow_variant(self) -> None:
        self.assertEqual(workflow_variant_for_opening_code("INTR-8299B8"), INTERN_L2_ONLY_WORKFLOW)
        self.assertEqual(workflow_variant_for_opening_code(" cmin-8299b0 "), INTERN_L2_ONLY_WORKFLOW)

    def test_other_openings_remain_standard(self) -> None:
        self.assertEqual(workflow_variant_for_opening_code("ARCH-001"), STANDARD_WORKFLOW)
        self.assertEqual(workflow_variant_for_opening_code(None), STANDARD_WORKFLOW)

    def test_intern_workflow_disables_l1_sprint_offer_stages(self) -> None:
        policy = WorkflowPolicy(workflow_variant=INTERN_L2_ONLY_WORKFLOW, opening_code="INTR-8299B8")
        self.assertTrue(is_stage_disabled_for_policy(policy, "sprint"))
        self.assertTrue(is_stage_disabled_for_policy(policy, "l1_interview"))
        self.assertTrue(is_stage_disabled_for_policy(policy, "offer"))
        self.assertFalse(policy.requires_caf)
        self.assertFalse(policy.requires_candidate_assessment)
        self.assertFalse(is_stage_disabled_for_policy(policy, "l2_feedback"))
        self.assertFalse(is_stage_disabled_for_policy(policy, "rejected"))

    def test_round_helper_identifies_l1_rounds(self) -> None:
        self.assertTrue(is_l1_round("L1"))
        self.assertTrue(is_l1_round("Tech L1"))
        self.assertFalse(is_l1_round("L2"))

    def test_extract_intern_hiring_recommendation(self) -> None:
        self.assertEqual(
            extract_intern_hiring_recommendation({"intern_recommendation": {"suitable_for_hiring": "YES"}}),
            "YES",
        )
        self.assertEqual(
            extract_intern_hiring_recommendation('{"intern_recommendation":{"suitable_for_hiring":"NO"}}'),
            "NO",
        )
        self.assertIsNone(extract_intern_hiring_recommendation({"intern_recommendation": {"suitable_for_hiring": ""}}))


if __name__ == "__main__":
    unittest.main()
