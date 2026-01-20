from __future__ import annotations

from datetime import date, datetime
import re
import csv
import io
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import Integer, or_, select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_roles, require_superadmin
from app.core.roles import Role
from app.db.platform_session import get_platform_session
from app.models.platform_person import DimPerson, DimPersonRole
from app.models.platform_role import DimRole
from app.schemas.platform import (
    BulkUploadError,
    BulkUploadResult,
    PlatformPersonCreate,
    PlatformPersonOut,
    PlatformPersonSuggestion,
    PlatformPersonUpdate,
)
from app.schemas.user import UserContext
from app.services.platform_identity import active_status_filter

router = APIRouter(prefix="/platform/people", tags=["platform"])


@router.get("", response_model=list[PlatformPersonSuggestion])
async def search_people(
    q: str = Query(default="", max_length=100),
    limit: int = Query(default=10, ge=1, le=25),
    session: AsyncSession = Depends(get_platform_session),
    _user: UserContext = Depends(require_roles([Role.HR_ADMIN, Role.HR_EXEC, Role.HIRING_MANAGER])),
):
    q_norm = q.strip().lower()
    like = f"%{q_norm}%"

    is_superadmin = (getattr(_user, "platform_role_id", None) or None) == 2
    base_filters = [(DimPerson.is_deleted == 0) | (DimPerson.is_deleted.is_(None))]
    if not is_superadmin:
        base_filters.append(active_status_filter())

    # If query is too short, return a small "default" list for dropdown convenience.
    if len(q_norm) < 2:
        rows = (
            await session.execute(
                select(
                    DimPerson.person_id,
                    DimPerson.person_code,
                    DimPerson.email,
                    DimPerson.first_name,
                    DimPerson.last_name,
                    DimPerson.display_name,
                    DimPerson.full_name,
                    DimPerson.role_id,
                    DimRole.role_code,
                    DimRole.role_name,
                )
                .select_from(DimPerson)
                .outerjoin(DimRole, DimRole.role_id == DimPerson.role_id)
                .where(*base_filters)
                .order_by(func.coalesce(DimPerson.display_name, DimPerson.full_name, DimPerson.first_name, DimPerson.email).asc())
                .limit(limit)
            )
        ).all()
    else:
        rows = (
            await session.execute(
                select(
                    DimPerson.person_id,
                    DimPerson.person_code,
                    DimPerson.email,
                    DimPerson.first_name,
                    DimPerson.last_name,
                    DimPerson.display_name,
                    DimPerson.full_name,
                    DimPerson.role_id,
                    DimRole.role_code,
                    DimRole.role_name,
                )
                .select_from(DimPerson)
                .outerjoin(DimRole, DimRole.role_id == DimPerson.role_id)
                .where(
                    *base_filters,
                    or_(
                        func.lower(DimPerson.email).like(like),
                        func.lower(func.coalesce(DimPerson.display_name, "")).like(like),
                        func.lower(func.coalesce(DimPerson.full_name, "")).like(like),
                        func.lower(func.coalesce(DimPerson.first_name, "")).like(like),
                        func.lower(func.coalesce(DimPerson.last_name, "")).like(like),
                        func.lower(func.coalesce(DimPerson.person_id, "")).like(like),
                        func.lower(func.coalesce(DimPerson.person_code, "")).like(like),
                        func.lower(func.coalesce(DimPerson.personal_id, "")).like(like),
                        func.lower(
                            func.concat(
                                func.coalesce(DimPerson.first_name, ""),
                                " ",
                                func.coalesce(DimPerson.last_name, ""),
                            )
                        ).like(like),
                    ),
                )
                .limit(limit)
            )
        ).all()

    person_ids = [row.person_id for row in rows]
    roles_map: dict[str, dict[str, list]] = {}
    if person_ids:
        role_rows = (
            await session.execute(
                select(
                    DimPersonRole.person_id,
                    DimRole.role_id,
                    DimRole.role_code,
                    DimRole.role_name,
                )
                .select_from(DimPersonRole)
                .join(DimRole, DimRole.role_id == DimPersonRole.role_id)
                .where(DimPersonRole.person_id.in_(person_ids))
                .order_by(DimPersonRole.person_id.asc(), DimRole.role_id.asc())
            )
        ).all()
        for role_row in role_rows:
            bucket = roles_map.setdefault(
                role_row.person_id, {"role_ids": [], "role_codes": [], "role_names": []}
            )
            if role_row.role_id is not None:
                bucket["role_ids"].append(int(role_row.role_id))
            if role_row.role_code:
                bucket["role_codes"].append(str(role_row.role_code))
            if role_row.role_name:
                bucket["role_names"].append(str(role_row.role_name))

    out: list[PlatformPersonSuggestion] = []
    for row in rows:
        first = (row.first_name or "").strip()
        last = (row.last_name or "").strip()
        full_name = (row.display_name or row.full_name or f"{first} {last}").strip() or row.email
        role_bucket = roles_map.get(row.person_id, {"role_ids": [], "role_codes": [], "role_names": []})
        if not role_bucket["role_ids"] and row.role_id is not None:
            role_bucket = {
                "role_ids": [int(row.role_id)],
                "role_codes": [str(row.role_code)] if row.role_code else [],
                "role_names": [str(row.role_name)] if row.role_name else [],
            }
        out.append(
            PlatformPersonSuggestion(
                person_id=row.person_id,
                person_code=row.person_code,
                full_name=full_name,
                email=row.email,
                role_code=row.role_code,
                role_name=row.role_name,
                role_ids=role_bucket["role_ids"],
                role_codes=role_bucket["role_codes"],
                role_names=role_bucket["role_names"],
            )
        )
    return out


