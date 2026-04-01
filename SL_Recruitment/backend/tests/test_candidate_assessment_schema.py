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

    def test_optional_post_grad_placeholders_are_normalized_to_none(self) -> None:
        payload = CandidateAssessmentUpsertIn(
            education_post_graduation_specialization="Not applicable",
            education_post_graduation_year="Not applicable",
            education_post_graduation_institution="Not applicable",
            education_post_graduation_marks="Not applicable",
        )

        self.assertIsNone(payload.education_post_graduation_specialization)
        self.assertIsNone(payload.education_post_graduation_year)
        self.assertIsNone(payload.education_post_graduation_institution)
        self.assertIsNone(payload.education_post_graduation_marks)

    def test_training_year_is_canonicalized_to_short_month_year(self) -> None:
        payload = CandidateAssessmentUpsertIn(
            training1_year="2024 December",
            training2_year="December 2025",
        )

        self.assertEqual(payload.training1_year, "Dec 2024")
        self.assertEqual(payload.training2_year, "Dec 2025")

    def test_training_year_rejects_values_longer_than_database_limit(self) -> None:
        with self.assertRaises(ValidationError):
            CandidateAssessmentUpsertIn(training1_year="Quarter Four 2024")


if __name__ == "__main__":
    unittest.main()
