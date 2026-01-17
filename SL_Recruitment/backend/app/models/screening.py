from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class RecCandidateScreening(Base):
    __tablename__ = "rec_candidate_screening"

    candidate_screening_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    candidate_id: Mapped[int] = mapped_column(Integer, unique=True, nullable=False, index=True)

    total_experience_years: Mapped[float | None] = mapped_column(Numeric(4, 1), nullable=True)
    relevant_experience_years: Mapped[float | None] = mapped_column(Numeric(4, 1), nullable=True)

    current_ctc_annual: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    expected_ctc_annual: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    salary_band_fit: Mapped[str | None] = mapped_column(String(50), nullable=True)

    willing_to_relocate: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    two_year_commitment: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    notice_period_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    expected_joining_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    current_city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    current_employer: Mapped[str | None] = mapped_column(String(255), nullable=True)

    gender_identity: Mapped[str | None] = mapped_column(String(50), nullable=True)
    gender_self_describe: Mapped[str | None] = mapped_column(String(255), nullable=True)

    reason_for_job_change: Mapped[str | None] = mapped_column(Text, nullable=True)

    relocation_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    questions_from_candidate: Mapped[str | None] = mapped_column(Text, nullable=True)

    screening_result: Mapped[str | None] = mapped_column(String(20), nullable=True)
    screening_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