@router.post("/bulk", response_model=BulkUploadResult)
async def bulk_upload_people(
    file: UploadFile = File(...),
    overwrite: bool = Form(default=False),
    replace_all: bool = Form(default=False),
    session: AsyncSession = Depends(get_platform_session),
    _user: UserContext = Depends(require_superadmin()),
):
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing file")
    if replace_all:
        await session.execute(text("SET FOREIGN_KEY_CHECKS=0"))
        await session.execute(text("TRUNCATE TABLE dim_person_role"))
        await session.execute(text("TRUNCATE TABLE dim_person"))
        await session.execute(text("SET FOREIGN_KEY_CHECKS=1"))
        await session.commit()
    raw = await file.read()
    decoded = raw.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(decoded))
    rows = list(reader)
    result = BulkUploadResult(total=len(rows), created=0, updated=0, skipped=0, errors=[])

    next_seq: int | None = None
    used_ids = {(_normalize_row(r).get("person_id") or "").strip() for r in rows}
    used_ids.discard("")
    for idx, row in enumerate(rows, start=2):
        try:
            normalized = _normalize_row(row)
            person_id = normalized.get("person_id")
            if person_id and person_id.isdigit():
                person_id = None
            first_name = (normalized.get("first_name") or "").strip()
            last_name = (normalized.get("last_name") or "").strip()
            email = (normalized.get("email") or "").strip()
            if overwrite:
                if not email:
                    raise ValueError("Missing email (required for overwrite)")
                existing_row = (
                    await session.execute(
                        select(DimPerson).where(func.lower(DimPerson.email) == email.lower())
                    )
                ).first()
                existing = existing_row[0] if existing_row else None
                if existing:
                    if (existing.person_id or "").isdigit() and not person_id:
                        next_seq = await _ensure_next_seq(session, next_seq)
                        seq_value = _consume_next_seq(_build_person_prefix(first_name, last_name), next_seq, used_ids)
                        new_person_id = _format_person_id(first_name, last_name, seq_value)
                        next_seq += 1
                        await session.execute(
                            text("UPDATE dim_person_role SET person_id=:new_id WHERE person_id=:old_id"),
                            {"new_id": new_person_id, "old_id": existing.person_id},
                        )
                        existing.person_id = new_person_id
                    if person_id and existing.person_id != person_id:
                        raise ValueError("person_id does not match existing email")
                    updates = _apply_row_updates(normalized)
                    for key, value in updates.items():
                        setattr(existing, key, value)
                    if "updated_at" not in updates:
                        existing.updated_at = datetime.utcnow()
                    result.updated += 1
                else:
                    create_payload = _apply_row_updates(normalized)
                    if not create_payload.get("person_id"):
                        next_seq = await _ensure_next_seq(session, next_seq)
                        seq_value = _consume_next_seq(_build_person_prefix(first_name, last_name), next_seq, used_ids)
                        create_payload["person_id"] = _format_person_id(first_name, last_name, seq_value)
                        next_seq += 1
                    if not create_payload.get("person_code"):
                        raise ValueError("Missing person_code")
                    if not create_payload.get("first_name"):
                        raise ValueError("Missing first_name")
                    if not create_payload.get("email"):
                        raise ValueError("Missing email")
                    person = DimPerson(**create_payload)
                    if person.created_at is None:
                        person.created_at = datetime.utcnow()
                    if person.updated_at is None:
                        person.updated_at = datetime.utcnow()
                    session.add(person)
                    result.created += 1
            else:
                if not person_id:
                    next_seq = await _ensure_next_seq(session, next_seq)
                    seq_value = _consume_next_seq(_build_person_prefix(first_name, last_name), next_seq, used_ids)
                    person_id = _format_person_id(first_name, last_name, seq_value)
                    next_seq += 1
                existing = await session.get(DimPerson, person_id)
                if existing:
                    result.skipped += 1
                    continue
                create_payload = _apply_row_updates(normalized)
                if not create_payload.get("person_id"):
                    create_payload["person_id"] = person_id
                if not create_payload.get("person_code"):
                    raise ValueError("Missing person_code")
                if not create_payload.get("first_name"):
                    raise ValueError("Missing first_name")
                if not create_payload.get("email"):
                    raise ValueError("Missing email")
                person = DimPerson(**create_payload)
                if person.created_at is None:
                    person.created_at = datetime.utcnow()
                if person.updated_at is None:
                    person.updated_at = datetime.utcnow()
                session.add(person)
                result.created += 1
        except Exception as exc:
            result.errors.append(
                BulkUploadError(
                    row=idx,
                    message=str(exc),
                    person_id=(row.get("person_id") if isinstance(row, dict) else None),
                )
            )

    await session.commit()
    return result


