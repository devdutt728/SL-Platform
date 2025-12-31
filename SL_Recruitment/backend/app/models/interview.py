from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class RecCandidateInterview(Base):
    __tablename__ = "rec_candidate_interview"

    candidate_interview_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    candidate_id: Mapped[int] = mapped_column(Integer, index=True)

    round_type: Mapped[str] = mapped_column(String(50))
    interviewer_person_id_platform: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)

    scheduled_start_at: Mapped[datetime] = mapped_column(DateTime)
    scheduled_end_at: Mapped[datetime] = mapped_column(DateTime)

    location: Mapped[str | None] = mapped_column(String(200), nullable=True)
    meeting_link: Mapped[str | None] = mapped_column(String(500), nullable=True)
    calendar_event_id: Mapped[str | None] = mapped_column(String(128), nullable=True)

    feedback_submitted: Mapped[bool] = mapped_column(Boolean, default=False)
    rating_overall: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rating_technical: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rating_culture_fit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rating_communication: Mapped[int | None] = mapped_column(Integer, nullable=True)
    decision: Mapped[str | None] = mapped_column(String(20), nullable=True)

    notes_internal: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes_for_candidate: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_by_person_id_platform: Mapped[str | None] = mapped_column(String(64), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
