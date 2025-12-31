from datetime import datetime

import anyio

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, delete, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import DataError, SQLAlchemyError
from sqlalchemy.exc import IntegrityError

from app.api import deps
from app.core.auth import require_roles, require_superadmin
from app.core.roles import Role
from app.models.opening import RecOpening
from app.schemas.opening import OpeningCreate, OpeningDetail, OpeningListItem, OpeningUpdate
from app.schemas.user import UserContext
from app.schemas.opening_detail import OpeningDetailOut
from app.db.platform_session import PlatformSessionLocal
from app.models.platform_person import DimPerson
from app.models.platform_role import DimRole
from app.models.candidate import RecCandidate
from app.models.event import RecCandidateEvent
from app.models.screening import RecCandidateScreening
from app.models.stage import RecCandidateStage
from uuid import uuid4
from app.services.drive import delete_drive_item

router = APIRouter(prefix="/rec/openings", tags=["openings"])


def _platform_person_id(user: UserContext) -> str | None:
    raw = (user.person_id_platform or "").strip()
    return raw or None


def _clean_platform_person_id(raw: str | None) -> str | None:
    if raw is None:
        return None
    val = raw.strip()
    return val or None


def _generate_opening_code(title: str) -> str:
    base = (title or "OPEN").strip().upper()
    letters = "".join(ch for ch in base if ch.isalpha())[:4] or "OPEN"
    unique = uuid4().hex[:4].upper()
    return f"{letters}-{unique}"


@router.get("", response_model=list[OpeningListItem])
async def list_openings(
    is_active: bool | None = Query(default=None),
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.HIRING_MANAGER, Role.INTERVIEWER, Role.VIEWER])),
):
    # MySQL doesn't support NULLS LAST; emulate by ordering NULLs first flag, then desc.
    query = select(RecOpening).order_by(RecOpening.updated_at.is_(None), RecOpening.updated_at.desc(), RecOpening.opening_id.desc())
    if is_active is not None:
        query = query.where(RecOpening.is_active == (1 if is_active else 0))
    rows = (await session.execute(query)).scalars().all()

    # Enrich requested_by names from platform DB
    requested_ids = {_clean_platform_person_id(r.reporting_person_id_platform) for r in rows}
    requested_ids.discard(None)
    person_lookup: dict[str, dict] = {}
    if requested_ids:
        try:
            async with PlatformSessionLocal() as platform_session:
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
                        ).where(DimPerson.person_id.in_(list(requested_ids)))
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
                    person_lookup[_clean_platform_person_id(pr.person_id) or pr.person_id] = {
                        "name": full_name or pr.email or pr.person_id,
                        "person_code": pr.person_code,
                        "email": pr.email,
                        "phone": pr.mobile_number,
                        "role_name": role_name,
                        "role_code": role_code,
                    }
        except Exception:
            person_lookup = {}
    return [
        OpeningListItem(
            opening_id=o.opening_id,
            opening_code=o.opening_code,
            title=o.title,
            location_city=o.location_city,
            is_active=bool(o.is_active) if o.is_active is not None else None,
            requested_by_person_id_platform=_clean_platform_person_id(o.reporting_person_id_platform),
            requested_by_name=person_lookup.get(_clean_platform_person_id(o.reporting_person_id_platform) or "", {}).get("name"),
            requested_by_role_name=person_lookup.get(_clean_platform_person_id(o.reporting_person_id_platform) or "", {}).get("role_name"),
            requested_by_role_code=person_lookup.get(_clean_platform_person_id(o.reporting_person_id_platform) or "", {}).get("role_code"),
            requested_by_person_code=person_lookup.get(_clean_platform_person_id(o.reporting_person_id_platform) or "", {}).get("person_code"),
            requested_by_email=person_lookup.get(_clean_platform_person_id(o.reporting_person_id_platform) or "", {}).get("email"),
            requested_by_phone=person_lookup.get(_clean_platform_person_id(o.reporting_person_id_platform) or "", {}).get("phone"),
            headcount_required=o.headcount_required,
            headcount_filled=o.headcount_filled,
        )
        for o in rows
    ]


@router.get("/by-code/{opening_code}", response_model=OpeningDetailOut)
async def get_opening_by_code(
    opening_code: str,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.HIRING_MANAGER, Role.INTERVIEWER, Role.VIEWER])),
):
    opening = (
        await session.execute(select(RecOpening).where(RecOpening.opening_code == opening_code).limit(1))
    ).scalars().first()
    if not opening:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Opening not found")
    return OpeningDetailOut.model_validate(opening)


