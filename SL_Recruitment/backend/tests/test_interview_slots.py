from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
import unittest
from unittest.mock import patch
from zoneinfo import ZoneInfo

from app.core.config import settings
from app.services.interview_slots import _day_slots, filter_free_slots


class InterviewSlotServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self._orig_duration = settings.interview_slot_duration_minutes
        self._orig_step = settings.interview_slot_step_minutes

    def tearDown(self) -> None:
        settings.interview_slot_duration_minutes = self._orig_duration
        settings.interview_slot_step_minutes = self._orig_step

    @staticmethod
    def _next_business_day(seed: date) -> date:
        day = seed
        while day.weekday() >= 5:
            day += timedelta(days=1)
        return day

    def test_day_slots_use_five_minute_step_with_one_hour_duration(self) -> None:
        settings.interview_slot_duration_minutes = 60
        settings.interview_slot_step_minutes = 5
        day = self._next_business_day(date(2030, 1, 1))

        slots = _day_slots(day, tz=ZoneInfo("UTC"))

        self.assertGreaterEqual(len(slots), 3)
        self.assertEqual(slots[0].start_at.time(), time(10, 0))
        self.assertEqual(slots[0].end_at.time(), time(11, 0))
        self.assertEqual(slots[1].start_at.time(), time(10, 5))
        self.assertEqual(slots[2].start_at.time(), time(10, 10))

    def test_filter_free_slots_keeps_daily_suggestions_non_overlapping(self) -> None:
        settings.interview_slot_duration_minutes = 60
        settings.interview_slot_step_minutes = 5
        day = self._next_business_day(date.today() + timedelta(days=1))
        fake_now = datetime.combine(day, time(9, 0), tzinfo=timezone.utc)

        with patch("app.services.interview_slots._busy_ranges_utc", return_value=[]):
            free_slots = filter_free_slots(
                interviewer_email="interviewer@example.com",
                start_day=day,
                tz=ZoneInfo("UTC"),
                now_local=fake_now,
            )

        self.assertGreaterEqual(len(free_slots), 2)
        self.assertEqual(free_slots[0].start_at.time(), time(10, 0))
        self.assertEqual(free_slots[1].start_at.time(), time(11, 0))
        self.assertEqual(free_slots[1].start_at - free_slots[0].start_at, timedelta(hours=1))

    def test_filter_free_slots_returns_next_immediate_five_minute_start(self) -> None:
        settings.interview_slot_duration_minutes = 60
        settings.interview_slot_step_minutes = 5
        day = self._next_business_day(date.today() + timedelta(days=1))
        fake_now = datetime.combine(day, time(10, 59), tzinfo=timezone.utc)
        busy_ranges = [
            (
                datetime.combine(day, time(11, 0), tzinfo=timezone.utc),
                datetime.combine(day, time(11, 15), tzinfo=timezone.utc),
            )
        ]

        with patch("app.services.interview_slots._busy_ranges_utc", return_value=busy_ranges):
            free_slots = filter_free_slots(
                interviewer_email="interviewer@example.com",
                start_day=day,
                tz=ZoneInfo("UTC"),
                now_local=fake_now,
            )

        self.assertGreaterEqual(len(free_slots), 1)
        self.assertEqual(free_slots[0].start_at.time(), time(11, 15))

    def test_slot_step_is_clamped_to_duration(self) -> None:
        settings.interview_slot_duration_minutes = 30
        settings.interview_slot_step_minutes = 45
        day = self._next_business_day(date(2030, 1, 1))

        slots = _day_slots(day, tz=ZoneInfo("UTC"))

        self.assertGreaterEqual(len(slots), 2)
        self.assertEqual(slots[0].start_at.time(), time(10, 0))
        self.assertEqual(slots[1].start_at.time(), time(10, 30))


if __name__ == "__main__":
    unittest.main()