@router.get("/{person_id}", response_model=PlatformPersonOut)
async def get_person(
    person_id: str,
    session: AsyncSession = Depends(get_platform_session),
    _user: UserContext = Depends(require_superadmin()),
):
    row = (
        await session.execute(
            select(DimPerson, DimRole.role_code, DimRole.role_name)
            .select_from(DimPerson)
            .outerjoin(DimRole, DimRole.role_id == DimPerson.role_id)
            .where(DimPerson.person_id == person_id)
        )
    ).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Person not found")
    person, role_code, role_name = row
    return _person_out(person, role_code, role_name)


@router.post("", response_model=PlatformPersonOut, status_code=status.HTTP_201_CREATED)
async def create_person(
    payload: PlatformPersonCreate,
    session: AsyncSession = Depends(get_platform_session),
    _user: UserContext = Depends(require_superadmin()),
):
    person_id = (payload.person_id or "").strip() or None
    if person_id and person_id.isdigit():
        person_id = None
    if not person_id:
        person_id = await _generate_person_id(session, payload.first_name, payload.last_name)
    existing = await session.get(DimPerson, person_id)
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="person_id already exists")
    person = DimPerson(**payload.model_dump(exclude={"person_id"}), person_id=person_id)
    if person.created_at is None:
        person.created_at = datetime.utcnow()
    if person.updated_at is None:
        person.updated_at = datetime.utcnow()
    session.add(person)
    await session.commit()
    await session.refresh(person)
    role_code, role_name = await _role_meta(session, person.role_id)
    return _person_out(person, role_code, role_name)


