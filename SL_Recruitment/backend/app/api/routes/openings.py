import json
from datetime import datetime

import anyio
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import case, delete, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import DataError, OperationalError, SQLAlchemyError
from sqlalchemy.exc import IntegrityError

from app.api import deps
from app.core.auth import require_roles, require_superadmin
from app.core.roles import Role
from app.models.opening import RecOpening
from app.schemas.opening import OpeningCreate, OpeningDetail, OpeningListItem, OpeningUpdate
from app.schemas.user import UserContext
from app.schemas.opening_detail import OpeningDetailOut
from app.schemas.opening_request import (
    OpeningRequestApprove,
    OpeningRequestCreate,
    OpeningRequestOut,
    OpeningRequestReject,
    OpeningRequestStatusUpdate,
)
from app.db.platform_session import PlatformSessionLocal
from app.models.platform_person import DimPerson
from app.models.platform_role import DimRole
from app.models.candidate import RecCandidate
from app.models.event import RecCandidateEvent
from app.models.screening import RecCandidateScreening
from app.models.stage import RecCandidateStage
from app.models.opening_event import RecOpeningEvent
from uuid import uuid4
from app.models.opening_request import RecOpeningRequest
from app.services.drive import delete_drive_item
from app.services.operation_queue import OP_DRIVE_DELETE_ITEM, enqueue_operation
from app.services.platform_identity import active_status_filter

router = APIRouter(prefix="/rec/openings", tags=["openings"])
logger = logging.getLogger("slr.openings")

_FIXED_OPENING_CODES_BY_TITLE: dict[str, str] = {
    "others": "OTHR-8299BF",
    "intern": "INTR-8299B8",
    "communications intern": "CMIN-8299B0",
    "interior designer": "INDS-8299A4",
    "architect": "ARCH-82999A",
    "sr designer": "SRDS-829990",
    "sr architect": "SRAR-829986",
    "project designer": "PRDS-82997A",
    "associate": "ASSO-82996A",
    "group leader": "GRPL-829955",
}


def _platform_person_id(user: UserContext) -> str | None:
    raw = (user.person_id_platform or "").strip()
    return raw or None


def _clean_platform_person_id(raw: str | None) -> str | None:
    if raw is None:
        return None
    val = raw.strip()
    return val or None


def _normalize_title_key(raw: str | None) -> str:
    if not raw:
        return ""
    compact = " ".join(raw.strip().lower().split())
    return compact.replace(".", "")


def _generate_opening_code(title: str) -> str:
    fixed = _FIXED_OPENING_CODES_BY_TITLE.get(_normalize_title_key(title))
    if fixed:
        return fixed
    base = (title or "OPEN").strip().upper()
    letters = "".join(ch for ch in base if ch.isalpha())[:4] or "OPEN"
    unique = uuid4().hex[:4].upper()
    return f"{letters}-{unique}"


def _normalize_role_token(value: object) -> str:
    token = str(value or "").strip().lower()
    if not token:
        return ""
    return token.replace("-", "_").replace(" ", "_")


def _is_hr_actor(user: UserContext) -> bool:
    roles = set(user.roles or [])
    has_platform_role_meta = bool(
        (user.platform_role_id is not None)
        or (user.platform_role_code or "").strip()
        or (user.platform_role_name or "").strip()
        or (user.platform_role_ids or [])
        or (user.platform_role_codes or [])
        or (user.platform_role_names or [])
    )
    # In dev-mode (no platform metadata), rely on mapped app roles.
    if not has_platform_role_meta and (Role.HR_ADMIN in roles or Role.HR_EXEC in roles):
        return True

    role_tokens = set()
    for value in (user.platform_role_codes or []):
        normalized = _normalize_role_token(value)
        if normalized:
            role_tokens.add(normalized)
    for value in (user.platform_role_names or []):
        normalized = _normalize_role_token(value)
        if normalized:
            role_tokens.add(normalized)
    for value in [user.platform_role_code, user.platform_role_name]:
        normalized = _normalize_role_token(value)
        if normalized:
            role_tokens.add(normalized)

    for token in role_tokens:
        compact = token.replace("_", "")
        if token == "hr" or token.startswith("hr_") or token.startswith("hr"):
            return True
        if "humanresource" in compact:
            return True
    return False


def _is_superadmin_actor(user: UserContext) -> bool:
    if (user.platform_role_id or None) == 2:
        return True
    if user.platform_role_ids and 2 in user.platform_role_ids:
        return True

    role_tokens = set()
    for value in (user.platform_role_codes or []):
        normalized = _normalize_role_token(value)
        if normalized:
            role_tokens.add(normalized)
    for value in (user.platform_role_names or []):
        normalized = _normalize_role_token(value)
        if normalized:
            role_tokens.add(normalized)
    for value in [user.platform_role_code, user.platform_role_name]:
        normalized = _normalize_role_token(value)
        if normalized:
            role_tokens.add(normalized)

    return bool({"2", "superadmin", "super_admin", "s_admin"} & role_tokens)


def _actor_role_ids(user: UserContext) -> set[int]:
    values: list[object] = []
    if user.platform_role_id is not None:
        values.append(user.platform_role_id)
    values.extend(user.platform_role_ids or [])
    role_ids: set[int] = set()
    for value in values:
        raw = str(value or "").strip()
        if not raw:
            continue
        try:
            role_ids.add(int(raw))
        except (TypeError, ValueError):
            continue
    return role_ids


