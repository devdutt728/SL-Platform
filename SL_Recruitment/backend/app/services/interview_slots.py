from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from secrets import token_urlsafe
from zoneinfo import ZoneInfo

from app.core.config import settings
from app.services.calendar import query_freebusy

BUSINESS_START = time(10, 0)
BUSINESS_END = time(18, 30)
SLOT_MINUTES = 30
SLOTS_PER_EMAIL = 5
BUSINESS_DAYS_LOOKAHEAD = 3


@dataclass
class SlotCandidate:
    start_at: datetime
    end_at: datetime


def _next_business_days(start_day: date, count: int) -> list[date]:
    days: list[date] = []
    current = start_day
    while len(days) < count:
        current += timedelta(days=1)
        if current.weekday() >= 5:
            continue
        days.append(current)
    return days


def _parse_iso(value: str) -> datetime:
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    return datetime.fromisoformat(value)


def _overlaps(a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime) -> bool:
    return a_start < b_end and a_end > b_start


def generate_candidate_slots(*, tz: ZoneInfo) -> list[SlotCandidate]:
    slots: list[SlotCandidate] = []
    today = datetime.now(tz).date()
    for day in _next_business_days(today, BUSINESS_DAYS_LOOKAHEAD):
        current = datetime.combine(day, BUSINESS_START, tzinfo=tz)
        day_end = datetime.combine(day, BUSINESS_END, tzinfo=tz)
        while current + timedelta(minutes=SLOT_MINUTES) <= day_end:
            slots.append(SlotCandidate(start_at=current, end_at=current + timedelta(minutes=SLOT_MINUTES)))
            current += timedelta(minutes=SLOT_MINUTES)
    return slots


def filter_free_slots(*, interviewer_email: str, slots: list[SlotCandidate], tz: ZoneInfo) -> list[SlotCandidate]:
    if not slots:
        return []
    window_start = slots[0].start_at
    window_end = slots[-1].end_at
    busy_map = query_freebusy(
        calendar_ids=[interviewer_email],
        start_at=window_start,
        end_at=window_end,
        subject_email=interviewer_email,
    )
    busy_ranges = busy_map.get(interviewer_email, [])
    busy_utc: list[tuple[datetime, datetime]] = []
    for item in busy_ranges:
        start_raw = item.get("start")
        end_raw = item.get("end")
        if not start_raw or not end_raw:
            continue
        start_dt = _parse_iso(start_raw).astimezone(timezone.utc)
        end_dt = _parse_iso(end_raw).astimezone(timezone.utc)
        busy_utc.append((start_dt, end_dt))

    free_slots: list[SlotCandidate] = []
    for slot in slots:
        slot_start_utc = slot.start_at.astimezone(timezone.utc)
        slot_end_utc = slot.end_at.astimezone(timezone.utc)
        if any(_overlaps(slot_start_utc, slot_end_utc, busy_start, busy_end) for busy_start, busy_end in busy_utc):
            continue
        free_slots.append(slot)
        if len(free_slots) >= SLOTS_PER_EMAIL:
            break
    return free_slots


def build_selection_token() -> str:
    return token_urlsafe(24)
