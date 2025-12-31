from datetime import datetime
from uuid import uuid4

import anyio
from fastapi import APIRouter, Depends, HTTPException, Query, status
import json
from pydantic import BaseModel
from sqlalchemy import func, select, delete, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import SQLAlchemyError, OperationalError

from app.api import deps
from app.core.auth import require_roles, require_superadmin
from app.core.roles import Role
from app.models.candidate import RecCandidate
from app.models.candidate_offer import RecCandidateOffer
from app.models.event import RecCandidateEvent
from app.models.opening import RecOpening
from app.models.screening import RecCandidateScreening
from app.models.stage import RecCandidateStage
from app.schemas.candidate import CandidateCreate, CandidateDetailOut, CandidateListItem, CandidateUpdate
from app.schemas.event import CandidateEventOut
from app.schemas.offer import OfferCreateIn, OfferOut
from app.schemas.candidate_full import CandidateFullOut
from app.schemas.screening import ScreeningOut, ScreeningUpsertIn
from app.schemas.stage import CandidateStageOut, StageTransitionRequest
from app.schemas.user import UserContext
from app.services.drive import create_candidate_folder, delete_drive_item, delete_all_candidate_folders
from app.services.email import send_email
from app.services.events import log_event
from app.services.offers import convert_candidate_to_employee, create_offer
from app.services.opening_config import get_opening_config
from app.services.screening_rules import evaluate_screening

router = APIRouter(prefix="/rec/candidates", tags=["candidates"])


def _candidate_code(candidate_id: int) -> str:
    return f"SLR-{candidate_id:06d}"


def _split_name(full_name: str) -> tuple[str, str | None]:
    parts = full_name.strip().split()
    if not parts:
        return "", None
    first = parts[0]
    last = " ".join(parts[1:]) or None
    return first, last


def _platform_person_id(user: UserContext) -> int | None:
    raw = (user.person_id_platform or "").strip()
    if not raw:
        return None
    try:
        return int(raw)
    except Exception:
        return None


async def _delete_candidate_with_dependents(session: AsyncSession, candidate: RecCandidate, *, delete_drive: bool = True):
    cid = candidate.candidate_id
    # Delete known dependent tables (raw SQL to cover tables without models)
    await session.execute(delete(RecCandidateEvent).where(RecCandidateEvent.candidate_id == cid))
    await session.execute(delete(RecCandidateStage).where(RecCandidateStage.candidate_id == cid))
    await session.execute(delete(RecCandidateScreening).where(RecCandidateScreening.candidate_id == cid))
    # Best-effort deletes for other dependent tables
    for table in [
        "rec_candidate_interview",
        "rec_candidate_offer",
        "rec_candidate_reference_check",
        "rec_candidate_sprint",
    ]:
        try:
            await session.execute(text(f"DELETE FROM {table} WHERE candidate_id = :cid"), {"cid": cid})
        except Exception:
            # Ignore if table missing or FK differs
            continue
    if delete_drive and candidate.drive_folder_id:
        await anyio.to_thread.run_sync(delete_drive_item, candidate.drive_folder_id)
    await session.delete(candidate)


async def _get_current_stage_name(session: AsyncSession, *, candidate_id: int) -> str | None:
    pending = await session.execute(
        select(RecCandidateStage.stage_name)
        .where(RecCandidateStage.candidate_id == candidate_id, RecCandidateStage.stage_status == "pending")
        .order_by(RecCandidateStage.started_at.desc(), RecCandidateStage.stage_id.desc())
        .limit(1)
    )
    stage = pending.scalar_one_or_none()
    if stage:
        return stage
    latest = await session.execute(
        select(RecCandidateStage.stage_name)
        .where(RecCandidateStage.candidate_id == candidate_id)
        .order_by(RecCandidateStage.started_at.desc(), RecCandidateStage.stage_id.desc())
        .limit(1)
    )
    return latest.scalar_one_or_none()


async def _get_ageing_days(session: AsyncSession, *, candidate_id: int) -> int:
    row = await session.execute(
        select(func.datediff(func.curdate(), RecCandidateStage.started_at))
        .where(RecCandidateStage.candidate_id == candidate_id, RecCandidateStage.stage_status == "pending")
        .order_by(RecCandidateStage.started_at.desc(), RecCandidateStage.stage_id.desc())
        .limit(1)
    )
    value = row.scalar_one_or_none()
    return int(value or 0)


