from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class RecCandidateEvent(Base):
    """
    Mirrors the existing MySQL table `rec_candidate_event` (candidate_event_id PK + FK to rec_candidate).
    """

    __tablename__ = "rec_candidate_event"

    candidate_event_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    candidate_id: Mapped[int] = mapped_column(Integer, index=True)

    related_entity_type: Mapped[str] = mapped_column(String(100))
    related_entity_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    action_type: Mapped[str] = mapped_column(String(100), index=True)
    from_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    to_status: Mapped[str | None] = mapped_column(String(50), nullable=True)

    performed_by_person_id_platform: Mapped[int | None] = mapped_column(Integer, nullable=True)
    meta_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
