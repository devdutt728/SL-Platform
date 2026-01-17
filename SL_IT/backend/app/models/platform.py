from sqlalchemy import DateTime, Integer, String
from datetime import datetime
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class DimPerson(Base):
    __tablename__ = "dim_person"

    person_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    person_code: Mapped[str] = mapped_column(String(64), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), index=True)
    first_name: Mapped[str] = mapped_column(String(255))
    last_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    mobile_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    is_deleted: Mapped[int | None] = mapped_column(Integer, nullable=True)
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)


class DimRole(Base):
    __tablename__ = "dim_role"

    role_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    role_code: Mapped[str | None] = mapped_column(String(64), index=True)
    role_name: Mapped[str | None] = mapped_column(String(255), nullable=True)


class DimPersonRole(Base):
    __tablename__ = "dim_person_role"

    person_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    role_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    created_by_person_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
