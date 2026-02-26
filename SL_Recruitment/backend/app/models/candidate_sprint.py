from datetime import datetime

from sqlalchemy import DateTime, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.datetime_utils import now_ist_naive
from app.db.base import Base


class RecCandidateSprint(Base):
    __tablename__ = "rec_candidate_sprint"

    candidate_sprint_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    candidate_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    sprint_template_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    assigned_by_person_id_platform: Mapped[str | None] = mapped_column(String(64), nullable=True)
    assigned_at: Mapped[datetime] = mapped_column(DateTime, default=now_ist_naive)
    due_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="assigned")
    submission_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    reviewed_by_person_id_platform: Mapped[str | None] = mapped_column(String(64), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    score_overall: Mapped[float | None] = mapped_column(Numeric(4, 2), nullable=True)
    comments_internal: Mapped[str | None] = mapped_column(Text, nullable=True)
    comments_for_candidate: Mapped[str | None] = mapped_column(Text, nullable=True)
    decision: Mapped[str | None] = mapped_column(String(20), nullable=True)
    public_token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_ist_naive)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now_ist_naive, onupdate=now_ist_naive)
