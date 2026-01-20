from datetime import datetime, date

from sqlalchemy import Date, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

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
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)


class DimPersonRole(Base):
    __tablename__ = "dim_person_role"

    person_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    role_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    created_by_person_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