@router.post("", response_model=CandidateDetailOut, status_code=status.HTTP_201_CREATED)
async def create_candidate(
    payload: CandidateCreate,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC])),
):
    now = datetime.utcnow()
    first_name, last_name = _split_name(payload.name)

    application_docs_status = "partial" if payload.cv_url else "none"
    temp_candidate_code = uuid4().hex[:8].upper()
    candidate = RecCandidate(
        candidate_code=temp_candidate_code,
        first_name=first_name,
        last_name=last_name,
        full_name=payload.name,
        email=str(payload.email).lower(),
        phone=payload.phone,
        opening_id=payload.opening_id,
        source_channel=payload.source_channel,
        status="enquiry",
        cv_url=payload.cv_url,
        caf_token=uuid4().hex,
        caf_sent_at=now,
        application_docs_status=application_docs_status,
        joining_docs_status="none",
        created_at=now,
        updated_at=now,
    )
    session.add(candidate)
    await session.flush()

    candidate.candidate_code = _candidate_code(candidate.candidate_id)
    await session.flush()

    # Initial stage rows: enquiry (completed) -> hr_screening (pending)
    enquiry = RecCandidateStage(
        candidate_id=candidate.candidate_id,
        stage_name="enquiry",
        stage_status="completed",
        started_at=now,
        ended_at=now,
        created_at=now,
    )
    hr_screening = RecCandidateStage(
        candidate_id=candidate.candidate_id,
        stage_name="hr_screening",
        stage_status="pending",
        started_at=now,
        created_at=now,
    )
    session.add_all([enquiry, hr_screening])

    await log_event(
        session,
        candidate_id=candidate.candidate_id,
        action_type="candidate_created",
        performed_by_person_id_platform=_platform_person_id(user),
        related_entity_type="candidate",
        related_entity_id=candidate.candidate_id,
        meta_json={
            "candidate_code": candidate.candidate_code,
            "source_channel": payload.source_channel,
            "opening_id": payload.opening_id,
            "performed_by_email": user.email,
        },
    )

    await log_event(
        session,
        candidate_id=candidate.candidate_id,
        action_type="caf_link_generated",
        performed_by_person_id_platform=_platform_person_id(user),
        related_entity_type="candidate",
        related_entity_id=candidate.candidate_id,
        meta_json={"caf_token": candidate.caf_token},
    )

    await send_email(
        session,
        candidate_id=candidate.candidate_id,
        to_emails=[candidate.email],
        subject="Complete your Candidate Application Form",
        template_name="caf_link",
        context={"candidate_name": candidate.full_name, "caf_link": f"/caf/{candidate.caf_token}"},
        email_type="caf_link",
        meta_extra={"caf_token": candidate.caf_token},
    )

    # Drive folder creation
    folder_id, folder_url = await anyio.to_thread.run_sync(
        create_candidate_folder, candidate.candidate_code, candidate.full_name
    )
    candidate.drive_folder_id = folder_id
    candidate.drive_folder_url = folder_url

    await log_event(
        session,
        candidate_id=candidate.candidate_id,
        action_type="drive_folder_created",
        performed_by_person_id_platform=_platform_person_id(user),
        related_entity_type="candidate",
        related_entity_id=candidate.candidate_id,
        meta_json={"drive_folder_id": folder_id, "drive_folder_url": folder_url},
    )

    await log_event(
        session,
        candidate_id=candidate.candidate_id,
        action_type="stage_change",
        performed_by_person_id_platform=_platform_person_id(user),
        related_entity_type="candidate",
        related_entity_id=candidate.candidate_id,
        from_status=None,
        to_status="hr_screening",
        meta_json={"from_stage": None, "to_stage": "hr_screening", "reason": "system_init", "performed_by_email": user.email},
    )

    await session.commit()

    opening_title = None
    if candidate.opening_id is not None:
        opening_title = (
            await session.execute(select(RecOpening.title).where(RecOpening.opening_id == candidate.opening_id))
        ).scalar_one_or_none()

    return CandidateDetailOut(
        candidate_id=candidate.candidate_id,
        candidate_code=candidate.candidate_code,
        name=candidate.full_name,
        email=candidate.email,
        phone=candidate.phone,
        opening_id=candidate.opening_id,
        opening_title=opening_title,
        status=candidate.status,
        current_stage="hr_screening",
        final_decision=candidate.final_decision,
        hired_person_id_platform=candidate.hired_person_id_platform,
        cv_url=candidate.cv_url,
        drive_folder_url=candidate.drive_folder_url,
        caf_sent_at=candidate.caf_sent_at,
        caf_submitted_at=candidate.caf_submitted_at,
        needs_hr_review=bool(candidate.needs_hr_review),
        application_docs_status=candidate.application_docs_status,
        joining_docs_status=candidate.joining_docs_status,
        created_at=candidate.created_at,
        updated_at=candidate.updated_at,
    )


