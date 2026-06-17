from __future__ import annotations

import io
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    get_db_session,
    get_platform_db_session,
    require_platform_superadmin,
)
from app.models.people import EmployeeCompliance, EmployeeExt, LicenseAssignment, SystemInventory
from app.models.platform_person import DimPerson
from app.schemas.employee import (
    AddressPatch,
    AuditLogItem,
    AuditLogResponse,
    ComplianceSection,
    CompliancePatch,
    EmployeeCreate,
    EmployeeListResponse,
    EmployeeProfile,
    ExitPatch,
    IdentityPatch,
    PersonalPatch,
    PolicyPatch,
    StatusPatch,
    WorkInfoPatch,
)
from app.models.people import (
    EmployeeAuditLog,
    EmployeeHr,
    EmployeePolicy,
    EmployeeWorkInfo,
)
from app.schemas.user import UserContext
from app.services import employee_writes, employees
from app.services import audit as audit_service

router = APIRouter(prefix="/ppl/employees", tags=["employees"])


def _client_ip(request: Request) -> Optional[str]:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else None


def _split_name(full_name: str) -> tuple[str, str | None]:
    parts = [p for p in full_name.strip().split() if p]
    if not parts:
        return "", None
    return parts[0], " ".join(parts[1:]) or None


# ── List ──────────────────────────────────────────────────────────────────────
@router.get("", response_model=EmployeeListResponse)
async def list_employees(
    status: str = Query("working"),
    department: Optional[str] = None,
    business_unit: Optional[str] = None,
    worker_type: Optional[str] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=500),
    user: UserContext = Depends(require_platform_superadmin),
    db: AsyncSession = Depends(get_db_session),
    platform: AsyncSession = Depends(get_platform_db_session),
) -> EmployeeListResponse:
    items, total = await employees.list_employees(
        db,
        platform,
        status=status,
        department=department,
        business_unit=business_unit,
        worker_type=worker_type,
        search=search,
        page=page,
        limit=limit,
    )
    return EmployeeListResponse(items=items, total=total, page=page, limit=limit)


# ── Export (must precede /{id}) ───────────────────────────────────────────────
@router.get("/export")
async def export_employees(
    status: str = Query("all"),
    department: Optional[str] = None,
    business_unit: Optional[str] = None,
    worker_type: Optional[str] = None,
    search: Optional[str] = None,
    user: UserContext = Depends(require_platform_superadmin),
    db: AsyncSession = Depends(get_db_session),
    platform: AsyncSession = Depends(get_platform_db_session),
) -> StreamingResponse:
    from openpyxl import Workbook

    # Pull all matching rows (cap high — directory scale is ~524).
    items, _ = await employees.list_employees(
        db, platform,
        status=status, department=department, business_unit=business_unit,
        worker_type=worker_type, search=search, page=1, limit=10000,
    )

    wb = Workbook()
    ws = wb.active
    ws.title = "Employees"
    headers = [
        "Employee Number", "Full Name", "Email", "Mobile", "Department",
        "Sub Department", "Business Unit", "Job Title", "Worker Type",
        "Status", "Date Joined", "Exit Date",
    ]
    ws.append(headers)
    for it in items:
        ws.append([
            it.employee_number, it.full_name or "", it.email or "", it.mobile_number or "",
            it.department or "", it.sub_department or "", it.business_unit or "",
            it.job_title or "", it.worker_type, it.employment_status,
            it.date_joined.isoformat() if it.date_joined else "",
            it.exit_date.isoformat() if it.exit_date else "",
        ])

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="employees.xlsx"'},
    )


# ── Create ────────────────────────────────────────────────────────────────────
@router.post("", status_code=status.HTTP_201_CREATED)
async def create_employee(
    body: EmployeeCreate,
    user: UserContext = Depends(require_platform_superadmin),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    exists = (
        await db.execute(
            select(EmployeeExt.id).where(EmployeeExt.employee_number == body.employee_number)
        )
    ).scalar_one_or_none()
    if exists:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="employee_number already exists")

    ext = EmployeeExt(
        employee_number=body.employee_number,
        person_id=body.person_id,
        worker_type=body.worker_type,
        employment_status=body.employment_status,
        time_type=body.time_type,
        created_by_person_id=user.person_id_platform,
        updated_by_person_id=user.person_id_platform,
    )
    db.add(ext)
    await db.flush()
    if any([body.job_title, body.department, body.business_unit, body.date_joined]):
        db.add(
            EmployeeWorkInfo(
                employee_id=ext.id,
                job_title=body.job_title,
                department=body.department,
                business_unit=body.business_unit,
                date_joined=body.date_joined,
            )
        )
    await db.commit()
    return {"id": ext.id, "employee_number": ext.employee_number}


