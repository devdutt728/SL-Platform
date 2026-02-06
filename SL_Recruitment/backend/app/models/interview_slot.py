from datetime import datetime

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class RecCandidateInterviewSlot(Base):
    __tablename__ = "rec_candidate_interview_slot"

    candidate_interview_slot_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    candidate_id: Mapped[int] = mapped_column(Integer, index=True)
    round_type: Mapped[str] = mapped_column(String(50))
    interviewer_person_id_platform: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    interviewer_email: Mapped[str | None] = mapped_column(String(255), nullable=True)

    slot_start_at: Mapped[datetime] = mapped_column(DateTime)
    slot_end_at: Mapped[datetime] = mapped_column(DateTime)
    status: Mapped[str] = mapped_column(String(20), default="proposed")
    selection_token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    batch_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    booked_interview_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    created_by_person_id_platform: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