def _is_role_5_or_6_actor(user: UserContext) -> bool:
    role_ids = _actor_role_ids(user)
    return 5 in role_ids or 6 in role_ids


def _can_view_openings(user: UserContext) -> bool:
    if _is_superadmin_actor(user) or _is_hr_actor(user) or _is_role_5_or_6_actor(user):
        return True
    roles = set(user.roles or [])
    return bool({Role.HIRING_MANAGER, Role.INTERVIEWER, Role.GROUP_LEAD, Role.VIEWER} & roles)


def _actor_role_label(user: UserContext) -> str:
    if _is_superadmin_actor(user):
        return "superadmin"
    if _is_hr_actor(user):
        return "hr"
    if _is_role_5_or_6_actor(user):
        return "group_lead"
    roles = set(user.roles or [])
    if Role.GROUP_LEAD in roles:
        return "group_lead"
    if Role.HIRING_MANAGER in roles:
        return "hiring_manager"
    if Role.INTERVIEWER in roles:
        return "interviewer"
    if Role.VIEWER in roles:
        return "viewer"
    return "unknown"


def _can_raise_opening_request(user: UserContext) -> bool:
    return _is_superadmin_actor(user) or _is_hr_actor(user) or _is_role_5_or_6_actor(user)


def _can_approve_opening_request(user: UserContext) -> bool:
    return _is_superadmin_actor(user) or _is_hr_actor(user)


def _request_source_portal(user: UserContext, payload_source: str | None) -> str:
    source = str(payload_source or "").strip()
    if source:
        return source[:64]
    role = _actor_role_label(user)
    if role == "group_lead":
        return "gl_portal"
    if role in {"hr", "superadmin"}:
        return "hr_portal"
    return "recruitment_portal"


def _clean_text(raw: str | None) -> str | None:
    if raw is None:
        return None
    value = raw.strip()
    return value or None


def _opening_request_schema_error_detail(exc: OperationalError) -> str:
    message = str(getattr(exc, "orig", exc)).lower()
    if "rec_opening_request" in message:
        if "doesn't exist" in message or "does not exist" in message or "no such table" in message:
            return (
                "Opening request table is missing. Apply migrations "
                "`backend/migrations/0033_opening_requests_workflow.sql` and "
                "`backend/migrations/0034_opening_request_details_columns.sql`."
            )
        if "unknown column" in message or "no such column" in message:
            if any(token in message for token in ("hiring_manager_email", "gl_details", "l2_details")):
                return (
                    "Opening request detail columns are missing. Apply migration "
                    "`backend/migrations/0034_opening_request_details_columns.sql`."
                )
            return (
                "Opening request schema is outdated. Apply migrations "
                "`backend/migrations/0033_opening_requests_workflow.sql` and "
                "`backend/migrations/0034_opening_request_details_columns.sql`."
            )
    return f"Opening request operation failed: {getattr(exc, 'orig', exc)}"


async def _log_opening_event(
    session: AsyncSession,
    *,
    opening_id: int | None,
    opening_request_id: int | None,
    action_type: str,
    actor_person_id_platform: str | None,
    actor_role: str | None,
    meta: dict | None = None,
) -> None:
    entry = RecOpeningEvent(
        opening_id=opening_id,
        opening_request_id=opening_request_id,
        action_type=action_type,
        actor_person_id_platform=_clean_platform_person_id(actor_person_id_platform),
        actor_role=_clean_text(actor_role),
        meta_json=json.dumps(meta, separators=(",", ":")) if meta else None,
        created_at=datetime.utcnow(),
    )
    session.add(entry)


def _opening_to_list_item(
    opening: RecOpening,
    person_lookup: dict[str, dict[str, str | None]] | None = None,
) -> OpeningListItem:
    person_lookup = person_lookup or {}
    hiring_manager_id = _clean_platform_person_id(opening.reporting_person_id_platform)
    actor_meta = person_lookup.get(hiring_manager_id or "", {})
    return OpeningListItem(
        opening_id=opening.opening_id,
        opening_code=opening.opening_code,
        title=opening.title,
        location_city=opening.location_city,
        is_active=bool(opening.is_active) if opening.is_active is not None else None,
        requested_by_person_id_platform=hiring_manager_id,
        hiring_manager_person_id_platform=hiring_manager_id,
        requested_by_name=actor_meta.get("name"),
        hiring_manager_name=actor_meta.get("name"),
        requested_by_role_name=actor_meta.get("role_name"),
        requested_by_role_code=actor_meta.get("role_code"),
        requested_by_person_code=actor_meta.get("person_code"),
        requested_by_email=actor_meta.get("email"),
        requested_by_phone=actor_meta.get("phone"),
        headcount_required=opening.headcount_required,
        headcount_filled=opening.headcount_filled,
    )


