from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
from typing import Any

import anyio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.interview import RecCandidateInterview
from app.models.operation_retry import RecOperationRetry
from app.services.calendar import create_calendar_event, delete_calendar_event, update_calendar_event
from app.services.drive import delete_drive_item, move_candidate_folder
from app.services.events import log_event

STATUS_PENDING = "pending"
STATUS_PROCESSING = "processing"
STATUS_FAILED = "failed"
STATUS_SUCCEEDED = "succeeded"
STATUS_DEAD = "dead"

DEFAULT_MAX_ATTEMPTS = 5
BASE_RETRY_SECONDS = 5 * 60
MAX_RETRY_SECONDS = 6 * 60 * 60

OP_DRIVE_MOVE_FOLDER = "drive_move_folder"
OP_DRIVE_DELETE_ITEM = "drive_delete_item"
OP_CALENDAR_CREATE_EVENT = "calendar_create_event"
OP_CALENDAR_UPDATE_EVENT = "calendar_update_event"
OP_CALENDAR_DELETE_EVENT = "calendar_delete_event"

VALID_DRIVE_BUCKETS = {"Ongoing", "Appointed", "Not Appointed"}


def retry_delay_seconds(attempt_number: int) -> int:
    # attempt_number starts at 1 (first failed execution).
    attempt = max(int(attempt_number), 1)
    delay = BASE_RETRY_SECONDS * (2 ** (attempt - 1))
    return min(delay, MAX_RETRY_SECONDS)


