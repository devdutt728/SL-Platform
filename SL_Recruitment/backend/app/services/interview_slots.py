from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
import base64
import hashlib
import hmac
from secrets import token_urlsafe
from zoneinfo import ZoneInfo

from app.core.config import settings
from app.services.calendar import list_calendar_events, list_visible_calendar_ids, query_freebusy

BUSINESS_START = time(10, 0)
BUSINESS_END = time(18, 30)
SLOT_MINUTES = 60
SLOTS_PER_DAY = 2
DAYS_REQUIRED = 3
MAX_BUSINESS_DAYS_SCAN = 12


@dataclass
class SlotCandidate:
    start_at: datetime
    end_at: datetime


def _iter_business_days(start_day: date, *, include_start: bool):
    current = start_day
    if include_start and current.weekday() < 5:
        yield current
    while True:
        current += timedelta(days=1)
        if current.weekday() >= 5:
            continue
        yield current


def _parse_iso(value: str) -> datetime:
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    return datetime.fromisoformat(value)


def _overlaps(a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime) -> bool:
    return a_start < b_end and a_end > b_start


def generate_candidate_slots(*, tz: ZoneInfo, start_day: date | None = None, include_start: bool = False) -> list[SlotCandidate]:
    slots: list[SlotCandidate] = []
    base_day = start_day or datetime.now(tz).date()
    for day in _iter_business_days(base_day, include_start=include_start):
        if len(slots) >= (DAYS_REQUIRED * SLOTS_PER_DAY * 2):
            break
        current = datetime.combine(day, BUSINESS_START, tzinfo=tz)
        day_end = datetime.combine(day, BUSINESS_END, tzinfo=tz)
        while current + timedelta(minutes=SLOT_MINUTES) <= day_end:
            slots.append(SlotCandidate(start_at=current, end_at=current + timedelta(minutes=SLOT_MINUTES)))
            current += timedelta(minutes=SLOT_MINUTES)
    return slots


def _busy_ranges_utc(
    *,
    interviewer_email: str,
    window_start: datetime,
    window_end: datetime,
    calendar_ids: list[str] | None = None,
) -> list[tuple[datetime, datetime]]:
    calendar_ids = [cid for cid in (calendar_ids or []) if cid]
    if not calendar_ids:
        calendar_ids = list_visible_calendar_ids(subject_email=interviewer_email) or []
    if not calendar_ids:
        calendar_ids = [settings.calendar_id or "primary"]
    try:
        busy_map = query_freebusy(
            calendar_ids=calendar_ids,
            start_at=window_start,
            end_at=window_end,
            subject_email=interviewer_email,
        )
    except Exception:
        return []
    busy_ranges: list[dict[str, str]] = []
    for cid in calendar_ids:
        busy_ranges.extend(busy_map.get(cid, []))
    busy_utc: list[tuple[datetime, datetime]] = []
    local_tz = window_start.tzinfo or timezone.utc
    for item in busy_ranges:
        start_raw = item.get("start")
        end_raw = item.get("end")
        if not start_raw or not end_raw:
            continue
        start_dt = _parse_iso(start_raw).astimezone(timezone.utc)
        end_dt = _parse_iso(end_raw).astimezone(timezone.utc)
        local_start = start_dt.astimezone(local_tz)
        local_end = end_dt.astimezone(local_tz)
        # Ignore full-day/multi-day blocks (typically all-day events) so they don't wipe out slots.
        duration = local_end - local_start
        if local_start.time() <= time(0, 1) and duration >= timedelta(hours=23):
            if local_end.time() >= time(23, 58) or local_end.time() <= time(0, 1):
                continue
        busy_utc.append((start_dt, end_dt))
    # Rely on freebusy only; listing events is much slower and duplicates busy ranges.
    if len(busy_utc) == 1:
        window_start_utc = window_start.astimezone(timezone.utc)
        window_end_utc = window_end.astimezone(timezone.utc)
        busy_start, busy_end = busy_utc[0]
        if busy_start <= window_start_utc + timedelta(minutes=1) and busy_end >= window_end_utc - timedelta(minutes=1):
            try:
                events = list_calendar_events(
                    calendar_id=interviewer_email or calendar_ids[0],
                    start_at=window_start,
                    end_at=window_end,
                    subject_email=interviewer_email,
                )
            except Exception:
                return busy_utc
            busy_from_events: list[tuple[datetime, datetime]] = []
            for event in events:
                if (event.get("status") or "").lower() == "cancelled":
                    continue
                start_info = event.get("start") or {}
                end_info = event.get("end") or {}
                start_raw = start_info.get("dateTime")
                end_raw = end_info.get("dateTime")
                if not start_raw or not end_raw:
                    continue
                try:
                    start_dt = _parse_iso(start_raw).astimezone(timezone.utc)
                    end_dt = _parse_iso(end_raw).astimezone(timezone.utc)
                except ValueError:
                    continue
                busy_from_events.append((start_dt, end_dt))
            return busy_from_events

    return busy_utc