async def _build_person_lookup(
    requested_ids: set[str],
    *,
    include_inactive: bool,
) -> dict[str, dict[str, str | None]]:
    requested_ids = {rid for rid in requested_ids if rid}
    person_lookup: dict[str, dict[str, str | None]] = {}
    if not requested_ids:
        return person_lookup
    async with PlatformSessionLocal() as platform_session:
        person_filters = [DimPerson.person_id.in_(list(requested_ids))]
        if not include_inactive:
            person_filters.append(active_status_filter())
        person_rows = (
            await platform_session.execute(
                select(
                    DimPerson.person_id,
                    DimPerson.display_name,
                    DimPerson.full_name,
                    DimPerson.first_name,
                    DimPerson.last_name,
                    DimPerson.email,
                    DimPerson.person_code,
                    DimPerson.mobile_number,
                    DimPerson.role_id,
                ).where(*person_filters)
            )
        ).all()
        role_ids = {pr.role_id for pr in person_rows if pr.role_id}
        roles: dict[int, tuple[str | None, str | None]] = {}
        if role_ids:
            role_rows = (
                await platform_session.execute(
                    select(DimRole.role_id, DimRole.role_name, DimRole.role_code).where(DimRole.role_id.in_(list(role_ids)))
                )
            ).all()
            roles = {rr.role_id: (rr.role_name, rr.role_code) for rr in role_rows}

        for pr in person_rows:
            full_name = (pr.display_name or pr.full_name or f"{(pr.first_name or '').strip()} {(pr.last_name or '').strip()}").strip()
            role_name, role_code = roles.get(pr.role_id, (None, None))
            clean_id = _clean_platform_person_id(pr.person_id) or pr.person_id
            person_lookup[clean_id] = {
                "name": full_name or pr.email or pr.person_id,
                "person_code": pr.person_code,
                "email": pr.email,
                "phone": pr.mobile_number,
                "role_name": role_name,
                "role_code": role_code,
            }
    return person_lookup


