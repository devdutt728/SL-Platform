from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.datetime_utils import now_ist_naive
from app.db.base import Base


class RecCandidateJoiningProfile(Base):
    __tablename__ = "rec_candidate_joining_profile"

    candidate_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    personal_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    middle_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    date_of_birth: Mapped[date | None] = mapped_column(Date, nullable=True)
    gender: Mapped[str | None] = mapped_column(String(50), nullable=True)
    marital_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    marriage_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    blood_group: Mapped[str | None] = mapped_column(String(50), nullable=True)
    physically_handicapped: Mapped[str | None] = mapped_column(String(50), nullable=True)
    nationality: Mapped[str | None] = mapped_column(String(100), nullable=True)
    mobile_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
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
    aadhaar_number: Mapped[str | None] = mapped_column(String(64), nullable=True)
    pf_number: Mapped[str | None] = mapped_column(String(64), nullable=True)
    uan_number: Mapped[str | None] = mapped_column(String(64), nullable=True)
    profile_status: Mapped[str] = mapped_column(String(32), default="draft")
    pan_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    aadhaar_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_ist_naive)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now_ist_naive, onupdate=now_ist_naive)
