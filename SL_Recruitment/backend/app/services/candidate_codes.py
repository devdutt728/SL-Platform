import re

from sqlalchemy import select
from sqlalchemy.exc import OperationalError, ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime_utils import now_ist_naive
from app.models.candidate import RecCandidate
from app.models.candidate_code_registry import RecCandidateCodeCounter, RecCandidateCodeRegistry

_CANDIDATE_CODE_PATTERN = re.compile(r"^SLR-(\d{4,})$", re.IGNORECASE)
_COUNTER_KEY = "default"
_STATE_RESERVED = "reserved"
_STATE_ASSIGNED = "assigned"
_STATE_RELEASED = "released"


def format_candidate_code(sequence_no: int) -> str:
    return f"SLR-{int(sequence_no):04d}"


def parse_candidate_code(candidate_code: str | None) -> int | None:
    raw = str(candidate_code or "").strip().upper()
    match = _CANDIDATE_CODE_PATTERN.fullmatch(raw)
    if not match:
        return None
    value = int(match.group(1))
    return value if value > 0 else None


def _is_allocator_schema_error(exc: Exception) -> bool:
    text = str(exc).lower()
    return "rec_candidate_code_counter" in text or "rec_candidate_code_registry" in text


async def _reserve_candidate_code(session: AsyncSession) -> RecCandidateCodeRegistry:
    now = now_ist_naive()
    released = (
        await session.execute(
            select(RecCandidateCodeRegistry)
            .where(RecCandidateCodeRegistry.state == _STATE_RELEASED)
            .order_by(RecCandidateCodeRegistry.sequence_no.asc())
            .limit(1)
            .with_for_update()
        )
    ).scalars().first()
    if released is not None:
        released.state = _STATE_RESERVED
        released.candidate_id = None
        released.reserved_at = now
        released.assigned_at = None
        released.released_at = None
        released.updated_at = now
        await session.flush()
        return released

    counter = (
        await session.execute(
            select(RecCandidateCodeCounter)
            .where(RecCandidateCodeCounter.counter_key == _COUNTER_KEY)
            .limit(1)
            .with_for_update()
        )
    ).scalars().first()
    if counter is None:
        counter = RecCandidateCodeCounter(
            counter_key=_COUNTER_KEY,
            next_sequence=1,
            created_at=now,
            updated_at=now,
        )
        session.add(counter)
        await session.flush()

    sequence_no = max(int(counter.next_sequence or 1), 1)
    allocation = RecCandidateCodeRegistry(
        sequence_no=sequence_no,
        candidate_code=format_candidate_code(sequence_no),
        candidate_id=None,
        state=_STATE_RESERVED,
        reserved_at=now,
        assigned_at=None,
        released_at=None,
        created_at=now,
        updated_at=now,
    )
    session.add(allocation)
    counter.next_sequence = sequence_no + 1
    counter.updated_at = now
    await session.flush()
    return allocation