def _opening_request_to_out(row: RecOpeningRequest) -> OpeningRequestOut:
    return OpeningRequestOut(
        opening_request_id=row.opening_request_id,
        opening_id=row.opening_id,
        opening_code=row.opening_code,
        opening_title=row.opening_title,
        opening_description=row.opening_description,
        location_city=row.location_city,
        location_country=row.location_country,
        hiring_manager_person_id_platform=_clean_platform_person_id(row.hiring_manager_person_id_platform),
        hiring_manager_email=_clean_text(row.hiring_manager_email),
        gl_details=_clean_text(row.gl_details),
        l2_details=_clean_text(row.l2_details),
        request_type=row.request_type,
        headcount_delta=row.headcount_delta,
        request_reason=row.request_reason,
        requested_by_person_id_platform=_clean_platform_person_id(row.requested_by_person_id_platform),
        requested_by_role=row.requested_by_role,
        source_portal=row.source_portal,
        status=row.status,
        approved_by_person_id_platform=_clean_platform_person_id(row.approved_by_person_id_platform),
        approved_at=row.approved_at,
        rejected_reason=row.rejected_reason,
        applied_at=row.applied_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


async def _resolve_opening_for_request(
    session: AsyncSession,
    *,
    opening_code: str | None,
    title: str | None,
) -> RecOpening | None:
    cleaned_code = _clean_text(opening_code)
    if cleaned_code:
        return (
            await session.execute(
                select(RecOpening)
                .where(RecOpening.opening_code == cleaned_code)
                .order_by(RecOpening.opening_id.desc())
                .limit(1)
            )
        ).scalars().first()

    cleaned_title = _clean_text(title)
    if not cleaned_title:
        return None

    derived_code = _generate_opening_code(cleaned_title)
    by_code = (
        await session.execute(
            select(RecOpening)
            .where(RecOpening.opening_code == derived_code)
            .order_by(RecOpening.opening_id.desc())
            .limit(1)
        )
    ).scalars().first()
    if by_code:
        return by_code

    return (
        await session.execute(
            select(RecOpening)
            .where(func.lower(func.trim(RecOpening.title)) == cleaned_title.lower())
            .order_by(RecOpening.opening_id.desc())
            .limit(1)
        )
    ).scalars().first()


async def _apply_opening_request(
    session: AsyncSession,
    *,
    request_row: RecOpeningRequest,
    approver_person_id_platform: str | None,
    approver_role: str,
    approval_note: str | None = None,
) -> RecOpening:
    now = datetime.utcnow()
    if request_row.status == "applied":
        opening = await session.get(RecOpening, request_row.opening_id) if request_row.opening_id else None
        if opening:
            return opening
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Request already applied.")
    if request_row.status == "rejected":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Rejected request cannot be applied.")

    opening: RecOpening | None = None
    if request_row.opening_id:
        opening = await session.get(RecOpening, request_row.opening_id, with_for_update=True)
    if not opening and request_row.opening_code:
        opening = (
            await session.execute(
                select(RecOpening)
                .where(RecOpening.opening_code == request_row.opening_code)
                .order_by(RecOpening.opening_id.desc())
                .with_for_update()
                .limit(1)
            )
        ).scalars().first()

    delta = max(0, int(request_row.headcount_delta or 0))
    is_new_opening = opening is None

    if opening is None:
        title = _clean_text(request_row.opening_title)
        if not title:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Opening title is required to create a new opening.")
        opening_code = _clean_text(request_row.opening_code) or _generate_opening_code(title)
        opening = RecOpening(
            opening_code=opening_code,
            title=title,
            description=_clean_text(request_row.opening_description),
            location_city=_clean_text(request_row.location_city) or "Delhi",
            location_country=_clean_text(request_row.location_country) or "India",
            reporting_person_id_platform=_clean_platform_person_id(request_row.hiring_manager_person_id_platform),
            headcount_required=max(delta, 1),
            headcount_filled=0,
            is_active=1,
            created_at=now,
            updated_at=now,
        )
        session.add(opening)
        await session.flush()
    else:
        headcount_before = int(opening.headcount_required or 0)
        is_live_before = bool(opening.is_active)

        if request_row.request_type != "change_hiring_manager" and delta > 0:
            if is_live_before:
                opening.headcount_required = headcount_before + delta
            else:
                opening.headcount_required = max(headcount_before, delta)

        if not is_live_before:
            opening.is_active = 1
        if _clean_platform_person_id(request_row.hiring_manager_person_id_platform):
            opening.reporting_person_id_platform = _clean_platform_person_id(request_row.hiring_manager_person_id_platform)
        opening.updated_at = now

    request_row.opening_id = opening.opening_id
    request_row.opening_code = opening.opening_code
    request_row.opening_title = opening.title
    request_row.opening_description = opening.description
    request_row.location_city = opening.location_city
    request_row.location_country = opening.location_country
    request_row.hiring_manager_person_id_platform = _clean_platform_person_id(opening.reporting_person_id_platform)
    request_row.approved_by_person_id_platform = _clean_platform_person_id(approver_person_id_platform)
    request_row.approved_at = now
    request_row.applied_at = now
    request_row.status = "applied"
    request_row.rejected_reason = None
    if approval_note:
        merged = request_row.request_reason or ""
        if merged:
            merged = f"{merged}\nApproval note: {approval_note.strip()}"
        else:
            merged = f"Approval note: {approval_note.strip()}"
        request_row.request_reason = merged
    request_row.updated_at = now

    event_action = "opening_created_from_request" if is_new_opening else "opening_request_applied"
    await _log_opening_event(
        session,
        opening_id=opening.opening_id,
        opening_request_id=request_row.opening_request_id,
        action_type=event_action,
        actor_person_id_platform=approver_person_id_platform,
        actor_role=approver_role,
        meta={
            "request_type": request_row.request_type,
            "headcount_delta": delta,
            "request_status": request_row.status,
            "opening_live": bool(opening.is_active),
        },
    )
    return opening


@router.get("", response_model=list[OpeningListItem])
async def list_openings(
    is_active: bool | None = Query(default=None),
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(deps.get_user),
):
    if not _can_view_openings(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    # MySQL doesn't support NULLS LAST; emulate by ordering NULLs first flag, then desc.
    query = select(RecOpening).order_by(RecOpening.updated_at.is_(None), RecOpening.updated_at.desc(), RecOpening.opening_id.desc())
    if is_active is not None:
        query = query.where(RecOpening.is_active == (1 if is_active else 0))
    roles = set(user.roles or [])
    is_hr = _is_hr_actor(user)
    is_superadmin = _is_superadmin_actor(user)
    # Keep interviewer/GL restricted to their own openings in app-role mode;
    # platform role IDs 5/6 should see standard openings for existing-opening requests.
    is_restricted_view = (Role.INTERVIEWER in roles or Role.GROUP_LEAD in roles) and not _is_role_5_or_6_actor(user)
    scoped_to_requester = False
    if is_restricted_view and not is_hr and not is_superadmin:
        requested_by = _clean_platform_person_id(user.person_id_platform)
        if not requested_by:
            logger.info(
                "openings_list_empty_no_requester person_id=%s roles=%s platform_role_id=%s",
                user.person_id_platform,
                [r.value for r in (user.roles or [])],
                user.platform_role_id,
            )
            return []
        query = query.where(RecOpening.reporting_person_id_platform == requested_by)
        scoped_to_requester = True
    rows = (await session.execute(query)).scalars().all()
    logger.info(
        "openings_list_result count=%s scoped=%s person_id=%s roles=%s platform_role_id=%s",
        len(rows),
        scoped_to_requester,
        user.person_id_platform,
        [r.value for r in (user.roles or [])],
        user.platform_role_id,
    )

    requested_ids = {_clean_platform_person_id(r.reporting_person_id_platform) or "" for r in rows}
    try:
        person_lookup = await _build_person_lookup(
            requested_ids,
            include_inactive=(user.platform_role_id or None) == 2,
        )
    except Exception:
        person_lookup = {}
    return [_opening_to_list_item(o, person_lookup) for o in rows]


@router.get("/by-code/{opening_code}", response_model=OpeningDetailOut)
async def get_opening_by_code(
    opening_code: str,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(deps.get_user),
):
    if not _can_view_openings(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    opening = (
        await session.execute(select(RecOpening).where(RecOpening.opening_code == opening_code).limit(1))
    ).scalars().first()
    if not opening:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Opening not found")
    roles = set(user.roles or [])
    is_hr = _is_hr_actor(user)
    is_superadmin = _is_superadmin_actor(user)
    is_restricted_view = (Role.INTERVIEWER in roles or Role.GROUP_LEAD in roles) and not _is_role_5_or_6_actor(user)
    if is_restricted_view and not is_hr and not is_superadmin:
        requested_by = _clean_platform_person_id(user.person_id_platform)
        if not requested_by or requested_by != _clean_platform_person_id(opening.reporting_person_id_platform):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access restricted")
    return OpeningDetailOut(
        opening_id=opening.opening_id,
        opening_code=opening.opening_code,
        title=opening.title,
        description=opening.description,
        location_city=opening.location_city,
        location_country=opening.location_country,
        is_active=bool(opening.is_active) if opening.is_active is not None else None,
        requested_by_person_id_platform=_clean_platform_person_id(opening.reporting_person_id_platform),
        hiring_manager_person_id_platform=_clean_platform_person_id(opening.reporting_person_id_platform),
        headcount_required=opening.headcount_required,
        headcount_filled=opening.headcount_filled,
        created_at=opening.created_at,
        updated_at=opening.updated_at,
    )


@router.post("", response_model=OpeningListItem, status_code=status.HTTP_201_CREATED)
async def create_opening(
    payload: OpeningCreate,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_superadmin()),
):
    now = datetime.utcnow()
    if payload.opening_code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Opening code is auto-generated and cannot be set manually.")
    opening_code = _generate_opening_code(payload.title)
    # Prevent duplicates: if code already exists, return 409 and let caller PATCH instead
    existing = (
        await session.execute(select(RecOpening).where(RecOpening.opening_code == opening_code).limit(1))
    ).scalars().first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Opening code already exists; update it instead.")
    opening = RecOpening(
        opening_code=opening_code,
        title=payload.title,
        description=payload.description,
        location_city=payload.location_city or "Delhi",
        location_country=payload.location_country or "India",
        reporting_person_id_platform=_clean_platform_person_id(payload.hiring_manager_person_id_platform)
        or _clean_platform_person_id(payload.requested_by_person_id_platform),
        headcount_required=payload.headcount_required if payload.headcount_required is not None else 1,
        headcount_filled=0,
        is_active=1 if payload.is_active else 0,
        created_at=now,
        updated_at=now,
    )
    session.add(opening)
    try:
        await session.flush()
        actor_id = _platform_person_id(user)
        direct_request = RecOpeningRequest(
            opening_id=opening.opening_id,
            opening_code=opening.opening_code,
            opening_title=opening.title,
            opening_description=opening.description,
            location_city=opening.location_city,
            location_country=opening.location_country,
            hiring_manager_person_id_platform=_clean_platform_person_id(opening.reporting_person_id_platform),
            request_type="create_opening",
            headcount_delta=max(int(opening.headcount_required or 0), 1),
            request_reason="Direct opening creation by superadmin.",
            requested_by_person_id_platform=actor_id,
            requested_by_role=_actor_role_label(user),
            source_portal="superadmin_direct",
            status="applied",
            approved_by_person_id_platform=actor_id,
            approved_at=now,
            applied_at=now,
            created_at=now,
            updated_at=now,
        )
        session.add(direct_request)
        await session.flush()
        await _log_opening_event(
            session,
            opening_id=opening.opening_id,
            opening_request_id=direct_request.opening_request_id,
            action_type="opening_created_direct",
            actor_person_id_platform=actor_id,
            actor_role=_actor_role_label(user),
            meta={"headcount_required": opening.headcount_required, "is_active": bool(opening.is_active)},
        )
        await session.commit()
    except DataError as exc:
        await session.rollback()
        message = str(getattr(exc, "orig", exc))
        if "reporting_person_id_platform" in message:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="DB schema mismatch: `rec_opening.reporting_person_id_platform` must be VARCHAR(64) to store platform IDs like DK_0498. Apply `backend/migrations/0003_opening_requested_by_string.sql`.",
            )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Opening could not be saved: {message}")
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Opening could not be saved: {exc.orig}")
    except SQLAlchemyError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Opening could not be saved: {exc}")
    await session.refresh(opening)

    requested_by_id = _clean_platform_person_id(opening.reporting_person_id_platform)
    person_lookup: dict[str, dict[str, str | None]] = {}
    if requested_by_id:
        try:
            person_lookup = await _build_person_lookup(
                {requested_by_id},
                include_inactive=(user.platform_role_id or None) == 2,
            )
        except Exception:
            person_lookup = {}
    return _opening_to_list_item(opening, person_lookup)


@router.get("/requests", response_model=list[OpeningRequestOut])
async def list_opening_requests(
    status_filter: str | None = Query(default=None, alias="status"),
    include_seed: bool = Query(default=False, alias="include_seed"),
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(deps.get_user),
):
    if not (_can_raise_opening_request(user) or _can_approve_opening_request(user)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")

    status_rank = case(
        (RecOpeningRequest.status == "pending_hr_approval", 0),
        (RecOpeningRequest.status == "applied", 1),
        (RecOpeningRequest.status == "rejected", 2),
        else_=3,
    )
    query = select(RecOpeningRequest).order_by(
        status_rank.asc(),
        RecOpeningRequest.updated_at.is_(None),
        RecOpeningRequest.updated_at.desc(),
        RecOpeningRequest.opening_request_id.desc(),
    )
    if status_filter:
        query = query.where(RecOpeningRequest.status == status_filter.strip())

    # Hide migration-seeded baseline records from request dashboards by default.
    # These are system backfill rows, not user-raised GL/HR request activity.
    if not include_seed:
        query = query.where(
            or_(
                RecOpeningRequest.source_portal.is_(None),
                RecOpeningRequest.source_portal != "migration_0032_seed",
            )
        ).where(
            or_(
                RecOpeningRequest.requested_by_role.is_(None),
                RecOpeningRequest.requested_by_role != "standard_opening_creation",
            )
        )

    if not _can_approve_opening_request(user):
        requester = _clean_platform_person_id(user.person_id_platform)
        if not requester:
            return []
        query = query.where(RecOpeningRequest.requested_by_person_id_platform == requester)

    try:
        rows = (await session.execute(query)).scalars().all()
    except OperationalError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=_opening_request_schema_error_detail(exc),
        )
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Opening requests could not be loaded: {exc}",
        )
    return [_opening_request_to_out(row) for row in rows]


