from __future__ import annotations

import unittest

from fastapi import HTTPException

from app.api.routes.candidates import _normalize_opening_filter_ids


class CandidateOpeningFilterTests(unittest.TestCase):
    def test_normalizes_repeated_and_comma_separated_opening_ids(self) -> None:
        self.assertEqual(_normalize_opening_filter_ids(["1", "2,3", "2", " 4 "]), [1, 2, 3, 4])

    def test_empty_values_return_none(self) -> None:
        self.assertIsNone(_normalize_opening_filter_ids(["", "  ", ","]))

    def test_invalid_values_raise_bad_request(self) -> None:
        with self.assertRaises(HTTPException) as ctx:
            _normalize_opening_filter_ids(["abc"])

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, "opening_id must be an integer.")


if __name__ == "__main__":
    unittest.main()
