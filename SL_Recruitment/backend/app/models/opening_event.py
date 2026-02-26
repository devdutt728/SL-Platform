from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.datetime_utils import now_ist_naive
from app.db.base import Base


class RecOpeningEvent(Base):
    __tablename__ = "rec_opening_event"

    opening_event_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    opening_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    opening_request_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)

    action_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    actor_person_id_platform: Mapped[str | None] = mapped_column(String(64), nullable=True)
    actor_role: Mapped[str | None] = mapped_column(String(64), nullable=True)
    meta_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_ist_naive, index=True)