@router.post("/requests", response_model=OpeningRequestOut, status_code=status.HTTP_201_CREATED)
async def create_opening_request(
    payload: OpeningRequestCreate,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(deps.get_user),
):
    if not _can_raise_opening_request(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")

    now = datetime.utcnow()
    opening = await _resolve_opening_for_request(
        session,
        opening_code=payload.opening_code,
        title=payload.title,
    )
    is_existing_only_actor = _is_role_5_or_6_actor(user) and not _is_hr_actor(user) and not _is_superadmin_actor(user)
    requester_id = _platform_person_id(user)
    actor_role = _actor_role_label(user)

    opening_code = _clean_text(payload.opening_code) or (opening.opening_code if opening else None)
    opening_title = _clean_text(payload.title) or (opening.title if opening else None)
    if is_existing_only_actor:
        if not opening_code:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Role is restricted to existing opening requests only.",
            )
        if opening is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Opening code not found. Select an existing opening code.",
            )
        opening_code = opening.opening_code
        opening_title = opening.title

    if not opening_code and opening_title:
        opening_code = _generate_opening_code(opening_title)
    if opening is None and not opening_title:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Title is required when requesting a brand new opening code.",
        )

    headcount_delta = int(payload.headcount_delta or 0)
    request_type = "create_opening"
    if opening is not None:
        request_type = "increase_headcount"
        if headcount_delta == 0 and _clean_platform_person_id(payload.hiring_manager_person_id_platform):
            request_type = "change_hiring_manager"
    if request_type in {"create_opening", "increase_headcount"} and headcount_delta <= 0:
        headcount_delta = 1

    requested_status = "pending_hr_approval"

    request_row = RecOpeningRequest(
        opening_id=opening.opening_id if opening else None,
        opening_code=opening_code,
        opening_title=opening_title,
        opening_description=_clean_text(payload.description) or (opening.description if opening else None),
        location_city=_clean_text(payload.location_city) or (opening.location_city if opening else "Delhi"),
        location_country=_clean_text(payload.location_country) or (opening.location_country if opening else "India"),
        hiring_manager_person_id_platform=_clean_platform_person_id(payload.hiring_manager_person_id_platform)
        or _clean_platform_person_id(opening.reporting_person_id_platform if opening else None),
        hiring_manager_email=_clean_text(payload.hiring_manager_email),
        gl_details=_clean_text(payload.gl_details),
        l2_details=_clean_text(payload.l2_details),
        request_type=request_type,
        headcount_delta=headcount_delta,
        request_reason=_clean_text(payload.request_reason),
        requested_by_person_id_platform=requester_id,
        requested_by_role=actor_role,
        source_portal=_request_source_portal(user, payload.source_portal),
        status=requested_status,
        created_at=now,
        updated_at=now,
    )
    session.add(request_row)

    try:
        await session.flush()
        await _log_opening_event(
            session,
            opening_id=request_row.opening_id,
            opening_request_id=request_row.opening_request_id,
            action_type="opening_request_raised",
            actor_person_id_platform=requester_id,
            actor_role=actor_role,
            meta={
                "request_type": request_type,
                "status": requested_status,
                "headcount_delta": request_row.headcount_delta,
                "opening_code": request_row.opening_code,
                "hiring_manager_email": request_row.hiring_manager_email,
                "gl_details": request_row.gl_details,
                "l2_details": request_row.l2_details,
            },
        )
        await session.commit()
    except HTTPException:
        await session.rollback()
        raise
    except OperationalError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=_opening_request_schema_error_detail(exc),
        )
    except DataError as exc:
        await session.rollback()
        message = str(getattr(exc, "orig", exc))
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Opening request could not be saved: {message}")
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Opening request could not be saved: {exc.orig}")
    except SQLAlchemyError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Opening request could not be saved: {exc}")

    await session.refresh(request_row)
    return _opening_request_to_out(request_row)


