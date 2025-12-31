from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.it import ITAuditLog
from app.request_context import RequestContext
from app.schemas.user import UserContext


async def write_audit_log(
    session: AsyncSession,
    *,
    actor: UserContext | None,
    action: str,
    entity_type: str,
    entity_id: str,
    before: dict | None,
    after: dict | None,
    context: RequestContext | None,
) -> ITAuditLog:
    entry = ITAuditLog(
        actor_person_id=actor.person_id_platform if actor else None,
        actor_email=actor.email if actor else None,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        before_json=before,
        after_json=after,
        ip=context.ip if context else None,
        user_agent=context.user_agent if context else None,
        request_id=context.request_id if context else None,
    )
    session.add(entry)
    return entry