@router.get("", response_model=list[CandidateListItem])
async def list_candidates(
    opening_id: int | None = Query(default=None),
    status_filter: list[str] | None = Query(default=None, alias="status"),
    stage: list[str] | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.HIRING_MANAGER, Role.INTERVIEWER, Role.VIEWER])),
):
    current_stage_subq = (
        select(RecCandidateStage.candidate_id, RecCandidateStage.stage_name, RecCandidateStage.started_at)
        .where(RecCandidateStage.stage_status == "pending")
        .subquery()
    )

    query = (
        select(
            RecCandidate.candidate_id,
            RecCandidate.candidate_code,
            RecCandidate.full_name,
            RecCandidate.status,
            RecCandidate.opening_id.label("opening_id"),
            RecCandidate.caf_sent_at.label("caf_sent_at"),
            RecCandidate.caf_submitted_at.label("caf_submitted_at"),
            RecCandidate.needs_hr_review.label("needs_hr_review"),
            RecOpening.title.label("opening_title"),
            RecCandidateScreening.screening_result.label("screening_result"),
            current_stage_subq.c.stage_name.label("current_stage"),
            func.coalesce(func.datediff(func.curdate(), current_stage_subq.c.started_at), 0).label("ageing_days"),
        )
        .select_from(RecCandidate)
        .outerjoin(RecOpening, RecOpening.opening_id == RecCandidate.opening_id)
        .outerjoin(RecCandidateScreening, RecCandidateScreening.candidate_id == RecCandidate.candidate_id)
        .outerjoin(current_stage_subq, current_stage_subq.c.candidate_id == RecCandidate.candidate_id)
        .order_by(RecCandidate.created_at.desc(), RecCandidate.candidate_id.desc())
        .limit(limit)
        .offset(offset)
    )

    if opening_id is not None:
        query = query.where(RecCandidate.opening_id == opening_id)
    if status_filter:
        query = query.where(RecCandidate.status.in_(status_filter))
    if stage:
        normalized: list[str] = []
        for item in stage:
            if item == "hr_screening":
                normalized.extend(["hr_screening", "caf"])
            elif item == "caf":
                normalized.extend(["caf", "hr_screening"])
            else:
                normalized.append(item)
        query = query.where(current_stage_subq.c.stage_name.in_(normalized))

    rows = (await session.execute(query)).all()
    return [
        CandidateListItem(
            candidate_id=row.candidate_id,
            candidate_code=row.candidate_code or "",
            name=row.full_name,
            opening_id=row.opening_id,
            opening_title=row.opening_title,
            current_stage=row.current_stage,
            status=row.status,
            ageing_days=int(row.ageing_days or 0),
            caf_sent_at=row.caf_sent_at,
            caf_submitted_at=row.caf_submitted_at,
            needs_hr_review=bool(row.needs_hr_review),
            screening_result=row.screening_result,
        )
        for row in rows
    ]