@router.patch("/requests/{opening_request_id}/status", response_model=OpeningRequestOut)
async def update_opening_request_status(
    opening_request_id: int,
    payload: OpeningRequestStatusUpdate,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(deps.get_user),
):
    if not _is_superadmin_actor(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only Superadmin can change request status.")

    request_row = await session.get(RecOpeningRequest, opening_request_id, with_for_update=True)
    if not request_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Opening request not found")

    now = datetime.utcnow()
    approver_id = _platform_person_id(user)
    approver_role = _actor_role_label(user)
    previous_status = request_row.status
    target_status = payload.status

    override_hm = _clean_platform_person_id(payload.hiring_manager_person_id_platform)
    if override_hm:
        request_row.hiring_manager_person_id_platform = override_hm
        request_row.updated_at = now

    try:
        if target_status == "applied":
            await _apply_opening_request(
                session,
                request_row=request_row,
                approver_person_id_platform=approver_id,
                approver_role=approver_role,
                approval_note=_clean_text(payload.approval_note) or "Applied by Superadmin status override.",
            )
        elif target_status == "rejected":
            reason = _clean_text(payload.rejection_reason) or "Rejected by Superadmin."
            request_row.status = "rejected"
            request_row.rejected_reason = reason
            request_row.approved_by_person_id_platform = approver_id
            request_row.approved_at = now
            request_row.applied_at = None
            request_row.updated_at = now
            await _log_opening_event(
                session,
                opening_id=request_row.opening_id,
                opening_request_id=request_row.opening_request_id,
                action_type="opening_request_status_admin_override",
                actor_person_id_platform=approver_id,
                actor_role=approver_role,
                meta={"from_status": previous_status, "to_status": target_status, "reason": reason},
            )
        elif target_status == "pending_hr_approval":
            request_row.status = "pending_hr_approval"
            request_row.rejected_reason = None
            request_row.approved_by_person_id_platform = None
            request_row.approved_at = None
            request_row.applied_at = None
            request_row.updated_at = now
            await _log_opening_event(
                session,
                opening_id=request_row.opening_id,
                opening_request_id=request_row.opening_request_id,
                action_type="opening_request_status_admin_override",
                actor_person_id_platform=approver_id,
                actor_role=approver_role,
                meta={"from_status": previous_status, "to_status": target_status},
            )
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported status transition.")
        await session.commit()
    except HTTPException:
        await session.rollback()
        raise
    except OperationalError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=_opening_request_schema_error_detail(exc),
        )
    except SQLAlchemyError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Opening request status update failed: {exc}")

    await session.refresh(request_row)
    return _opening_request_to_out(request_row)