def _json_dumps(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def _json_loads(raw: str | None) -> dict[str, Any]:
    if not raw:
        return {}
    data = json.loads(raw)
    if not isinstance(data, dict):
        raise ValueError("Operation payload must be an object")
    return data


def _parse_datetime_utc(raw: str | None) -> datetime:
    if not raw or not isinstance(raw, str):
        raise ValueError("Missing datetime value")
    value = raw.strip()
    if not value:
        raise ValueError("Missing datetime value")
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


def _parse_int(raw: Any) -> int | None:
    if raw is None:
        return None
    try:
        return int(raw)
    except Exception:
        return None


async def enqueue_operation(
    session: AsyncSession,
    *,
    operation_type: str,
    payload: dict[str, Any],
    candidate_id: int | None = None,
    related_entity_type: str = "candidate",
    related_entity_id: int | None = None,
    max_attempts: int = DEFAULT_MAX_ATTEMPTS,
    idempotency_key: str | None = None,
) -> RecOperationRetry:
    if not operation_type or not operation_type.strip():
        raise ValueError("operation_type is required")

    operation_type = operation_type.strip().lower()
    if max_attempts < 1:
        max_attempts = DEFAULT_MAX_ATTEMPTS

    if idempotency_key:
        existing = (
            await session.execute(
                select(RecOperationRetry).where(
                    RecOperationRetry.idempotency_key == idempotency_key,
                    RecOperationRetry.status.in_(
                        [STATUS_PENDING, STATUS_PROCESSING, STATUS_FAILED, STATUS_SUCCEEDED]
                    ),
                )
            )
        ).scalars().first()
        if existing:
            return existing

    now = datetime.utcnow()
    operation = RecOperationRetry(
        operation_type=operation_type,
        status=STATUS_PENDING,
        candidate_id=candidate_id,
        related_entity_type=related_entity_type,
        related_entity_id=related_entity_id,
        payload_json=_json_dumps(payload),
        idempotency_key=idempotency_key,
        attempts=0,
        max_attempts=max_attempts,
        next_retry_at=now,
        created_at=now,
        updated_at=now,
    )
    session.add(operation)
    await session.flush()

    if candidate_id is not None:
        await log_event(
            session,
            candidate_id=candidate_id,
            action_type="operation_retry_enqueued",
            related_entity_type=related_entity_type,
            related_entity_id=related_entity_id,
            meta_json={
                "operation_retry_id": operation.operation_retry_id,
                "operation_type": operation_type,
                "idempotency_key": idempotency_key,
            },
        )

    return operation


async def _execute_drive_move_folder(payload: dict[str, Any]) -> None:
    folder_id = str(payload.get("folder_id") or "").strip()
    target_bucket = str(payload.get("target_bucket") or "").strip()
    if not folder_id:
        raise ValueError("drive_move_folder: missing folder_id")
    if target_bucket not in VALID_DRIVE_BUCKETS:
        raise ValueError("drive_move_folder: invalid target_bucket")
    await anyio.to_thread.run_sync(move_candidate_folder, folder_id, target_bucket)


async def _execute_drive_delete_item(payload: dict[str, Any]) -> None:
    item_id = str(payload.get("item_id") or "").strip()
    if not item_id:
        raise ValueError("drive_delete_item: missing item_id")
    ok = await anyio.to_thread.run_sync(delete_drive_item, item_id)
    if not ok:
        raise RuntimeError("drive_delete_item returned false")


async def _apply_calendar_result_to_interview(
    session: AsyncSession,
    *,
    interview_id: int | None,
    event_id: str | None,
    meeting_link: str | None,
    clear_event_id: bool = False,
) -> None:
    if interview_id is None:
        return
    interview = await session.get(RecCandidateInterview, interview_id)
    if not interview:
        return
    if clear_event_id:
        interview.calendar_event_id = None
    elif event_id:
        interview.calendar_event_id = event_id
    if meeting_link:
        interview.meeting_link = meeting_link
    interview.updated_at = datetime.utcnow()


async def _execute_calendar_create_event(session: AsyncSession, payload: dict[str, Any]) -> None:
    interview_id = _parse_int(payload.get("interview_id"))
    interview = await session.get(RecCandidateInterview, interview_id) if interview_id is not None else None

    start_at = interview.scheduled_start_at if interview and interview.scheduled_start_at else _parse_datetime_utc(payload.get("start_at"))
    end_at = interview.scheduled_end_at if interview and interview.scheduled_end_at else _parse_datetime_utc(payload.get("end_at"))
    summary = str(payload.get("summary") or "").strip()
    description = str(payload.get("description") or "").strip()
    attendees = payload.get("attendees") or []
    if not isinstance(attendees, list):
        attendees = []
    attendees_clean = [str(item).strip() for item in attendees if str(item).strip()]
    calendar_id = str(payload.get("calendar_id") or "").strip() or None
    subject_email = str(payload.get("subject_email") or "").strip() or None

    # If a calendar event is already linked, update it to the latest schedule instead of creating a duplicate.
    if interview and interview.calendar_event_id:
        response = await anyio.to_thread.run_sync(
            lambda: update_calendar_event(
                event_id=interview.calendar_event_id,
                summary=summary,
                description=description,
                start_at=start_at,
                end_at=end_at,
                attendees=attendees_clean,
                calendar_id=calendar_id,
                subject_email=subject_email,
            )
        )
        await _apply_calendar_result_to_interview(
            session,
            interview_id=interview_id,
            event_id=interview.calendar_event_id,
            meeting_link=response.get("meeting_link") if isinstance(response, dict) else None,
        )
        return

    response = await anyio.to_thread.run_sync(
        lambda: create_calendar_event(
            summary=summary,
            description=description,
            start_at=start_at,
            end_at=end_at,
            attendees=attendees_clean,
            calendar_id=calendar_id,
            subject_email=subject_email,
        )
    )
    await _apply_calendar_result_to_interview(
        session,
        interview_id=interview_id,
        event_id=response.get("event_id") if isinstance(response, dict) else None,
        meeting_link=response.get("meeting_link") if isinstance(response, dict) else None,
    )


async def _execute_calendar_update_event(session: AsyncSession, payload: dict[str, Any]) -> None:
    event_id = str(payload.get("event_id") or "").strip()
    interview_id = _parse_int(payload.get("interview_id"))
    interview = await session.get(RecCandidateInterview, interview_id) if interview_id is not None else None
    if not event_id and interview and interview.calendar_event_id:
        event_id = interview.calendar_event_id
    if not event_id:
        raise ValueError("calendar_update_event: missing event_id")

    start_at = interview.scheduled_start_at if interview and interview.scheduled_start_at else _parse_datetime_utc(payload.get("start_at"))
    end_at = interview.scheduled_end_at if interview and interview.scheduled_end_at else _parse_datetime_utc(payload.get("end_at"))
    summary = str(payload.get("summary") or "").strip()
    description = str(payload.get("description") or "").strip()
    attendees = payload.get("attendees") or []
    if not isinstance(attendees, list):
        attendees = []
    attendees_clean = [str(item).strip() for item in attendees if str(item).strip()]
    calendar_id = str(payload.get("calendar_id") or "").strip() or None
    subject_email = str(payload.get("subject_email") or "").strip() or None

    response = await anyio.to_thread.run_sync(
        lambda: update_calendar_event(
            event_id=event_id,
            summary=summary,
            description=description,
            start_at=start_at,
            end_at=end_at,
            attendees=attendees_clean,
            calendar_id=calendar_id,
            subject_email=subject_email,
        )
    )
    await _apply_calendar_result_to_interview(
        session,
        interview_id=interview_id,
        event_id=event_id,
        meeting_link=response.get("meeting_link") if isinstance(response, dict) else None,
    )


async def _execute_calendar_delete_event(session: AsyncSession, payload: dict[str, Any]) -> None:
    event_id = str(payload.get("event_id") or "").strip()
    if not event_id:
        raise ValueError("calendar_delete_event: missing event_id")
    calendar_id = str(payload.get("calendar_id") or "").strip() or None
    subject_email = str(payload.get("subject_email") or "").strip() or None
    interview_id = _parse_int(payload.get("interview_id"))

    await anyio.to_thread.run_sync(
        lambda: delete_calendar_event(
            event_id=event_id,
            calendar_id=calendar_id,
            subject_email=subject_email,
        )
    )
    await _apply_calendar_result_to_interview(
        session,
        interview_id=interview_id,
        event_id=None,
        meeting_link=None,
        clear_event_id=True,
    )


async def execute_operation(session: AsyncSession, operation: RecOperationRetry) -> None:
    payload = _json_loads(operation.payload_json)
    op_type = (operation.operation_type or "").strip().lower()

    if op_type == OP_DRIVE_MOVE_FOLDER:
        await _execute_drive_move_folder(payload)
        return
    if op_type == OP_DRIVE_DELETE_ITEM:
        await _execute_drive_delete_item(payload)
        return
    if op_type == OP_CALENDAR_CREATE_EVENT:
        await _execute_calendar_create_event(session, payload)
        return
    if op_type == OP_CALENDAR_UPDATE_EVENT:
        await _execute_calendar_update_event(session, payload)
        return
    if op_type == OP_CALENDAR_DELETE_EVENT:
        await _execute_calendar_delete_event(session, payload)
        return

    raise ValueError(f"Unsupported operation_type: {op_type}")


async def process_due_operations(session: AsyncSession, *, limit: int = 50) -> dict[str, int]:
    now = datetime.utcnow()
    rows = (
        await session.execute(
            select(RecOperationRetry)
            .where(
                RecOperationRetry.status.in_([STATUS_PENDING, STATUS_FAILED]),
                RecOperationRetry.next_retry_at <= now,
                RecOperationRetry.attempts < RecOperationRetry.max_attempts,
            )
            .order_by(RecOperationRetry.next_retry_at.asc(), RecOperationRetry.operation_retry_id.asc())
            .limit(limit)
        )
    ).scalars().all()

    summary = {"picked": 0, "succeeded": 0, "failed": 0, "dead": 0}
    summary["picked"] = len(rows)

    for operation in rows:
        operation.status = STATUS_PROCESSING
        operation.updated_at = datetime.utcnow()
        await session.flush()

        try:
            await execute_operation(session, operation)
            operation.attempts += 1
            operation.status = STATUS_SUCCEEDED
            operation.last_error = None
            operation.completed_at = datetime.utcnow()
            operation.updated_at = operation.completed_at
            if operation.candidate_id is not None:
                await log_event(
                    session,
                    candidate_id=operation.candidate_id,
                    action_type="operation_retry_succeeded",
                    related_entity_type=operation.related_entity_type or "candidate",
                    related_entity_id=operation.related_entity_id,
                    meta_json={
                        "operation_retry_id": operation.operation_retry_id,
                        "operation_type": operation.operation_type,
                        "attempts": operation.attempts,
                    },
                )
            summary["succeeded"] += 1
        except Exception as exc:  # noqa: BLE001
            operation.attempts += 1
            operation.last_error = str(exc)[:2000]
            operation.updated_at = datetime.utcnow()
            if operation.attempts >= operation.max_attempts:
                operation.status = STATUS_DEAD
                operation.completed_at = operation.updated_at
                summary["dead"] += 1
            else:
                operation.status = STATUS_FAILED
                delay_seconds = retry_delay_seconds(operation.attempts)
                operation.next_retry_at = operation.updated_at + timedelta(seconds=delay_seconds)
                summary["failed"] += 1

            if operation.candidate_id is not None:
                await log_event(
                    session,
                    candidate_id=operation.candidate_id,
                    action_type="operation_retry_failed",
                    related_entity_type=operation.related_entity_type or "candidate",
                    related_entity_id=operation.related_entity_id,
                    meta_json={
                        "operation_retry_id": operation.operation_retry_id,
                        "operation_type": operation.operation_type,
                        "attempts": operation.attempts,
                        "max_attempts": operation.max_attempts,
                        "status": operation.status,
                        "error": operation.last_error,
                        "next_retry_at": operation.next_retry_at.isoformat() if operation.next_retry_at else None,
                    },
                )

        await session.commit()

    return summary
