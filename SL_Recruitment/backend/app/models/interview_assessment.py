from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class RecCandidateInterviewAssessment(Base):
    __tablename__ = "rec_candidate_interview_assessment"

    candidate_interview_assessment_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    candidate_interview_id: Mapped[int] = mapped_column(Integer, index=True, unique=True)
    candidate_id: Mapped[int] = mapped_column(Integer, index=True)
    interviewer_person_id_platform: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    data_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_person_id_platform: Mapped[str | None] = mapped_column(String(64), nullable=True)
    updated_by_person_id_platform: Mapped[str | None] = mapped_column(String(64), nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