@router.delete("/requests/{opening_request_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_opening_request(
    opening_request_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(deps.get_user),
):
    if not _is_superadmin_actor(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only Superadmin can delete opening requests.")

    request_row = await session.get(RecOpeningRequest, opening_request_id, with_for_update=True)
    if not request_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Opening request not found")

    approver_id = _platform_person_id(user)
    approver_role = _actor_role_label(user)
    try:
        opening_adjusted = False
        opening_adjustment_meta: dict[str, int | bool] | None = None
        if (
            request_row.status == "applied"
            and request_row.request_type == "increase_headcount"
            and request_row.opening_id is not None
        ):
            opening = await session.get(RecOpening, request_row.opening_id, with_for_update=True)
            if opening:
                delta = max(0, int(request_row.headcount_delta or 0))
                if delta > 0:
                    required_before = int(opening.headcount_required or 0)
                    filled_now = int(opening.headcount_filled or 0)
                    required_after = max(filled_now, required_before - delta)
                    opening.headcount_required = required_after
                    if required_after <= filled_now:
                        opening.is_active = 0
                    opening.updated_at = datetime.utcnow()
                    opening_adjusted = required_after != required_before
                    opening_adjustment_meta = {
                        "headcount_required_before": required_before,
                        "headcount_required_after": required_after,
                        "headcount_filled": filled_now,
                        "is_active_after": bool(opening.is_active),
                    }

        await _log_opening_event(
            session,
            opening_id=request_row.opening_id,
            opening_request_id=request_row.opening_request_id,
            action_type="opening_request_deleted_admin",
            actor_person_id_platform=approver_id,
            actor_role=approver_role,
            meta={
                "deleted_status": request_row.status,
                "request_type": request_row.request_type,
                "opening_adjusted": opening_adjusted,
                "opening_adjustment": opening_adjustment_meta,
            },
        )
        await session.delete(request_row)
        await session.commit()
    except OperationalError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=_opening_request_schema_error_detail(exc),
        )
    except SQLAlchemyError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Opening request delete failed: {exc}")

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/requests/{opening_request_id}/approve", response_model=OpeningRequestOut)
async def approve_opening_request(
    opening_request_id: int,
    payload: OpeningRequestApprove,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(deps.get_user),
):
    if not _can_approve_opening_request(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")

    request_row = await session.get(RecOpeningRequest, opening_request_id, with_for_update=True)
    if not request_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Opening request not found")
    if request_row.status != "pending_hr_approval":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only pending requests can be approved.")

    approver_id = _platform_person_id(user)
    approver_role = _actor_role_label(user)
    override_hm = _clean_platform_person_id(payload.hiring_manager_person_id_platform)
    if override_hm:
        request_row.hiring_manager_person_id_platform = override_hm
        request_row.updated_at = datetime.utcnow()

    try:
        await _apply_opening_request(
            session,
            request_row=request_row,
            approver_person_id_platform=approver_id,
            approver_role=approver_role,
            approval_note=_clean_text(payload.approval_note),
        )
        await session.commit()
    except HTTPException:
        await session.rollback()
        raise
    except OperationalError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=_opening_request_schema_error_detail(exc),
        )
    except SQLAlchemyError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Opening request approval failed: {exc}")

    await session.refresh(request_row)
    return _opening_request_to_out(request_row)


@router.post("/requests/{opening_request_id}/reject", response_model=OpeningRequestOut)
async def reject_opening_request(
    opening_request_id: int,
    payload: OpeningRequestReject,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(deps.get_user),
):
    if not _can_approve_opening_request(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")

    request_row = await session.get(RecOpeningRequest, opening_request_id, with_for_update=True)
    if not request_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Opening request not found")
    if request_row.status != "pending_hr_approval":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only pending requests can be rejected.")

    now = datetime.utcnow()
    approver_id = _platform_person_id(user)
    approver_role = _actor_role_label(user)

    request_row.status = "rejected"
    request_row.rejected_reason = payload.rejection_reason.strip()
    request_row.approved_by_person_id_platform = approver_id
    request_row.approved_at = now
    request_row.applied_at = None
    request_row.updated_at = now

    try:
        await _log_opening_event(
            session,
            opening_id=request_row.opening_id,
            opening_request_id=request_row.opening_request_id,
            action_type="opening_request_rejected",
            actor_person_id_platform=approver_id,
            actor_role=approver_role,
            meta={"reason": request_row.rejected_reason},
        )
        await session.commit()
    except OperationalError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=_opening_request_schema_error_detail(exc),
        )
    except SQLAlchemyError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Opening request rejection failed: {exc}")

    await session.refresh(request_row)
    return _opening_request_to_out(request_row)


