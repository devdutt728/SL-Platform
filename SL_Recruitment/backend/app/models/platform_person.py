from datetime import datetime, date

from sqlalchemy import Date, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.datetime_utils import now_ist_naive
from app.db.base import Base


class DimPerson(Base):
    __tablename__ = "dim_person"

    # sl_platform.dim_person uses string IDs (e.g. "DK_0498")
    person_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    person_code: Mapped[str] = mapped_column(String(64), nullable=False)
    personal_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    email: Mapped[str] = mapped_column(String(255), index=True)
    first_name: Mapped[str] = mapped_column(String(255))
    last_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    grade_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    department_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    manager_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    employment_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    join_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    exit_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    mobile_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    is_deleted: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    source_system: Mapped[str | None] = mapped_column(String(50), nullable=True)
    source_candidate_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source_candidate_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Emp Master compatibility columns (non-duplicate additions only)
    middle_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    date_of_birth: Mapped[date | None] = mapped_column(Date, nullable=True)
    gender: Mapped[str | None] = mapped_column(String(50), nullable=True)
    marital_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    marriage_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    blood_group: Mapped[str | None] = mapped_column(String(50), nullable=True)
    physically_handicapped: Mapped[str | None] = mapped_column(String(50), nullable=True)
    nationality: Mapped[str | None] = mapped_column(String(100), nullable=True)
    work_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    home_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    personal_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    current_address_line_1: Mapped[str | None] = mapped_column(String(255), nullable=True)
    current_address_line_2: Mapped[str | None] = mapped_column(String(255), nullable=True)
    current_address_city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    current_address_state: Mapped[str | None] = mapped_column(String(100), nullable=True)
    current_address_zip: Mapped[str | None] = mapped_column(String(50), nullable=True)
    current_address_country: Mapped[str | None] = mapped_column(String(100), nullable=True)
    permanent_address_line_1: Mapped[str | None] = mapped_column(String(255), nullable=True)
    permanent_address_line_2: Mapped[str | None] = mapped_column(String(255), nullable=True)
    permanent_address_city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    permanent_address_state: Mapped[str | None] = mapped_column(String(100), nullable=True)
    permanent_address_zip: Mapped[str | None] = mapped_column(String(50), nullable=True)
    permanent_address_country: Mapped[str | None] = mapped_column(String(100), nullable=True)
    father_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    mother_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    spouse_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    children_names: Mapped[str | None] = mapped_column(Text, nullable=True)
    attendance_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    location: Mapped[str | None] = mapped_column(String(100), nullable=True)
    location_country: Mapped[str | None] = mapped_column(String(100), nullable=True)
    legal_entity: Mapped[str | None] = mapped_column(String(100), nullable=True)
    business_unit: Mapped[str | None] = mapped_column(String(100), nullable=True)
    department: Mapped[str | None] = mapped_column(String(100), nullable=True)
    sub_department: Mapped[str | None] = mapped_column(String(100), nullable=True)
    job_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    secondary_job_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reporting_to: Mapped[str | None] = mapped_column(String(255), nullable=True)
    dotted_line_manager: Mapped[str | None] = mapped_column(String(255), nullable=True)
    leave_plan: Mapped[str | None] = mapped_column(String(100), nullable=True)
    band: Mapped[str | None] = mapped_column(String(100), nullable=True)
    pay_grade: Mapped[str | None] = mapped_column(String(100), nullable=True)
    time_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    shift_policy_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    weekly_off_policy_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    attendance_time_tracking_policy: Mapped[str | None] = mapped_column(String(255), nullable=True)
    attendance_capture_scheme: Mapped[str | None] = mapped_column(String(255), nullable=True)
    holiday_list_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    expense_policy_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notice_period: Mapped[str | None] = mapped_column(String(100), nullable=True)
    aadhaar_number: Mapped[str | None] = mapped_column(String(64), nullable=True)
    pf_number: Mapped[str | None] = mapped_column(String(64), nullable=True)
    uan_number: Mapped[str | None] = mapped_column(String(64), nullable=True)
    comments: Mapped[str | None] = mapped_column(Text, nullable=True)
    exit_status: Mapped[str | None] = mapped_column(String(100), nullable=True)
    termination_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    termination_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    resignation_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    cost_center: Mapped[str | None] = mapped_column(String(100), nullable=True)


class DimPersonRole(Base):
    __tablename__ = "dim_person_role"

    person_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    role_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_ist_naive)
    created_by_person_id: Mapped[str | None] = mapped_column(String(64), nullable=True)


class DimPersonExtra(Base):
    __tablename__ = "dim_person_extra"

    person_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    person_code: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    raw_payload_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    extra_payload_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    payload_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_seen_batch_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