@router.patch("/{person_id}", response_model=PlatformPersonOut)
async def update_person(
    person_id: str,
    payload: PlatformPersonUpdate,
    session: AsyncSession = Depends(get_platform_session),
    _user: UserContext = Depends(require_superadmin()),
):
    person = await session.get(DimPerson, person_id)
    if not person:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Person not found")
    updates = _clean_update_payload(payload)
    for key, value in updates.items():
        setattr(person, key, value)
    if "updated_at" not in updates:
        person.updated_at = datetime.utcnow()
    await session.commit()
    await session.refresh(person)
    role_code, role_name = await _role_meta(session, person.role_id)
    return _person_out(person, role_code, role_name)


@router.delete("/{person_id}", status_code=status.HTTP_200_OK)
async def delete_person(
    person_id: str,
    session: AsyncSession = Depends(get_platform_session),
    _user: UserContext = Depends(require_superadmin()),
):
    person = await session.get(DimPerson, person_id)
    if not person:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Person not found")
    person.is_deleted = 1
    person.updated_at = datetime.utcnow()
    await session.commit()
    return {"person_id": person_id, "is_deleted": 1}


async def _role_meta(session: AsyncSession, role_id: int | None) -> tuple[str | None, str | None]:
    if role_id is None:
        return None, None
    row = (
        await session.execute(
            select(DimRole.role_code, DimRole.role_name).where(DimRole.role_id == role_id)
        )
    ).first()
    if not row:
        return None, None
    return row[0], row[1]


def _person_out(person: DimPerson, role_code: str | None, role_name: str | None) -> PlatformPersonOut:
    return PlatformPersonOut(
        person_id=person.person_id,
        person_code=person.person_code,
        personal_id=person.personal_id,
        first_name=person.first_name,
        last_name=person.last_name,
        email=person.email,
        mobile_number=person.mobile_number,
        role_id=person.role_id,
        grade_id=person.grade_id,
        department_id=person.department_id,
        manager_id=person.manager_id,
        employment_type=person.employment_type,
        join_date=person.join_date,
        exit_date=person.exit_date,
        status=person.status,
        is_deleted=person.is_deleted,
        created_at=person.created_at,
        updated_at=person.updated_at,
        source_system=person.source_system,
        full_name=person.full_name,
        display_name=person.display_name,
        role_code=role_code,
        role_name=role_name,
    )


def _clean_update_payload(payload: PlatformPersonUpdate) -> dict:
    updates = payload.model_dump(exclude_unset=True)
    return _coerce_payload(updates)


def _normalize_row(row: dict[str, str | None]) -> dict[str, str | None]:
    normalized: dict[str, str | None] = {}
    for key, value in row.items():
        if key is None:
            continue
        norm_key = key.strip().lower().replace(" ", "_")
        normalized[norm_key] = value.strip() if isinstance(value, str) else value
    return normalized


def _apply_row_updates(normalized: dict[str, str | None]) -> dict:
    fields = {
        "person_id",
        "person_code",
        "personal_id",
        "first_name",
        "last_name",
        "email",
        "mobile_number",
        "role_id",
        "grade_id",
        "department_id",
        "manager_id",
        "employment_type",
        "join_date",
        "exit_date",
        "status",
        "is_deleted",
        "created_at",
        "updated_at",
        "source_system",
        "full_name",
        "display_name",
    }
    updates = {k: normalized.get(k) for k in fields if k in normalized}
    coerced = _coerce_payload(updates)
    if coerced.get("person_id") is None:
        coerced.pop("person_id", None)
    return coerced


