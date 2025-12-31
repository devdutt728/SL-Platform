from __future__ import annotations

import json
from typing import Any, Dict, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.event import RecCandidateEvent
from app.services.event_bus import event_bus


async def log_event(
    session: AsyncSession,
    *,
    candidate_id: int,
    action_type: str,
    related_entity_type: str = "candidate",
    related_entity_id: int | None = None,
    from_status: str | None = None,
    to_status: str | None = None,
    performed_by_person_id_platform: int | None = None,
    meta_json: Dict[str, Any] | None = None,
) -> RecCandidateEvent:
    meta_text: Optional[str] = None
    if meta_json is not None:
        meta_text = json.dumps(meta_json, ensure_ascii=False, separators=(",", ":"))

    event = RecCandidateEvent(
        candidate_id=candidate_id,
        related_entity_type=related_entity_type,
        related_entity_id=related_entity_id,
        action_type=action_type,
        from_status=from_status,
        to_status=to_status,
        performed_by_person_id_platform=performed_by_person_id_platform,
        meta_json=meta_text,
    )
    session.add(event)
    await session.flush()
    await event_bus.publish(
        {
            "event_id": event.candidate_event_id,
            "candidate_id": event.candidate_id,
            "action_type": event.action_type,
        }
    )
    return event
