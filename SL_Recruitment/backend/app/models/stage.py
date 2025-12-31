from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class RecCandidateStage(Base):
    __tablename__ = "rec_candidate_stage"

    stage_id: Mapped[int] = mapped_column("candidate_stage_id", Integer, primary_key=True, autoincrement=True)
    candidate_id: Mapped[int] = mapped_column(Integer, index=True)

    stage_name: Mapped[str] = mapped_column(String(100), index=True)
    stage_status: Mapped[str] = mapped_column("status", String(50), default="pending", index=True)

    assigned_to_person_id_platform: Mapped[int | None] = mapped_column(Integer, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    due_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column("completed_at", DateTime, nullable=True)
    decision: Mapped[str | None] = mapped_column(String(50), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
