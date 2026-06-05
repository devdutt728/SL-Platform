"""Employee read/query service.

sl_people and sl_platform are separate MySQL databases. Rather than rely on a
cross-database SQL join (fragile if the two ever move apart), we query employee
rows from sl_people, then batch-resolve identity from dim_person keyed on
person_code == employee_number, and merge in Python.
"""

from __future__ import annotations

from typing import Optional

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.people import (
    EmployeeAddress,
    EmployeeExt,
    EmployeeHr,
    EmployeePolicy,
    EmployeeWorkInfo,
)
from app.models.platform_person import DimPerson
from app.schemas.employee import (
    AddressBlock,
    AddressSection,
    EmployeeListItem,
    EmployeeProfile,
    ExitSection,
    ExtSection,
    IdentitySection,
    PersonalSection,
    PolicySection,
    WorkInfoSection,
)

STATUS_ALIASES = {
    "working": "working",
    "active": "working",
    "relieved": "relieved",
    "exited": "relieved",
    "terminated": "terminated",
}

PLATFORM_STATUS_ALIASES = {
    "working": "Working",
    "active": "Working",
    "relieved": "Relieved",
    "exited": "Relieved",
    "terminated": "Terminated",
}


def _status_from_platform(dp: DimPerson) -> str:
    value = (dp.status or "").strip().lower()
    if value == "working":
        return "working"
    if value == "relieved":
        return "relieved"
    if value == "terminated":
        return "terminated"
    return "working" if not dp.is_deleted else "relieved"


def _worker_type_from_platform(dp: DimPerson) -> str:
    value = (dp.employment_type or "").strip().lower().replace(" ", "_")
    return value or "permanent"


def _platform_name(dp: DimPerson) -> Optional[str]:
    return dp.full_name or dp.display_name


def _value(*values):
    for value in values:
        if value is not None and value != "":
            return value
    return None


def _platform_bool(value) -> Optional[bool]:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "y"}


def _platform_list_item(dp: DimPerson) -> EmployeeListItem:
    return EmployeeListItem(
        id=dp.person_id,
        employee_number=dp.person_code,
        person_id=dp.person_id,
        full_name=_platform_name(dp),
        display_name=dp.display_name,
        email=dp.email,
        mobile_number=dp.mobile_number,
        employment_status=_status_from_platform(dp),
        worker_type=_worker_type_from_platform(dp),
        department=dp.department,
        sub_department=dp.sub_department,
        business_unit=dp.business_unit,
        job_title=dp.job_title,
        date_joined=dp.join_date,
        exit_date=dp.exit_date,
    )


async def _employee_ext_count(people_session: AsyncSession) -> int:
    return (
        await people_session.execute(
            select(func.count()).select_from(EmployeeExt).where(EmployeeExt.is_deleted.is_(False))
        )
    ).scalar_one()