@router.get("/{candidate_id}", response_model=CandidateDetailOut)
async def get_candidate(
    candidate_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.HIRING_MANAGER, Role.INTERVIEWER, Role.VIEWER])),
):
    candidate = await session.get(RecCandidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    opening_title = None
    if candidate.opening_id is not None:
        opening_title = (
            await session.execute(select(RecOpening.title).where(RecOpening.opening_id == candidate.opening_id))
        ).scalar_one_or_none()

    current_stage = await _get_current_stage_name(session, candidate_id=candidate_id)
    return CandidateDetailOut(
        candidate_id=candidate.candidate_id,
        candidate_code=candidate.candidate_code or _candidate_code(candidate.candidate_id),
        name=candidate.full_name,
        email=candidate.email,
        phone=candidate.phone,
        opening_id=candidate.opening_id,
        opening_title=opening_title,
        status=candidate.status,
        current_stage=current_stage,
        final_decision=candidate.final_decision,
        hired_person_id_platform=candidate.hired_person_id_platform,
        cv_url=candidate.cv_url,
        drive_folder_url=candidate.drive_folder_url,
        caf_sent_at=candidate.caf_sent_at,
        caf_submitted_at=candidate.caf_submitted_at,
        needs_hr_review=bool(candidate.needs_hr_review),
        application_docs_status=candidate.application_docs_status,
        joining_docs_status=candidate.joining_docs_status,
        created_at=candidate.created_at,
        updated_at=candidate.updated_at,
    )


@router.get("/{candidate_id}/full", response_model=CandidateFullOut)
async def get_candidate_full(
    candidate_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.HIRING_MANAGER, Role.INTERVIEWER, Role.VIEWER])),
):
    candidate = await get_candidate(candidate_id, session, user)  # type: ignore[arg-type]

    stages = await list_candidate_stages(candidate_id, session, user)  # type: ignore[arg-type]
    events = await list_candidate_events(candidate_id, session, user)  # type: ignore[arg-type]

    screening: ScreeningOut | None = None
    try:
        screening = await get_candidate_screening(candidate_id, session, user)  # type: ignore[arg-type]
    except HTTPException as exc:
        if exc.status_code not in {status.HTTP_404_NOT_FOUND, status.HTTP_503_SERVICE_UNAVAILABLE}:
            raise
    except OperationalError:
        # DB missing screening columns/table; treat as no screening instead of 500
        screening = None
    except SQLAlchemyError:
        screening = None

    return CandidateFullOut(candidate=candidate, stages=stages, events=events, screening=screening)