def _coerce_payload(payload: dict) -> dict:
    out: dict = {}
    for key, value in payload.items():
        if isinstance(value, str):
            trimmed = value.strip()
            if trimmed == "":
                value = None
            else:
                value = trimmed
        if key in {"role_id", "grade_id", "department_id"}:
            out[key] = _parse_int(value, key)
        elif key in {"is_deleted"}:
            out[key] = _parse_bool_int(value)
        elif key in {"join_date", "exit_date"}:
            out[key] = _parse_date(value, key)
        elif key in {"created_at", "updated_at"}:
            out[key] = _parse_datetime(value, key)
        else:
            out[key] = value
    status = (out.get("status") or "").strip().lower() if isinstance(out.get("status"), str) else out.get("status")
    if status == "relieved":
        out["role_id"] = 0
    return out


def _parse_int(value: object, field: str) -> int | None:
    if value is None:
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.isdigit():
        return int(value)
    raise ValueError(f"Invalid {field}")


def _parse_bool_int(value: object) -> int | None:
    if value is None:
        return None
    if isinstance(value, int):
        return 1 if value else 0
    if isinstance(value, str):
        raw = value.strip().lower()
        if raw in {"1", "true", "yes"}:
            return 1
        if raw in {"0", "false", "no"}:
            return 0
    raise ValueError("Invalid is_deleted")


def _parse_date(value: object, field: str) -> date | None:
  if value is None:
    return None
  if isinstance(value, date) and not isinstance(value, datetime):
    return value
  if isinstance(value, str):
    raw = value.strip()
    if not raw:
      return None
    try:
      return date.fromisoformat(raw)
    except ValueError:
      for fmt in ("%d-%b-%y", "%d-%b-%Y", "%d-%m-%y", "%d-%m-%Y", "%d/%m/%y", "%d/%m/%Y"):
        try:
          return datetime.strptime(raw, fmt).date()
        except ValueError:
          continue
      raise
  raise ValueError(f"Invalid {field}")


def _parse_datetime(value: object, field: str) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        return datetime.fromisoformat(value)
    raise ValueError(f"Invalid {field}")


def _build_person_prefix(first_name: str | None, last_name: str | None) -> str:
    first = (first_name or "").strip()
    last = (last_name or "").strip()
    if first and last:
        return f"{_first_letter(first)}{_first_letter(last)}"
    if first:
        return f"{_first_letter(first)}{_second_letter_or(first, 'X')}"
    return "XX"


def _first_letter(value: str) -> str:
    for ch in value:
        if ch.isalpha():
            return ch.upper()
    return "X"


def _second_letter_or(value: str, fallback: str) -> str:
    letters = [ch.upper() for ch in value if ch.isalpha()]
    if len(letters) >= 2:
        return letters[1]
    return fallback


async def _generate_person_id(session: AsyncSession, first_name: str | None, last_name: str | None) -> str:
    next_seq = await _ensure_next_seq(session, None)
    return _format_person_id(first_name, last_name, next_seq)


async def _ensure_next_seq(session: AsyncSession, current: int | None) -> int:
    if current is not None:
        return current
    pattern = r"^[A-Z]{2}_[0-9]+$"
    max_row = (
        await session.execute(
            select(
                func.max(
                    func.cast(
                        func.substr(DimPerson.person_id, func.instr(DimPerson.person_id, "_") + 1, 10),
                        Integer,
                    )
                )
            ).where(DimPerson.person_id.op("REGEXP")(pattern))
        )
    ).first()
    max_value = max_row[0] if max_row and max_row[0] is not None else 0
    return int(max_value) + 1


def _format_person_id(first_name: str | None, last_name: str | None, seq: int) -> str:
    prefix = _build_person_prefix(first_name, last_name)
    return f"{prefix}_{str(seq).zfill(3)}"


def _consume_next_seq(prefix: str, seq: int, used_ids: set[str]) -> int:
    while True:
        candidate = f"{prefix}_{str(seq).zfill(3)}"
        if candidate not in used_ids:
            used_ids.add(candidate)
            return seq
        seq += 1