async def _list_platform_people(
    platform_session: AsyncSession,
    *,
    status: str = "working",
    department: Optional[str] = None,
    business_unit: Optional[str] = None,
    worker_type: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
) -> tuple[list[EmployeeListItem], int]:
    base = (
        select(DimPerson)
        .where(DimPerson.person_code.is_not(None))
        .where(or_(DimPerson.full_name.is_(None), DimPerson.full_name != "Dummy Employee"))
    )

    norm_status = PLATFORM_STATUS_ALIASES.get((status or "").strip().lower())
    if status and status.lower() != "all" and norm_status:
        base = base.where(DimPerson.status == norm_status)
        if norm_status == "Working":
            base = base.where(or_(DimPerson.is_deleted == 0, DimPerson.is_deleted.is_(None)))

    if department:
        base = base.where(DimPerson.department == department)
    if worker_type:
        base = base.where(DimPerson.employment_type == worker_type)
    # dim_person has no business_unit column; leave this filter to employee_work_info.
    if business_unit:
        return [], 0

    if search and search.strip():
        term = f"%{search.strip()}%"
        base = base.where(
            or_(
                DimPerson.full_name.like(term),
                DimPerson.display_name.like(term),
                DimPerson.email.like(term),
                DimPerson.person_code.like(term),
            )
        )

    total = (await platform_session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    rows = (
        await platform_session.execute(
            base.order_by(DimPerson.person_code.asc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
    ).scalars().all()
    return [_platform_list_item(dp) for dp in rows], total


async def _resolve_identities(
    platform_session: AsyncSession, employee_numbers: list[str]
) -> dict[str, DimPerson]:
    """Map employee_number -> DimPerson via person_code (batch)."""
    if not employee_numbers:
        return {}
    rows = (
        await platform_session.execute(
            select(DimPerson).where(DimPerson.person_code.in_(employee_numbers))
        )
    ).scalars().all()
    return {dp.person_code: dp for dp in rows if dp.person_code}


async def list_employees(
    people_session: AsyncSession,
    platform_session: AsyncSession,
    *,
    status: str = "working",
    department: Optional[str] = None,
    business_unit: Optional[str] = None,
    worker_type: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
) -> tuple[list[EmployeeListItem], int]:
    page = max(1, page)
    limit = max(1, min(limit, 500))

    if await _employee_ext_count(people_session) == 0:
        return await _list_platform_people(
            platform_session,
            status=status,
            department=department,
            business_unit=business_unit,
            worker_type=worker_type,
            search=search,
            page=page,
            limit=limit,
        )

    base = (
        select(EmployeeExt, EmployeeWorkInfo)
        .outerjoin(EmployeeWorkInfo, EmployeeWorkInfo.employee_id == EmployeeExt.id)
        .where(EmployeeExt.is_deleted.is_(False))
    )

    norm_status = STATUS_ALIASES.get((status or "").strip().lower())
    if status and status.lower() != "all" and norm_status:
        base = base.where(EmployeeExt.employment_status == norm_status)
    if department:
        base = base.where(EmployeeWorkInfo.department == department)
    if business_unit:
        base = base.where(EmployeeWorkInfo.business_unit == business_unit)
    if worker_type:
        base = base.where(EmployeeExt.worker_type == worker_type)

    # Search across employee_number locally; name/email come from dim_person, so
    # we resolve those candidates separately and union the employee_numbers.
    search_numbers: Optional[set[str]] = None
    if search and search.strip():
        term = f"%{search.strip()}%"
        id_rows = (
            await platform_session.execute(
                select(DimPerson.person_code).where(
                    or_(
                        DimPerson.full_name.like(term),
                        DimPerson.display_name.like(term),
                        DimPerson.email.like(term),
                        DimPerson.person_code.like(term),
                    )
                )
            )
        ).scalars().all()
        search_numbers = {n for n in id_rows if n}
        base = base.where(
            or_(
                EmployeeExt.employee_number.like(term),
                EmployeeExt.employee_number.in_(search_numbers or {"__none__"}),
            )
        )

    count_stmt = select(func.count()).select_from(base.subquery())
    total = (await people_session.execute(count_stmt)).scalar_one()

    rows = (
        await people_session.execute(
            base.order_by(EmployeeExt.employee_number.asc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
    ).all()

    numbers = [ext.employee_number for ext, _ in rows]
    identities = await _resolve_identities(platform_session, numbers)

    items: list[EmployeeListItem] = []
    for ext, work in rows:
        dp = identities.get(ext.employee_number)
        items.append(
            EmployeeListItem(
                id=ext.id,
                employee_number=ext.employee_number,
                person_id=ext.person_id,
                full_name=(dp.full_name or dp.display_name) if dp else None,
                display_name=dp.display_name if dp else None,
                email=dp.email if dp else None,
                mobile_number=dp.mobile_number if dp else None,
                employment_status=ext.employment_status,
                worker_type=ext.worker_type,
                department=work.department if work else None,
                sub_department=work.sub_department if work else None,
                business_unit=work.business_unit if work else None,
                job_title=work.job_title if work else None,
                date_joined=work.date_joined if work else None,
                exit_date=work.exit_date if work else None,
            )
        )
    return items, total


async def _manager_lookup(
    people_session: AsyncSession,
    platform_session: AsyncSession,
    manager_id: Optional[str],
) -> tuple[Optional[str], Optional[str]]:
    """(manager_employee_number, manager_display_name) for a reporting_manager_id."""
    if not manager_id:
        return None, None
    mgr = (
        await people_session.execute(
            select(EmployeeExt.employee_number).where(EmployeeExt.id == manager_id)
        )
    ).scalar_one_or_none()
    if not mgr:
        return None, None
    ident = await _resolve_identities(platform_session, [mgr])
    dp = ident.get(mgr)
    return mgr, ((dp.full_name or dp.display_name) if dp else None)


async def get_profile(
    people_session: AsyncSession,
    platform_session: AsyncSession,
    employee_id: str,
) -> Optional[tuple[EmployeeProfile, Optional[EmployeeExt]]]:
    """Full 7-section profile (compliance attached separately by the route)."""
    ext = (
        await people_session.execute(
            select(EmployeeExt).where(
                EmployeeExt.id == employee_id, EmployeeExt.is_deleted.is_(False)
            )
        )
    ).scalar_one_or_none()
    if not ext:
        if await _employee_ext_count(people_session) == 0:
            return await _get_platform_profile(platform_session, employee_id)
        return None

    hr = await people_session.get(EmployeeHr, employee_id)
    work = await people_session.get(EmployeeWorkInfo, employee_id)
    policy = await people_session.get(EmployeePolicy, employee_id)
    addr_rows = (
        await people_session.execute(
            select(EmployeeAddress).where(EmployeeAddress.employee_id == employee_id)
        )
    ).scalars().all()
    addr_by_type = {a.address_type: a for a in addr_rows}

    identities = await _resolve_identities(platform_session, [ext.employee_number])
    dp = identities.get(ext.employee_number)

    mgr_number, mgr_name = await _manager_lookup(
        people_session, platform_session, work.reporting_manager_id if work else None
    )

    def addr_block(kind: str) -> AddressBlock:
        a = addr_by_type.get(kind)
        prefix = f"{kind}_address"
        return AddressBlock(
            line1=_value(a.line1 if a else None, getattr(dp, f"{prefix}_line_1", None)),
            line2=_value(a.line2 if a else None, getattr(dp, f"{prefix}_line_2", None)),
            city=_value(a.city if a else None, getattr(dp, f"{prefix}_city", None)),
            state=_value(a.state if a else None, getattr(dp, f"{prefix}_state", None)),
            zip=_value(a.zip if a else None, getattr(dp, f"{prefix}_zip", None)),
            country=_value(a.country if a else None, getattr(dp, f"{prefix}_country", None)),
        )

    profile = EmployeeProfile(
        id=ext.id,
        identity=IdentitySection(
            person_id=ext.person_id,
            person_code=dp.person_code if dp else ext.employee_number,
            first_name=dp.first_name if dp else None,
            last_name=dp.last_name if dp else None,
            full_name=(dp.full_name or dp.display_name) if dp else None,
            display_name=dp.display_name if dp else None,
            email=dp.email if dp else None,
            mobile_number=dp.mobile_number if dp else None,
            platform_status=dp.status if dp else None,
        ),
        ext=ExtSection(
            employee_number=ext.employee_number,
            legacy_number=ext.legacy_number,
            attendance_number=_value(ext.attendance_number, dp.attendance_number if dp else None),
            employment_status=ext.employment_status,
            worker_type=ext.worker_type,
            time_type=_value(ext.time_type, dp.time_type if dp else None) or "fulltime",
        ),
        personal=PersonalSection(
            middle_name=_value(hr.middle_name if hr else None, dp.middle_name if dp else None),
            personal_email=_value(hr.personal_email if hr else None, dp.personal_email if dp else None),
            work_phone=_value(hr.work_phone if hr else None, dp.work_phone if dp else None),
            home_phone=_value(hr.home_phone if hr else None, dp.home_phone if dp else None),
            date_of_birth=_value(hr.date_of_birth if hr else None, dp.date_of_birth if dp else None),
            gender=_value(hr.gender if hr else None, dp.gender if dp else None),
            marital_status=_value(hr.marital_status if hr else None, dp.marital_status if dp else None),
            marriage_date=_value(hr.marriage_date if hr else None, dp.marriage_date if dp else None),
            blood_group=_value(hr.blood_group if hr else None, dp.blood_group if dp else None),
            physically_handicapped=_value(
                hr.physically_handicapped if hr else None,
                _platform_bool(dp.physically_handicapped) if dp else None,
            ),
            nationality=_value(hr.nationality if hr else None, dp.nationality if dp else None),
            father_name=_value(hr.father_name if hr else None, dp.father_name if dp else None),
            mother_name=_value(hr.mother_name if hr else None, dp.mother_name if dp else None),
            spouse_name=_value(hr.spouse_name if hr else None, dp.spouse_name if dp else None),
            children_names=_value(hr.children_names if hr else None, dp.children_names if dp else None),
        ),
        address=AddressSection(current=addr_block("current"), permanent=addr_block("permanent")),
        work_info=WorkInfoSection(
            location=_value(work.location if work else None, dp.location if dp else None),
            location_country=_value(work.location_country if work else None, dp.location_country if dp else None),
            legal_entity=_value(work.legal_entity if work else None, dp.legal_entity if dp else None),
            business_unit=_value(work.business_unit if work else None, dp.business_unit if dp else None),
            department=_value(work.department if work else None, dp.department if dp else None),
            sub_department=_value(work.sub_department if work else None, dp.sub_department if dp else None),
            job_title=_value(work.job_title if work else None, dp.job_title if dp else None),
            secondary_job_title=_value(
                work.secondary_job_title if work else None, dp.secondary_job_title if dp else None
            ),
            reporting_manager_id=work.reporting_manager_id if work else None,
            reporting_manager_name=_value(mgr_name, dp.reporting_to if dp else None),
            reporting_manager_number=_value(mgr_number, dp.manager_id if dp else None),
            dotted_line_manager_id=work.dotted_line_manager_id if work else None,
            date_joined=_value(work.date_joined if work else None, dp.join_date if dp else None),
            exit_date=_value(work.exit_date if work else None, dp.exit_date if dp else None),
            notice_period=_value(work.notice_period if work else None, dp.notice_period if dp else None),
            band=_value(work.band if work else None, dp.band if dp else None),
            pay_grade=_value(work.pay_grade if work else None, dp.pay_grade if dp else None),
            cost_center=_value(work.cost_center if work else None, dp.cost_center if dp else None),
        ),
        policy=PolicySection(
            leave_plan=_value(policy.leave_plan if policy else None, dp.leave_plan if dp else None),
            shift_policy=_value(policy.shift_policy if policy else None, dp.shift_policy_name if dp else None),
            weekly_off_policy=_value(
                policy.weekly_off_policy if policy else None, dp.weekly_off_policy_name if dp else None
            ),
            attendance_tracking_policy=_value(
                policy.attendance_tracking_policy if policy else None,
                dp.attendance_time_tracking_policy if dp else None,
            ),
            attendance_capture_scheme=_value(
                policy.attendance_capture_scheme if policy else None,
                dp.attendance_capture_scheme if dp else None,
            ),
            holiday_list=_value(policy.holiday_list if policy else None, dp.holiday_list_name if dp else None),
            expense_policy=_value(policy.expense_policy if policy else None, dp.expense_policy_name if dp else None),
        ),
        exit=ExitSection(
            exit_status=_value(ext.exit_status, dp.exit_status if dp else None),
            termination_type=_value(
                ext.termination_type, dp.termination_type if dp else None
            ),
            termination_reason=_value(
                ext.termination_reason, dp.termination_reason if dp else None
            ),
            resignation_note=_value(
                ext.resignation_note, dp.resignation_note if dp else None
            ),
            comments=_value(ext.exit_comments, dp.comments if dp else None),
        ),
    )
    return profile, ext


async def _get_platform_profile(
    platform_session: AsyncSession,
    employee_id: str,
) -> Optional[tuple[EmployeeProfile, None]]:
    dp = (
        await platform_session.execute(
            select(DimPerson).where(
                or_(
                    DimPerson.person_id == employee_id,
                    DimPerson.person_code == employee_id,
                )
            )
        )
    ).scalar_one_or_none()
    if not dp:
        return None

    manager_name = None
    manager_number = dp.manager_id
    if manager_number:
        manager = (
            await platform_session.execute(
                select(DimPerson).where(DimPerson.person_code == manager_number)
            )
        ).scalar_one_or_none()
        manager_name = _platform_name(manager) if manager else None

    return (
        EmployeeProfile(
            id=dp.person_id,
            identity=IdentitySection(
                person_id=dp.person_id,
                person_code=dp.person_code,
                first_name=dp.first_name,
                last_name=dp.last_name,
                full_name=_platform_name(dp),
                display_name=dp.display_name,
                email=dp.email,
                mobile_number=dp.mobile_number,
                platform_status=dp.status,
            ),
            ext=ExtSection(
                employee_number=dp.person_code,
                attendance_number=dp.attendance_number,
                employment_status=_status_from_platform(dp),
                worker_type=_worker_type_from_platform(dp),
                time_type=dp.time_type or "fulltime",
            ),
            personal=PersonalSection(
                middle_name=dp.middle_name,
                personal_email=dp.personal_email,
                work_phone=dp.work_phone,
                home_phone=dp.home_phone,
                date_of_birth=dp.date_of_birth,
                gender=dp.gender,
                marital_status=dp.marital_status,
                marriage_date=dp.marriage_date,
                blood_group=dp.blood_group,
                physically_handicapped=_platform_bool(dp.physically_handicapped),
                nationality=dp.nationality,
                father_name=dp.father_name,
                mother_name=dp.mother_name,
                spouse_name=dp.spouse_name,
                children_names=dp.children_names,
            ),
            address=AddressSection(
                current=AddressBlock(
                    line1=dp.current_address_line_1,
                    line2=dp.current_address_line_2,
                    city=dp.current_address_city,
                    state=dp.current_address_state,
                    zip=dp.current_address_zip,
                    country=dp.current_address_country,
                ),
                permanent=AddressBlock(
                    line1=dp.permanent_address_line_1,
                    line2=dp.permanent_address_line_2,
                    city=dp.permanent_address_city,
                    state=dp.permanent_address_state,
                    zip=dp.permanent_address_zip,
                    country=dp.permanent_address_country,
                ),
            ),
            work_info=WorkInfoSection(
                location=dp.location,
                location_country=dp.location_country,
                legal_entity=dp.legal_entity,
                business_unit=dp.business_unit,
                department=dp.department,
                sub_department=dp.sub_department,
                job_title=dp.job_title,
                secondary_job_title=dp.secondary_job_title,
                reporting_manager_name=manager_name,
                reporting_manager_number=manager_number,
                date_joined=dp.join_date,
                exit_date=dp.exit_date,
                notice_period=dp.notice_period,
                band=dp.band,
                pay_grade=dp.pay_grade,
                cost_center=dp.cost_center,
            ),
            policy=PolicySection(
                leave_plan=dp.leave_plan,
                shift_policy=dp.shift_policy_name,
                weekly_off_policy=dp.weekly_off_policy_name,
                attendance_tracking_policy=dp.attendance_time_tracking_policy,
                attendance_capture_scheme=dp.attendance_capture_scheme,
                holiday_list=dp.holiday_list_name,
                expense_policy=dp.expense_policy_name,
            ),
            exit=ExitSection(
                exit_status=dp.exit_status,
                termination_type=dp.termination_type,
                termination_reason=dp.termination_reason,
                resignation_note=dp.resignation_note,
                comments=dp.comments,
            ),
        ),
        None,
    )