def _day_slots(day: date, *, tz: ZoneInfo) -> list[SlotCandidate]:
    slots: list[SlotCandidate] = []
    current = datetime.combine(day, BUSINESS_START, tzinfo=tz)
    day_end = datetime.combine(day, BUSINESS_END, tzinfo=tz)
    while current + timedelta(minutes=SLOT_MINUTES) <= day_end:
        slots.append(SlotCandidate(start_at=current, end_at=current + timedelta(minutes=SLOT_MINUTES)))
        current += timedelta(minutes=SLOT_MINUTES)
    return slots


def filter_free_slots(*, interviewer_email: str, start_day: date, tz: ZoneInfo) -> list[SlotCandidate]:
    free_slots: list[SlotCandidate] = []
    now_local = datetime.now(tz)
    candidate_days: list[date] = []
    for day in _iter_business_days(start_day, include_start=True):
        candidate_days.append(day)
        if len(candidate_days) >= MAX_BUSINESS_DAYS_SCAN:
            break
    if not candidate_days:
        return []

    slots_needed = DAYS_REQUIRED * SLOTS_PER_DAY
    for day in candidate_days:
        if len(free_slots) >= slots_needed:
            break
        day_slots = _day_slots(day, tz=tz)
        if not day_slots:
            continue
        busy_utc = _busy_ranges_utc(
            interviewer_email=interviewer_email,
            window_start=day_slots[0].start_at,
            window_end=day_slots[-1].end_at,
            calendar_ids=[interviewer_email] if interviewer_email else None,
        )
        available: list[SlotCandidate] = []
        for slot in day_slots:
            if slot.start_at <= now_local:
                continue
            slot_start_utc = slot.start_at.astimezone(timezone.utc)
            slot_end_utc = slot.end_at.astimezone(timezone.utc)
            if any(_overlaps(slot_start_utc, slot_end_utc, busy_start, busy_end) for busy_start, busy_end in busy_utc):
                continue
            available.append(slot)
            if len(available) >= SLOTS_PER_DAY:
                break
        if not available:
            continue
        free_slots.extend(available[:SLOTS_PER_DAY])
    return free_slots


def build_selection_token() -> str:
    return token_urlsafe(24)


def _selection_token_signature(token: str) -> str:
    signing_key = (settings.public_link_signing_key or settings.secret_key).strip()
    digest = hmac.new(
        signing_key.encode("utf-8"),
        token.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")


def build_signed_selection_token(token: str) -> str:
    return f"{token}.{_selection_token_signature(token)}"


def verify_signed_selection_token(signed_token: str) -> str | None:
    if "." not in signed_token:
        return None
    token, signature = signed_token.rsplit(".", 1)
    expected = _selection_token_signature(token)
    if hmac.compare_digest(expected, signature):
        return token
    return None
