from datetime import date, datetime

from sqlalchemy import Date, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class DimPerson(Base):
    __tablename__ = "dim_person"

    person_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    person_code: Mapped[str] = mapped_column(String(64), nullable=False)
    email: Mapped[str] = mapped_column(String(255), index=True)
    first_name: Mapped[str] = mapped_column(String(255))
    last_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    manager_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    employment_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    join_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    exit_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    is_deleted: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    department: Mapped[str | None] = mapped_column(String(100), nullable=True)
    sub_department: Mapped[str | None] = mapped_column(String(100), nullable=True)
    job_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    secondary_job_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    location: Mapped[str | None] = mapped_column(String(100), nullable=True)
    cost_center: Mapped[str | None] = mapped_column(String(100), nullable=True)


class DimPersonRole(Base):
    __tablename__ = "dim_person_role"

    person_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    role_id: Mapped[int] = mapped_column(Integer, primary_key=True)


class DimPersonFeatureAccess(Base):
    __tablename__ = "dim_person_feature_access"

    person_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    feature_code: Mapped[str] = mapped_column(String(64), primary_key=True)
    granted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    granted_by_person_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
