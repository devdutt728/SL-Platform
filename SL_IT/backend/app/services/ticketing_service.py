from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.constants import (
    IT_IMPACT_HIGH,
    IT_IMPACT_LOW,
    IT_IMPACT_MEDIUM,
    IT_PRIORITY_P0,
    IT_PRIORITY_P1,
    IT_PRIORITY_P2,
    IT_PRIORITY_P3,
    IT_STATUS_CLOSED,
    IT_STATUS_IN_PROGRESS,
    IT_STATUS_OPEN,
    IT_STATUS_REOPENED,
    IT_STATUS_RESOLVED,
    IT_STATUS_TRIAGED,
    IT_STATUS_WAITING_ON_USER,
    IT_URGENCY_HIGH,
    IT_URGENCY_LOW,
    IT_URGENCY_MEDIUM,
)
from app.models.it import ITTicket, ITTicketSequence, ITSlaPolicy

ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    IT_STATUS_OPEN: {
        IT_STATUS_TRIAGED,
        IT_STATUS_IN_PROGRESS,
        IT_STATUS_WAITING_ON_USER,
        IT_STATUS_RESOLVED,
        IT_STATUS_CLOSED,
    },
    IT_STATUS_TRIAGED: {
        IT_STATUS_IN_PROGRESS,
        IT_STATUS_WAITING_ON_USER,
        IT_STATUS_RESOLVED,
        IT_STATUS_CLOSED,
    },
    IT_STATUS_IN_PROGRESS: {
        IT_STATUS_WAITING_ON_USER,
        IT_STATUS_RESOLVED,
        IT_STATUS_CLOSED,
    },
    IT_STATUS_WAITING_ON_USER: {
        IT_STATUS_IN_PROGRESS,
        IT_STATUS_RESOLVED,
        IT_STATUS_CLOSED,
    },
    IT_STATUS_RESOLVED: {IT_STATUS_CLOSED, IT_STATUS_REOPENED},
    IT_STATUS_CLOSED: {IT_STATUS_REOPENED},
    IT_STATUS_REOPENED: {
        IT_STATUS_TRIAGED,
        IT_STATUS_IN_PROGRESS,
        IT_STATUS_WAITING_ON_USER,
        IT_STATUS_RESOLVED,
        IT_STATUS_CLOSED,
    },
}


def suggest_priority(impact: str, urgency: str) -> str:
    if impact == IT_IMPACT_HIGH and urgency == IT_URGENCY_HIGH:
        return IT_PRIORITY_P0
    if impact == IT_IMPACT_HIGH and urgency == IT_URGENCY_MEDIUM:
        return IT_PRIORITY_P1
    if impact == IT_IMPACT_MEDIUM and urgency == IT_URGENCY_HIGH:
        return IT_PRIORITY_P1
    if impact == IT_IMPACT_MEDIUM and urgency == IT_URGENCY_MEDIUM:
        return IT_PRIORITY_P2
    if impact == IT_IMPACT_LOW and urgency == IT_URGENCY_HIGH:
        return IT_PRIORITY_P2
    return IT_PRIORITY_P3


async def get_sla_policy(
    session: AsyncSession, category_id: int | None, priority: str | None
) -> ITSlaPolicy | None:
    queries = []
    if category_id is not None and priority is not None:
        queries.append(
            select(ITSlaPolicy).where(
                ITSlaPolicy.is_active.is_(True),
                ITSlaPolicy.category_id == category_id,
                ITSlaPolicy.priority == priority,
            )
        )
    if category_id is not None:
        queries.append(
            select(ITSlaPolicy).where(
                ITSlaPolicy.is_active.is_(True),
                ITSlaPolicy.category_id == category_id,
                ITSlaPolicy.priority.is_(None),
            )
        )
    if priority is not None:
        queries.append(
            select(ITSlaPolicy).where(
                ITSlaPolicy.is_active.is_(True),
                ITSlaPolicy.category_id.is_(None),
                ITSlaPolicy.priority == priority,
            )
        )
    queries.append(
        select(ITSlaPolicy).where(
            ITSlaPolicy.is_active.is_(True),
            ITSlaPolicy.category_id.is_(None),
            ITSlaPolicy.priority.is_(None),
        )
    )

    for stmt in queries:
        result = await session.execute(stmt)
        policy = result.scalars().first()
        if policy:
            return policy
    return None


def compute_sla_due(created_at: datetime, policy: ITSlaPolicy | None) -> tuple[datetime | None, datetime | None]:
    if not policy:
        return None, None
    first_response = created_at + timedelta(minutes=policy.first_response_minutes)
    resolution = created_at + timedelta(minutes=policy.resolution_minutes)
    return first_response, resolution


async def next_ticket_number(session: AsyncSession, created_at: datetime) -> str:
    year = created_at.year
    result = await session.execute(
        select(ITTicketSequence).where(ITTicketSequence.year == year).with_for_update()
    )
    sequence = result.scalars().one_or_none()
    if not sequence:
        sequence = ITTicketSequence(year=year, last_number=1)
        session.add(sequence)
        sequence_number = 1
    else:
        sequence.last_number += 1
        sequence_number = sequence.last_number
    return f"IT-{year}-{sequence_number:06d}"


def validate_transition(ticket: ITTicket, new_status: str, now: datetime) -> None:
    allowed = ALLOWED_TRANSITIONS.get(ticket.status, set())
    if new_status not in allowed:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_transition")
    if new_status == IT_STATUS_REOPENED:
        if ticket.resolved_at:
            cutoff = ticket.resolved_at + timedelta(days=settings.reopen_window_days)
        elif ticket.closed_at:
            cutoff = ticket.closed_at + timedelta(days=settings.reopen_window_days)
        else:
            cutoff = now
        if now > cutoff:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="reopen_window_expired")