@router.get("/{candidate_id}/screening", response_model=ScreeningOut)
async def get_candidate_screening(
    candidate_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.HIRING_MANAGER, Role.INTERVIEWER, Role.VIEWER])),
):
    candidate = await session.get(RecCandidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    try:
        screening = (
            await session.execute(
                select(RecCandidateScreening).where(RecCandidateScreening.candidate_id == candidate_id)
            )
        ).scalars().first()
    except OperationalError:
        # DB is missing screening columns/table (migration not applied)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Screening table/columns missing (apply migration 0002)")

    if not screening:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No screening data yet")

    return ScreeningOut.model_validate(screening)


@router.put("/{candidate_id}/screening", response_model=ScreeningOut)
async def upsert_candidate_screening(
    candidate_id: int,
    payload: ScreeningUpsertIn,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_superadmin()),
):
    candidate = await session.get(RecCandidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    now = datetime.utcnow()
    screening = (
        await session.execute(
            select(RecCandidateScreening).where(RecCandidateScreening.candidate_id == candidate_id)
        )
    ).scalars().first()
    if screening is None:
        screening = RecCandidateScreening(candidate_id=candidate_id, created_at=now, updated_at=now)
        session.add(screening)

    data = payload.model_dump(exclude_none=True)
    for key, value in data.items():
        setattr(screening, key, value)
    screening.updated_at = now

    if candidate.caf_submitted_at is None:
        candidate.caf_submitted_at = now

    opening_config = get_opening_config(candidate.opening_id)
    decision = evaluate_screening(payload, opening_config)
    screening.screening_result = decision
    candidate.needs_hr_review = decision == "amber"
    candidate.updated_at = now

    await log_event(
        session,
        candidate_id=candidate_id,
        action_type="screening_admin_update",
        performed_by_person_id_platform=_platform_person_id(user),
        related_entity_type="candidate",
        related_entity_id=candidate_id,
        meta_json={"screening_result": decision},
    )

    await session.commit()
    await session.refresh(screening)
    return ScreeningOut.model_validate(screening)


@router.get("/{candidate_id}/caf-link")
async def get_candidate_caf_link(
    candidate_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC])),
):
    candidate = await session.get(RecCandidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")
    if not candidate.caf_token:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CAF token not generated")
    return {"caf_token": candidate.caf_token, "caf_url": f"/caf/{candidate.caf_token}"}


@router.patch("/{candidate_id}", response_model=CandidateDetailOut)
async def update_candidate(
    candidate_id: int,
    payload: CandidateUpdate,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC])),
):
    candidate = await session.get(RecCandidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    updates = payload.model_dump(exclude_none=True)
    if "name" in updates:
        candidate.full_name = updates.pop("name")
    for key, value in updates.items():
        setattr(candidate, key, value)
    candidate.updated_at = datetime.utcnow()

    await log_event(
        session,
        candidate_id=candidate_id,
        action_type="candidate_updated",
        performed_by_person_id_platform=_platform_person_id(user),
        related_entity_type="candidate",
        related_entity_id=candidate_id,
        meta_json=payload.model_dump(exclude_none=True),
    )

    await session.commit()
    return await get_candidate(candidate_id, session, user)  # type: ignore[arg-type]


@router.delete("/{candidate_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_candidate(
    candidate_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(deps.get_user),
):
    candidate = await session.get(RecCandidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")
    if (user.platform_role_id or None) != 2:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Delete not permitted for this role.")
    try:
        await _delete_candidate_with_dependents(session, candidate)
        await session.commit()
    except SQLAlchemyError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Candidate could not be deleted: {exc}")


class DriveCleanupRequest(BaseModel):
    bucket: str = "Ongoing"


@router.post("/drive/cleanup", status_code=status.HTTP_200_OK)
async def cleanup_candidate_folders(
    payload: DriveCleanupRequest,
    _session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(deps.get_user),
):
    if (user.platform_role_id or None) != 2:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Delete not permitted for this role.")
    bucket = payload.bucket
    if bucket not in {"Ongoing", "Appointed", "Not Appointed"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid bucket")
    deleted = await anyio.to_thread.run_sync(delete_all_candidate_folders, bucket)  # type: ignore[arg-type]
    return {"deleted": deleted}


@router.get("/{candidate_id}/events", response_model=list[CandidateEventOut])
async def list_candidate_events(
    candidate_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.HIRING_MANAGER, Role.INTERVIEWER, Role.VIEWER])),
):
    candidate = await session.get(RecCandidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    rows = (
        await session.execute(
            select(RecCandidateEvent)
            .where(RecCandidateEvent.candidate_id == candidate_id)
            .order_by(RecCandidateEvent.created_at.asc(), RecCandidateEvent.candidate_event_id.asc())
        )
    ).scalars()

    out: list[CandidateEventOut] = []
    for event in rows:
        meta: dict = {}
        if event.meta_json:
            try:
                meta = json.loads(event.meta_json) if isinstance(event.meta_json, str) else {}
            except Exception:
                meta = {}
        performed_by_name = meta.get("performed_by_name") if isinstance(meta, dict) else None
        performed_by_email = meta.get("performed_by_email") if isinstance(meta, dict) else None
        out.append(
            CandidateEventOut(
                event_id=event.candidate_event_id,
                candidate_id=event.candidate_id,
                candidate_name=candidate.full_name,
                candidate_code=candidate.candidate_code,
                action_type=event.action_type,
                performed_by_person_id_platform=event.performed_by_person_id_platform,
                performed_by_name=performed_by_name,
                performed_by_email=performed_by_email,
                meta_json=meta,
                created_at=event.created_at,
            )
        )
    return out


@router.get("/{candidate_id}/offers", response_model=list[OfferOut])
async def list_candidate_offers(
    candidate_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    _user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.HIRING_MANAGER, Role.INTERVIEWER, Role.VIEWER])),
):
    rows = (
        await session.execute(
            select(RecCandidateOffer)
            .where(RecCandidateOffer.candidate_id == candidate_id)
            .order_by(RecCandidateOffer.created_at.desc(), RecCandidateOffer.candidate_offer_id.desc())
        )
    ).scalars().all()
    return [OfferOut.model_validate(row) for row in rows]


