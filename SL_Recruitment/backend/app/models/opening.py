from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.datetime_utils import now_ist_naive
from app.db.base import Base


class RecOpening(Base):
    __tablename__ = "rec_opening"

    opening_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    opening_code: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    location_city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    location_country: Mapped[str | None] = mapped_column(String(100), nullable=True)

    practice_id_platform: Mapped[int | None] = mapped_column(Integer, nullable=True)
    department_id_platform: Mapped[int | None] = mapped_column(Integer, nullable=True)
    role_id_platform: Mapped[int | None] = mapped_column(Integer, nullable=True)
    grade_id_platform: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reporting_person_id_platform: Mapped[str | None] = mapped_column(String(64), nullable=True)

    headcount_required: Mapped[int | None] = mapped_column(Integer, nullable=True)
    headcount_filled: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_active: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_ist_naive)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now_ist_naive, onupdate=now_ist_naive)