@router.get("/{opening_id}", response_model=OpeningDetail)
async def get_opening(
    opening_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(deps.get_user),
):
    if not _can_view_openings(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    opening = await session.get(RecOpening, opening_id)
    if not opening:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Opening not found")
    roles = set(user.roles or [])
    is_hr = _is_hr_actor(user)
    is_superadmin = _is_superadmin_actor(user)
    is_interviewer = (Role.INTERVIEWER in roles or Role.GROUP_LEAD in roles or Role.HIRING_MANAGER in roles) and not _is_role_5_or_6_actor(user)
    if is_interviewer and not is_hr and not is_superadmin:
        requested_by = _clean_platform_person_id(user.person_id_platform)
        if not requested_by or requested_by != _clean_platform_person_id(opening.reporting_person_id_platform):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access restricted")
    return OpeningDetail(
        opening_id=opening.opening_id,
        opening_code=opening.opening_code,
        title=opening.title,
        description=opening.description,
        location_city=opening.location_city,
        location_country=opening.location_country,
        is_active=bool(opening.is_active) if opening.is_active is not None else None,
        requested_by_person_id_platform=_clean_platform_person_id(opening.reporting_person_id_platform),
        hiring_manager_person_id_platform=_clean_platform_person_id(opening.reporting_person_id_platform),
        headcount_required=opening.headcount_required,
        headcount_filled=opening.headcount_filled,
        created_at=opening.created_at,
        updated_at=opening.updated_at,
    )


@router.patch("/{opening_id}", response_model=OpeningDetail)
async def update_opening(
    opening_id: int,
    payload: OpeningUpdate,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(
        require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.HIRING_MANAGER, Role.INTERVIEWER, Role.GROUP_LEAD, Role.VIEWER])
    ),
):
    opening = await session.get(RecOpening, opening_id)
    if not opening:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Opening not found")

    updates = payload.model_dump(exclude_none=True)
    if "opening_code" in updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Opening code cannot be edited.")
    is_superadmin = _is_superadmin_actor(user)
    is_hr_actor = _is_hr_actor(user)

    if not is_superadmin and not is_hr_actor:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only HR roles or Superadmin can change opening status.",
        )

    # HR can only toggle active/inactive state. All other edits are superadmin-only.
    if not is_superadmin:
        allowed = {"is_active"}
        rejected = [k for k in updates.keys() if k not in allowed]
        if rejected:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only Superadmin can edit opening details.")
        if "is_active" not in updates:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nothing to update.")

    if "is_active" in updates:
        updates["is_active"] = 1 if updates["is_active"] else 0
    if "hiring_manager_person_id_platform" in updates:
        updates["reporting_person_id_platform"] = _clean_platform_person_id(updates.pop("hiring_manager_person_id_platform"))
    if "requested_by_person_id_platform" in updates:
        requested_by_platform = _clean_platform_person_id(updates.pop("requested_by_person_id_platform"))
        if "reporting_person_id_platform" not in updates or updates["reporting_person_id_platform"] is None:
            updates["reporting_person_id_platform"] = requested_by_platform
    changed_fields = list(updates.keys())
    for key, value in updates.items():
        setattr(opening, key, value)
    opening.updated_at = datetime.utcnow()

    await _log_opening_event(
        session,
        opening_id=opening.opening_id,
        opening_request_id=None,
        action_type="opening_updated_manual",
        actor_person_id_platform=_platform_person_id(user),
        actor_role=_actor_role_label(user),
        meta={"changed_fields": changed_fields},
    )
    await session.commit()
    await session.refresh(opening)
    return await get_opening(opening_id, session, user)  # type: ignore[arg-type]


@router.delete("/{opening_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_opening(
    opening_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_superadmin()),
):
    opening = await session.get(RecOpening, opening_id)
    if not opening:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Opening not found")
    try:
        # Fetch candidates linked to this opening and delete dependents
        candidates = (
            await session.execute(select(RecCandidate).where(RecCandidate.opening_id == opening_id))
        ).scalars().all()
        for candidate in candidates:
            cid = candidate.candidate_id
            await session.execute(delete(RecCandidateEvent).where(RecCandidateEvent.candidate_id == cid))
            await session.execute(delete(RecCandidateStage).where(RecCandidateStage.candidate_id == cid))
            await session.execute(delete(RecCandidateScreening).where(RecCandidateScreening.candidate_id == cid))
            for table in [
                "rec_candidate_interview",
                "rec_candidate_offer",
                "rec_candidate_reference_check",
                "rec_candidate_sprint",
            ]:
                try:
                    await session.execute(text(f"DELETE FROM {table} WHERE candidate_id = :cid"), {"cid": cid})
                except Exception:
                    continue
            if candidate.drive_folder_id:
                try:
                    deleted = await anyio.to_thread.run_sync(delete_drive_item, candidate.drive_folder_id)
                    if not deleted:
                        raise RuntimeError("delete_drive_item returned false")
                except Exception:
                    await enqueue_operation(
                        session,
                        operation_type=OP_DRIVE_DELETE_ITEM,
                        payload={"item_id": candidate.drive_folder_id},
                        candidate_id=None,
                        related_entity_type="opening",
                        related_entity_id=opening_id,
                        idempotency_key=f"drive_delete_candidate_folder:{cid}:{candidate.drive_folder_id}",
                    )
            await session.delete(candidate)

        await session.execute(delete(RecOpeningEvent).where(RecOpeningEvent.opening_id == opening_id))
        await session.execute(delete(RecOpeningRequest).where(RecOpeningRequest.opening_id == opening_id))
        await session.delete(opening)
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete opening because dependent records exist (candidates/offers). Deactivate instead.",
        )
    except SQLAlchemyError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Opening could not be deleted: {exc}")
