from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class RecOpeningRequest(Base):
    __tablename__ = "rec_opening_request"

    opening_request_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    opening_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    opening_code: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    opening_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    opening_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    location_city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    location_country: Mapped[str | None] = mapped_column(String(100), nullable=True)
    hiring_manager_person_id_platform: Mapped[str | None] = mapped_column(String(64), nullable=True)
    hiring_manager_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    gl_details: Mapped[str | None] = mapped_column(String(255), nullable=True)
    l2_details: Mapped[str | None] = mapped_column(String(255), nullable=True)

    request_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    headcount_delta: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    request_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    requested_by_person_id_platform: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    requested_by_role: Mapped[str | None] = mapped_column(String(64), nullable=True)
    source_portal: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending_hr_approval", index=True)

    approved_by_person_id_platform: Mapped[str | None] = mapped_column(String(64), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    rejected_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    applied_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