@router.post("/{candidate_id}/offers", response_model=OfferOut, status_code=status.HTTP_201_CREATED)
async def create_candidate_offer(
    candidate_id: int,
    payload: OfferCreateIn,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC])),
):
    candidate = await session.get(RecCandidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")
    opening = None
    if candidate.opening_id:
        opening = await session.get(RecOpening, candidate.opening_id)
    offer = await create_offer(session, candidate=candidate, opening=opening, payload=payload.model_dump(exclude_none=True), user=user)
    await session.commit()
    await session.refresh(offer)
    return OfferOut.model_validate(offer)


@router.get("/{candidate_id}/stages", response_model=list[CandidateStageOut])
async def list_candidate_stages(
    candidate_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.HIRING_MANAGER, Role.INTERVIEWER, Role.VIEWER])),
):
    candidate = await session.get(RecCandidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    stages = (
        await session.execute(
            select(RecCandidateStage)
            .where(RecCandidateStage.candidate_id == candidate_id)
            .order_by(RecCandidateStage.started_at.asc(), RecCandidateStage.stage_id.asc())
        )
    ).scalars()
    return [CandidateStageOut.model_validate(stage) for stage in stages]


@router.post("/{candidate_id}/transition", status_code=status.HTTP_202_ACCEPTED)
async def transition_stage(
    candidate_id: int,
    payload: StageTransitionRequest,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.HIRING_MANAGER, Role.INTERVIEWER])),
):
    candidate = await session.get(RecCandidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")
    if (payload.decision or "").lower() == "skip" or (payload.note or "").lower() == "superadmin_skip":
        if (user.platform_role_id or None) != 2:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Skip is restricted to Superadmin.")

    now = datetime.utcnow()
    current_stage_row = (
        await session.execute(
            select(RecCandidateStage)
            .where(RecCandidateStage.candidate_id == candidate_id, RecCandidateStage.stage_status == "pending")
            .order_by(RecCandidateStage.started_at.desc(), RecCandidateStage.stage_id.desc())
            .limit(1)
        )
    ).scalars().first()

    from_stage = None
    if current_stage_row:
        from_stage = current_stage_row.stage_name
        current_stage_row.stage_status = "completed"
        current_stage_row.ended_at = now

    new_stage = RecCandidateStage(
        candidate_id=candidate_id,
        stage_name=payload.to_stage,
        stage_status="pending",
        started_at=now,
        created_at=now,
    )
    session.add(new_stage)

    if payload.to_stage in {"rejected", "hired"}:
        candidate.status = payload.to_stage
    else:
        candidate.status = "in_process"
    candidate.updated_at = now

    await log_event(
        session,
        candidate_id=candidate_id,
        action_type="stage_change",
        performed_by_person_id_platform=_platform_person_id(user),
        related_entity_type="candidate",
        related_entity_id=candidate_id,
        from_status=from_stage,
        to_status=payload.to_stage,
        meta_json={
            "from_stage": from_stage,
            "to_stage": payload.to_stage,
            "decision": payload.decision,
            "reason": payload.reason or payload.decision,
            "note": payload.note,
            "performed_by_email": user.email,
        },
    )

    await session.commit()
    return {"candidate_id": candidate_id, "from_stage": from_stage, "to_stage": payload.to_stage, "status": candidate.status}


@router.post("/{candidate_id}/convert", status_code=status.HTTP_200_OK)
async def convert_candidate(
    candidate_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_superadmin()),
):
    candidate = await session.get(RecCandidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")
    offer = (
        await session.execute(
            select(RecCandidateOffer)
            .where(RecCandidateOffer.candidate_id == candidate_id, RecCandidateOffer.offer_status == "accepted")
            .order_by(RecCandidateOffer.accepted_at.desc(), RecCandidateOffer.candidate_offer_id.desc())
            .limit(1)
        )
    ).scalars().first()
    if not offer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No accepted offer found")
    await convert_candidate_to_employee(session, candidate=candidate, offer=offer, user=user)
    await session.commit()
    return {"candidate_id": candidate_id, "status": candidate.status, "final_decision": candidate.final_decision}
