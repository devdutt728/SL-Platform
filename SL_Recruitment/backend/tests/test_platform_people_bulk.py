from __future__ import annotations

import unittest

from app.api.routes.platform_people import (
    _BulkRow,
    _external_identity_key,
    _normalize_row,
    _preserve_existing_person_code,
    _resolve_existing_person,
    _resolve_manager_id,
    _resolve_manager_reference,
)
from app.models.platform_person import DimPerson


class PlatformPeopleBulkTests(unittest.TestCase):
    def test_safe_merge_keeps_existing_person_code_for_resolved_record(self) -> None:
        existing = DimPerson(
            person_id="AA_015",
            person_code="SLI013",
            email="arya98arun@gmail.com",
            first_name="Arya",
        )
        updates = {"person_code": "22", "status": "Relieved"}

        changed = _preserve_existing_person_code(
            existing=existing,
            updates=updates,
        )

        self.assertTrue(changed)
        self.assertEqual(updates["person_code"], "SLI013")

    def test_safe_merge_allows_unchanged_person_code(self) -> None:
        existing = DimPerson(
            person_id="AM_050",
            person_code="SLI022",
            email="anoushka@example.com",
            first_name="Anoushka",
        )
        updates = {"person_code": "SLI022", "status": "Relieved"}

        changed = _preserve_existing_person_code(
            existing=existing,
            updates=updates,
        )

        self.assertFalse(changed)
        self.assertEqual(updates["person_code"], "SLI022")

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
