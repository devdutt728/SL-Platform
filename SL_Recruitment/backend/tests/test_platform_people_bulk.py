from __future__ import annotations

import unittest

from app.api.routes.platform_people import (
    _BulkRow,
    _external_identity_key,
    _normalize_row,
    _resolve_existing_person,
    _resolve_manager_id,
    _resolve_manager_reference,
    _resolve_replace_person_id,
)
from app.models.platform_person import DimPerson


class PlatformPeopleBulkTests(unittest.TestCase):
    def test_replace_all_uses_uploaded_employee_number_as_person_id(self) -> None:
        person_id, next_seq = _resolve_replace_person_id(
            row=_BulkRow(row_number=2, normalized={"person_code": "SL0001"}),
            incoming_person_id="",
            person_code="SL0001",
            email="ambrish@studiolotus.in",
            first_name="Ambrish",
            last_name="Arora",
            used_ids=set(),
            next_seq=1,
            warnings=[],
        )

        self.assertEqual(person_id, "SL0001")
        self.assertEqual(next_seq, 1)

    def test_replace_all_ignores_legacy_email_mapping_when_disabled(self) -> None:
        warnings = []
        person_id, next_seq = _resolve_replace_person_id(
            row=_BulkRow(row_number=8, normalized={"person_code": "SL0360"}),
            incoming_person_id="",
            person_code="SL0360",
            email="existing.person@studiolotus.in",
            first_name="New",
            last_name="Person",
            used_ids=set(),
            next_seq=1,
            warnings=warnings,
        )

        self.assertEqual(person_id, "SL0360")
        self.assertEqual(next_seq, 1)
        self.assertEqual(warnings, [])

    def test_manager_resolution_prefers_existing_person_id(self) -> None:
        manager = DimPerson(
            person_id="AA_001",
            person_code="SLI001",
            email="manager@example.com",
            first_name="Manager",
        )

        resolved = _resolve_manager_id(
            "AA_001",
            by_person_id={"AA_001": [manager]},
            by_person_code={"sli001": [manager]},
        )

        self.assertEqual(resolved, "AA_001")

    def test_manager_resolution_maps_existing_person_code_to_person_id(self) -> None:
        manager = DimPerson(
            person_id="AA_001",
            person_code="SLI001",
            email="manager@example.com",
            first_name="Manager",
        )

        resolved = _resolve_manager_id(
            "SLI001",
            by_person_id={"AA_001": [manager]},
            by_person_code={"sli001": [manager]},
        )

        self.assertEqual(resolved, "AA_001")

    def test_manager_resolution_clears_unresolved_manager_reference(self) -> None:
        resolved = _resolve_manager_id(
            "SL0012",
            by_person_id={},
            by_person_code={},
        )

        self.assertIsNone(resolved)

    def test_normalize_row_preserves_external_employee_and_manager_codes(self) -> None:
        normalized = _normalize_row(
            {
                "employee_number": "SL0360",
                "reporting_manager_employee_number": "SL0016",
                "work_email": "new.employee@studiolotus.in",
            }
        )

        self.assertEqual(normalized["external_employee_code"], "SL0360")
        self.assertEqual(normalized["external_manager_code"], "SL0016")
        self.assertEqual(normalized["person_code"], "SL0360")
        self.assertEqual(normalized["manager_id"], "SL0016")

    def test_external_employee_code_can_resolve_existing_record(self) -> None:
        existing = DimPerson(
            person_id="AA_015",
            person_code="SLI013",
            email="arya98arun@gmail.com",
            first_name="Arya",
        )
        row = _BulkRow(
            row_number=7,
            normalized={
                "external_employee_code": "22",
                "person_code": "22",
                "email": "arya.updated@studiolotus.in",
                "external_identity_source": "emp_master_upload",
            },
        )

        resolved = _resolve_existing_person(
            row=row,
            by_person_id={"AA_015": [existing]},
            by_person_code={"sli013": [existing]},
            by_external_employee_code={_external_identity_key("emp_master_upload", "22"): [existing]},
            by_email={},
            warnings=[],
        )

        self.assertIsNotNone(resolved)
        self.assertEqual(resolved.person_id, "AA_015")

    def test_bulk_row_normalization_excludes_personal_id(self) -> None:
        normalized = _normalize_row(
            {
                "employee_number": "SL0360",
                "pan_card_number": "ABCDF0001",
                "work_email": "new.employee@studiolotus.in",
            }
        )

        self.assertNotIn("personal_id", normalized)

    def test_manager_resolution_uses_external_employee_code_mapping(self) -> None:
        manager = DimPerson(
            person_id="AA_001",
            person_code="SLI001",
            email="manager@example.com",
            first_name="Manager",
        )

        resolved = _resolve_manager_reference(
            normalized={
                "external_manager_code": "SL0016",
                "manager_id": "SL0016",
                "external_identity_source": "emp_master_upload",
            },
            by_person_id={},
            by_person_code={},
            by_external_employee_code={_external_identity_key("emp_master_upload", "SL0016"): [manager]},
        )

        self.assertEqual(resolved, "AA_001")


if __name__ == "__main__":
    unittest.main()
