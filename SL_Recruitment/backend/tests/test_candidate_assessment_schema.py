from __future__ import annotations

import unittest

from pydantic import ValidationError

from app.schemas.candidate_assessment import CandidateAssessmentUpsertIn


class CandidateAssessmentSchemaTests(unittest.TestCase):
    def test_training_name_accepts_255_characters(self) -> None:
        payload = CandidateAssessmentUpsertIn(training1_name="A" * 255, training2_name="B" * 255)

        self.assertEqual(payload.training1_name, "A" * 255)
        self.assertEqual(payload.training2_name, "B" * 255)

    def test_training_name_rejects_values_longer_than_255_characters(self) -> None:
        with self.assertRaises(ValidationError):
            CandidateAssessmentUpsertIn(training1_name="A" * 256)

        with self.assertRaises(ValidationError):
            CandidateAssessmentUpsertIn(training2_name="B" * 256)


if __name__ == "__main__":
    unittest.main()