@router.post("", response_model=OpeningListItem, status_code=status.HTTP_201_CREATED)
async def create_opening(
    payload: OpeningCreate,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC])),
):
    now = datetime.utcnow()
    opening_code = payload.opening_code or _generate_opening_code(payload.title)
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
        reporting_person_id_platform=_clean_platform_person_id(payload.requested_by_person_id_platform),
        headcount_required=payload.headcount_required if payload.headcount_required is not None else 1,
        headcount_filled=0,
        is_active=1 if payload.is_active else 0,
        created_at=now,
        updated_at=now,
    )
    session.add(opening)
    try:
        await session.flush()
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

    requested_by_id = _clean_platform_person_id(opening.reporting_person_id_platform) or ""
    requested_by_meta: dict[str, str | None] = {}
    if requested_by_id:
        try:
            async with PlatformSessionLocal() as platform_session:
                pr = (
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
                        ).where(DimPerson.person_id == requested_by_id)
                    )
                ).first()
                role_name: str | None = None
                role_code: str | None = None
                if pr and pr.role_id:
                    rr = (
                        await platform_session.execute(
                            select(DimRole.role_name, DimRole.role_code).where(DimRole.role_id == pr.role_id)
                        )
                    ).first()
                    if rr:
                        role_name, role_code = rr.role_name, rr.role_code
                if pr:
                    full_name = (pr.display_name or pr.full_name or f"{(pr.first_name or '').strip()} {(pr.last_name or '').strip()}").strip()
                    requested_by_meta = {
                        "name": full_name or pr.email or pr.person_id,
                        "person_code": pr.person_code,
                        "email": pr.email,
                        "phone": pr.mobile_number,
                        "role_name": role_name,
                        "role_code": role_code,
                    }
        except Exception:
            requested_by_meta = {}

    return OpeningListItem(
        opening_id=opening.opening_id,
        opening_code=opening.opening_code,
        title=opening.title,
        location_city=opening.location_city,
        is_active=bool(opening.is_active) if opening.is_active is not None else None,
        requested_by_person_id_platform=_clean_platform_person_id(opening.reporting_person_id_platform),
        requested_by_name=requested_by_meta.get("name"),
        requested_by_role_name=requested_by_meta.get("role_name"),
        requested_by_role_code=requested_by_meta.get("role_code"),
        requested_by_person_code=requested_by_meta.get("person_code"),
        requested_by_email=requested_by_meta.get("email"),
        requested_by_phone=requested_by_meta.get("phone"),
        headcount_required=opening.headcount_required,
        headcount_filled=opening.headcount_filled,
        created_at=opening.created_at,
        updated_at=opening.updated_at,
    )


@router.post("/requests", response_model=OpeningDetail, status_code=status.HTTP_201_CREATED)
async def create_opening_request(
    payload: OpeningCreate,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.HIRING_MANAGER])),
):
    now = datetime.utcnow()
    requested_by = _platform_person_id(user) or payload.requested_by_person_id_platform
    opening_code = payload.opening_code or _generate_opening_code(payload.title)
    opening = RecOpening(
        opening_code=opening_code,
        title=payload.title,
        description=payload.description,
        location_city=payload.location_city or "Delhi",
        location_country=payload.location_country or "India",
        reporting_person_id_platform=requested_by,
        headcount_required=payload.headcount_required if payload.headcount_required is not None else 1,
        headcount_filled=0,
        is_active=0,  # request starts inactive; HR can approve by toggling active later
        created_at=now,
        updated_at=now,
    )
    session.add(opening)
    try:
        await session.flush()
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Opening request could not be saved: {exc.orig}")
    except DataError as exc:
        await session.rollback()
        message = str(getattr(exc, "orig", exc))
        if "reporting_person_id_platform" in message:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="DB schema mismatch: `rec_opening.reporting_person_id_platform` must be VARCHAR(64) to store platform IDs like DK_0498. Apply `backend/migrations/0003_opening_requested_by_string.sql`.",
            )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Opening request could not be saved: {message}")
    except SQLAlchemyError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Opening request could not be saved: {exc}")
    await session.refresh(opening)
    return OpeningDetail(
        opening_id=opening.opening_id,
        opening_code=opening.opening_code,
        title=opening.title,
        description=opening.description,
        location_city=opening.location_city,
        location_country=opening.location_country,
        is_active=bool(opening.is_active) if opening.is_active is not None else None,
        requested_by_person_id_platform=opening.reporting_person_id_platform,
        headcount_required=opening.headcount_required,
        headcount_filled=opening.headcount_filled,
        created_at=opening.created_at,
        updated_at=opening.updated_at,
    )


@router.get("/{opening_id}", response_model=OpeningDetail)
async def get_opening(
    opening_id: int,
    session: AsyncSession = Depends(deps.get_db_session),
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.HIRING_MANAGER, Role.INTERVIEWER, Role.VIEWER])),
):
    opening = await session.get(RecOpening, opening_id)
    if not opening:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Opening not found")
    return OpeningDetail(
        opening_id=opening.opening_id,
        opening_code=opening.opening_code,
        title=opening.title,
        description=opening.description,
        location_city=opening.location_city,
        location_country=opening.location_country,
        is_active=bool(opening.is_active) if opening.is_active is not None else None,
        requested_by_person_id_platform=opening.reporting_person_id_platform,
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
    user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC])),
):
    opening = await session.get(RecOpening, opening_id)
    if not opening:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Opening not found")

    updates = payload.model_dump(exclude_none=True)
    is_superadmin = (user.platform_role_id or None) == 2

    # HR can only deactivate an opening (no activate, no editing fields).
    if not is_superadmin:
        allowed = {"is_active"}
        rejected = [k for k in updates.keys() if k not in allowed]
        if rejected:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only Superadmin can edit opening details.")
        if "is_active" not in updates:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nothing to update.")
        if updates["is_active"] is True:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only Superadmin can activate an opening.")
        updates["is_active"] = 0

    if "is_active" in updates:
        updates["is_active"] = 1 if updates["is_active"] else 0
    if "requested_by_person_id_platform" in updates:
        updates["reporting_person_id_platform"] = _clean_platform_person_id(updates.pop("requested_by_person_id_platform"))
    for key, value in updates.items():
        setattr(opening, key, value)
    opening.updated_at = datetime.utcnow()

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
                await anyio.to_thread.run_sync(delete_drive_item, candidate.drive_folder_id)
            await session.delete(candidate)

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
