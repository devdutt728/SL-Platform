from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.datetime_utils import now_ist_naive
from app.db.base import Base


class RecSprintTemplate(Base):
    __tablename__ = "rec_sprint_template"

    sprint_template_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    sprint_template_code: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    opening_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    role_id_platform: Mapped[int | None] = mapped_column(Integer, nullable=True)
    instructions_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    expected_duration_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_active: Mapped[bool] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_ist_naive)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now_ist_naive, onupdate=now_ist_naive)
