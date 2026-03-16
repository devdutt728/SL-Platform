from datetime import datetime
from zoneinfo import ZoneInfo

from app.api.routes.interviews import _build_interview_out, _ist_iso
from app.models.interview import RecCandidateInterview


def test_build_interview_out_marks_interview_datetimes_as_ist():
    interview = RecCandidateInterview(
        candidate_interview_id=177,
        candidate_id=99,
        round_type="L2",
        scheduled_start_at=datetime(2026, 3, 13, 14, 25, 0),
        scheduled_end_at=datetime(2026, 3, 13, 15, 25, 0),
        feedback_submitted=False,
        created_at=datetime(2026, 3, 13, 13, 30, 0),
        updated_at=datetime(2026, 3, 13, 13, 35, 0),
    )

    out = _build_interview_out(interview)

    ist = ZoneInfo("Asia/Kolkata")
    assert out.scheduled_start_at.tzinfo == ist
    assert out.scheduled_end_at.tzinfo == ist
    assert out.created_at.tzinfo == ist
    assert out.updated_at.tzinfo == ist
    assert out.scheduled_start_at.isoformat() == "2026-03-13T14:25:00+05:30"


def test_ist_iso_uses_offset_suffix():
    assert _ist_iso(datetime(2026, 3, 13, 14, 25, 0)) == "2026-03-13T14:25:00+05:30"