# ── Full profile ──────────────────────────────────────────────────────────────
@router.get("/{employee_id}", response_model=EmployeeProfile)
async def get_employee(
    employee_id: str,
    request: Request,
    user: UserContext = Depends(require_platform_superadmin),
    db: AsyncSession = Depends(get_db_session),
    platform: AsyncSession = Depends(get_platform_db_session),
) -> EmployeeProfile:
    result = await employees.get_profile(db, platform, employee_id)
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    profile, _ext = result

    # Compliance is admin-only; reading it is itself an audited event.
    if user.is_admin:
        comp_row = await db.get(EmployeeCompliance, employee_id)
        has_any = comp_row is not None and any(
            [comp_row.pan_enc, comp_row.aadhaar_enc, comp_row.pf_number_enc, comp_row.uan_number_enc]
        )
        profile.compliance_available = has_any
        if has_any:
            values = employee_writes.read_compliance(comp_row)
            profile.compliance = ComplianceSection(**values)
            audit_service.record_event(
                db,
                employee_id=employee_id,
                section="compliance",
                field_name="compliance_viewed",
                performed_by_person_id=user.person_id_platform or user.email,
                ip_address=_client_ip(request),
            )
            await db.commit()
    return profile


# ── Audit log ─────────────────────────────────────────────────────────────────
@router.get("/{employee_id}/audit_log", response_model=AuditLogResponse)
async def get_audit_log(
    employee_id: str,
    section: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    user: UserContext = Depends(require_platform_superadmin),
    db: AsyncSession = Depends(get_db_session),
) -> AuditLogResponse:
    from sqlalchemy import func

    base = select(EmployeeAuditLog).where(EmployeeAuditLog.employee_id == employee_id)
    if section:
        base = base.where(EmployeeAuditLog.section == section)
    # Non-admins never see compliance audit entries.
    if not user.is_admin:
        base = base.where(EmployeeAuditLog.section != "compliance")

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    rows = (
        await db.execute(
            base.order_by(EmployeeAuditLog.performed_at.desc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
    ).scalars().all()
    items = [
        AuditLogItem(
            id=r.id, section=r.section, field_name=r.field_name,
            old_value=r.old_value, new_value=r.new_value,
            performed_by_person_id=r.performed_by_person_id,
            performed_at=r.performed_at, ip_address=r.ip_address,
        )
        for r in rows
    ]
    return AuditLogResponse(items=items, total=total, page=page, limit=limit)


# ── Helpers for mutating routes ───────────────────────────────────────────────
async def _load_ext(db: AsyncSession, employee_id: str) -> EmployeeExt:
    ext = (
        await db.execute(
            select(EmployeeExt).where(
                EmployeeExt.id == employee_id, EmployeeExt.is_deleted.is_(False)
            )
        )
    ).scalar_one_or_none()
    if not ext:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    return ext


# ── PATCH sections ────────────────────────────────────────────────────────────
@router.patch("/{employee_id}/identity")
async def patch_identity(
    employee_id: str, body: IdentityPatch, request: Request,
    user: UserContext = Depends(require_platform_superadmin),
    db: AsyncSession = Depends(get_db_session),
    platform: AsyncSession = Depends(get_platform_db_session),
) -> dict:
    ext = await _load_ext(db, employee_id)
    if not ext.person_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Employee is not linked to platform identity")
    person = await platform.get(DimPerson, ext.person_id)
    if not person:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Platform person not found")

    changes = body.model_dump(exclude_unset=True)
    if "full_name" in changes and changes["full_name"]:
        first, last = _split_name(str(changes["full_name"]))
        changes.setdefault("first_name", first)
        changes.setdefault("last_name", last)
        changes.setdefault("display_name", changes["full_name"])
    if "email" in changes and changes["email"] is not None:
        changes["email"] = str(changes["email"]).strip().lower()
        if changes["email"]:
            existing = (
                await platform.execute(
                    select(DimPerson.person_id).where(
                        func.lower(DimPerson.email) == changes["email"],
                        DimPerson.person_id != person.person_id,
                    )
                )
            ).scalar_one_or_none()
            if existing:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already belongs to another person")

    current = {field: getattr(person, field, None) for field in changes}
    diffs = audit_service.diff_fields(current, changes)
    if not diffs:
        return {"updated_fields": 0}

    old_email = (person.email or "").strip().lower()
    for field, value in changes.items():
        setattr(person, field, value)

    new_email = str(changes.get("email") or "").strip().lower()
    if new_email and new_email != old_email:
        await db.execute(
            LicenseAssignment.__table__.update()
            .where(func.lower(LicenseAssignment.work_email) == old_email)
            .values(work_email=new_email)
        )
        await db.execute(
            SystemInventory.__table__.update()
            .where(func.lower(SystemInventory.assigned_email) == old_email)
            .values(assigned_email=new_email)
        )

    count = audit_service.record_changes(
        db,
        employee_id=employee_id,
        section="identity",
        diffs=diffs,
        performed_by_person_id=user.person_id_platform or user.email,
        ip_address=_client_ip(request),
    )
    await platform.commit()
    await db.commit()
    return {"updated_fields": count}


@router.patch("/{employee_id}/profile")
async def patch_profile(
    employee_id: str, body: PersonalPatch, request: Request,
    user: UserContext = Depends(require_platform_superadmin), db: AsyncSession = Depends(get_db_session),
) -> dict:
    await _load_ext(db, employee_id)
    changed = await employee_writes.update_simple_section(
        db, model=EmployeeHr, section="profile", employee_id=employee_id,
        changes=body.model_dump(exclude_unset=True),
        actor=user.person_id_platform or user.email, ip=_client_ip(request),
    )
    await db.commit()
    return {"updated_fields": changed}


@router.patch("/{employee_id}/work_info")
async def patch_work_info(
    employee_id: str, body: WorkInfoPatch, request: Request,
    user: UserContext = Depends(require_platform_superadmin), db: AsyncSession = Depends(get_db_session),
) -> dict:
    await _load_ext(db, employee_id)
    changed = await employee_writes.update_work_info(
        db, employee_id=employee_id, changes=body.model_dump(exclude_unset=True),
        actor=user.person_id_platform or user.email, ip=_client_ip(request),
    )
    await db.commit()
    return {"updated_fields": changed}


@router.patch("/{employee_id}/address")
async def patch_address(
    employee_id: str, body: AddressPatch, request: Request,
    user: UserContext = Depends(require_platform_superadmin), db: AsyncSession = Depends(get_db_session),
) -> dict:
    await _load_ext(db, employee_id)
    # Only touch the address types the caller actually sent.
    blocks: dict[str, dict] = {}
    if body.current is not None:
        blocks["current"] = body.current.model_dump(exclude_unset=True)
    if body.permanent is not None:
        blocks["permanent"] = body.permanent.model_dump(exclude_unset=True)
    changed = await employee_writes.update_addresses(
        db, employee_id=employee_id, blocks=blocks,
        actor=user.person_id_platform or user.email, ip=_client_ip(request),
    )
    await db.commit()
    return {"updated_fields": changed}


@router.patch("/{employee_id}/policy")
async def patch_policy(
    employee_id: str, body: PolicyPatch, request: Request,
    user: UserContext = Depends(require_platform_superadmin), db: AsyncSession = Depends(get_db_session),
) -> dict:
    await _load_ext(db, employee_id)
    changed = await employee_writes.update_simple_section(
        db, model=EmployeePolicy, section="policy", employee_id=employee_id,
        changes=body.model_dump(exclude_unset=True),
        actor=user.person_id_platform or user.email, ip=_client_ip(request),
    )
    await db.commit()
    return {"updated_fields": changed}


@router.patch("/{employee_id}/compliance")
async def patch_compliance(
    employee_id: str, body: CompliancePatch, request: Request,
    user: UserContext = Depends(require_platform_superadmin), db: AsyncSession = Depends(get_db_session),
) -> dict:
    await _load_ext(db, employee_id)
    changed = await employee_writes.update_compliance(
        db, employee_id=employee_id, changes=body.model_dump(exclude_unset=True),
        actor=user.person_id_platform or user.email, ip=_client_ip(request),
    )
    await db.commit()
    return {"updated_fields": changed}


@router.patch("/{employee_id}/exit")
async def patch_exit(
    employee_id: str, body: ExitPatch, request: Request,
    user: UserContext = Depends(require_platform_superadmin), db: AsyncSession = Depends(get_db_session),
) -> dict:
    ext = await _load_ext(db, employee_id)
    changed = await employee_writes.update_exit(
        db, ext=ext,
        changes=body.model_dump(exclude_unset=True),
        actor=user.person_id_platform or user.email, ip=_client_ip(request),
    )
    await db.commit()
    return {"updated_fields": changed}


@router.patch("/{employee_id}/status")
async def patch_status(
    employee_id: str, body: StatusPatch, request: Request,
    user: UserContext = Depends(require_platform_superadmin), db: AsyncSession = Depends(get_db_session),
) -> dict:
    ext = await _load_ext(db, employee_id)
    changed = await employee_writes.update_status(
        db, ext=ext, employment_status=body.employment_status, exit_date=body.exit_date,
        actor=user.person_id_platform or user.email, ip=_client_ip(request),
    )
    await db.commit()
    return {"updated": bool(changed)}


@router.delete("/{employee_id}", status_code=status.HTTP_200_OK)
async def delete_employee(
    employee_id: str, request: Request,
    user: UserContext = Depends(require_platform_superadmin), db: AsyncSession = Depends(get_db_session),
) -> dict:
    ext = await _load_ext(db, employee_id)
    await employee_writes.soft_delete(
        db, ext=ext, actor=user.person_id_platform or user.email, ip=_client_ip(request)
    )
    await db.commit()
    return {"deleted": True}