async def ensure_candidate_code_registered(session: AsyncSession, candidate: RecCandidate) -> str:
    code = str(candidate.candidate_code or "").strip().upper()
    if not code:
        raise ValueError("Candidate code is required.")

    sequence_no = parse_candidate_code(code)
    if sequence_no is None:
        return code

    try:
        now = now_ist_naive()
        allocation = (
            await session.execute(
                select(RecCandidateCodeRegistry)
                .where(RecCandidateCodeRegistry.candidate_code == code)
                .limit(1)
                .with_for_update()
            )
        ).scalars().first()
        if allocation is None:
            allocation = RecCandidateCodeRegistry(
                sequence_no=sequence_no,
                candidate_code=code,
                candidate_id=candidate.candidate_id,
                state=_STATE_ASSIGNED,
                assigned_at=now,
                released_at=None,
                reserved_at=None,
                created_at=now,
                updated_at=now,
            )
            session.add(allocation)
        else:
            allocation.sequence_no = sequence_no
            allocation.candidate_id = candidate.candidate_id
            allocation.state = _STATE_ASSIGNED
            allocation.assigned_at = allocation.assigned_at or now
            allocation.released_at = None
            allocation.reserved_at = None
            allocation.updated_at = now

        counter = (
            await session.execute(
                select(RecCandidateCodeCounter)
                .where(RecCandidateCodeCounter.counter_key == _COUNTER_KEY)
                .limit(1)
                .with_for_update()
            )
        ).scalars().first()
        if counter is None:
            counter = RecCandidateCodeCounter(
                counter_key=_COUNTER_KEY,
                next_sequence=sequence_no + 1,
                created_at=now,
                updated_at=now,
            )
            session.add(counter)
        elif int(counter.next_sequence or 1) <= sequence_no:
            counter.next_sequence = sequence_no + 1
            counter.updated_at = now

        await session.flush()
    except (OperationalError, ProgrammingError) as exc:
        if not _is_allocator_schema_error(exc):
            raise
    return code


async def assign_candidate_code(
    session: AsyncSession,
    candidate: RecCandidate,
    *,
    legacy_code_factory=None,
) -> str:
    try:
        allocation = await _reserve_candidate_code(session)
        candidate.candidate_code = allocation.candidate_code
        session.add(candidate)
        await session.flush()
        now = now_ist_naive()
        allocation.candidate_id = candidate.candidate_id
        allocation.state = _STATE_ASSIGNED
        allocation.reserved_at = None
        allocation.assigned_at = now
        allocation.released_at = None
        allocation.updated_at = now
        await session.flush()
        return candidate.candidate_code
    except (OperationalError, ProgrammingError) as exc:
        if legacy_code_factory is None or not _is_allocator_schema_error(exc):
            raise
        session.add(candidate)
        await session.flush()
        candidate.candidate_code = legacy_code_factory(candidate.candidate_id)
        await session.flush()
        return candidate.candidate_code


async def release_candidate_code(
    session: AsyncSession,
    *,
    candidate_code: str | None,
    candidate_id: int | None,
) -> None:
    code = str(candidate_code or "").strip().upper()
    if not code:
        return
    sequence_no = parse_candidate_code(code)
    if sequence_no is None:
        return

    try:
        now = now_ist_naive()
        allocation = (
            await session.execute(
                select(RecCandidateCodeRegistry)
                .where(RecCandidateCodeRegistry.candidate_code == code)
                .limit(1)
                .with_for_update()
            )
        ).scalars().first()
        if allocation is None:
            allocation = RecCandidateCodeRegistry(
                sequence_no=sequence_no,
                candidate_code=code,
                candidate_id=None,
                state=_STATE_RELEASED,
                reserved_at=None,
                assigned_at=None,
                released_at=now,
                created_at=now,
                updated_at=now,
            )
            session.add(allocation)
        else:
            if candidate_id is None or allocation.candidate_id in {None, candidate_id}:
                allocation.candidate_id = None
            allocation.state = _STATE_RELEASED
            allocation.reserved_at = None
            allocation.assigned_at = None
            allocation.released_at = now
            allocation.updated_at = now

        counter = (
            await session.execute(
                select(RecCandidateCodeCounter)
                .where(RecCandidateCodeCounter.counter_key == _COUNTER_KEY)
                .limit(1)
                .with_for_update()
            )
        ).scalars().first()
        if counter is None:
            counter = RecCandidateCodeCounter(
                counter_key=_COUNTER_KEY,
                next_sequence=sequence_no + 1,
                created_at=now,
                updated_at=now,
            )
            session.add(counter)
        elif int(counter.next_sequence or 1) <= sequence_no:
            counter.next_sequence = sequence_no + 1
            counter.updated_at = now

        await session.flush()
    except (OperationalError, ProgrammingError) as exc:
        if not _is_allocator_schema_error(exc):
            raise
