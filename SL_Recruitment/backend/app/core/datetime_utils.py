from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

IST = ZoneInfo("Asia/Kolkata")


def now_ist_naive() -> datetime:
    """Return current India time as naive datetime for DATETIME columns."""
    return datetime.now(IST).replace(tzinfo=None)


def to_ist_naive(value: datetime) -> datetime:
    """Normalize a datetime to India time and strip tzinfo for DATETIME columns."""
    if value.tzinfo is None:
        return value
    return value.astimezone(IST).replace(tzinfo=None)
