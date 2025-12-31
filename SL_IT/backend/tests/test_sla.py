from datetime import datetime, timedelta

from app.models.it import ITSlaPolicy
from app.services.ticketing_service import compute_sla_due


def test_sla_due_times():
    policy = ITSlaPolicy(
        name="Default",
        first_response_minutes=60,
        resolution_minutes=240,
        is_active=True,
    )
    created = datetime.utcnow()
    first_due, resolution_due = compute_sla_due(created, policy)
    assert first_due == created + timedelta(minutes=60)
    assert resolution_due == created + timedelta(minutes=240)
