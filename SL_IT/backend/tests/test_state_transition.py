from datetime import datetime, timedelta

import pytest

from app.constants import IT_STATUS_CLOSED, IT_STATUS_OPEN, IT_STATUS_REOPENED, IT_STATUS_RESOLVED
from app.models.it import ITTicket
from app.services.ticketing_service import validate_transition


def make_ticket(status: str) -> ITTicket:
    return ITTicket(
        ticket_number="IT-2025-000001",
        requester_person_id="person-1",
        requester_email="user@example.com",
        requester_name="User One",
        priority="P2",
        impact="LOW",
        urgency="LOW",
        status=status,
        subject="x",
        description="y",
    )


def test_invalid_transition_raises():
    ticket = make_ticket(IT_STATUS_OPEN)
    with pytest.raises(Exception):
        validate_transition(ticket, IT_STATUS_REOPENED, datetime.utcnow())


def test_reopen_within_window():
    ticket = make_ticket(IT_STATUS_RESOLVED)
    ticket.resolved_at = datetime.utcnow() - timedelta(days=1)
    validate_transition(ticket, IT_STATUS_REOPENED, datetime.utcnow())


def test_reopen_outside_window():
    ticket = make_ticket(IT_STATUS_CLOSED)
    ticket.closed_at = datetime.utcnow() - timedelta(days=30)
    with pytest.raises(Exception):
        validate_transition(ticket, IT_STATUS_REOPENED, datetime.utcnow())
