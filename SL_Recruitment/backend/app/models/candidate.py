from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text, event
from sqlalchemy.orm import Session
from sqlalchemy.orm import Mapped, mapped_column, validates

from app.db.base import Base


class RecCandidate(Base):
    __tablename__ = "rec_candidate"

    candidate_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    candidate_code: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)

    first_name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    full_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    email: Mapped[str] = mapped_column(String(255), index=True)
    phone: Mapped[str | None] = mapped_column("phone_number", String(50), nullable=True)

    opening_id: Mapped[int | None] = mapped_column("applied_opening_id", Integer, nullable=True, index=True)
    source_channel: Mapped[str | None] = mapped_column(String(100), nullable=True)
    current_location: Mapped[str | None] = mapped_column(String(100), nullable=True)
    current_company: Mapped[str | None] = mapped_column(String(150), nullable=True)

    status: Mapped[str] = mapped_column(String(50), default="new")
    final_decision: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")

    cv_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    portfolio_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    portfolio_not_uploaded_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    linkedin_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    owner_person_id_platform: Mapped[int | None] = mapped_column(Integer, nullable=True)
    hired_person_id_platform: Mapped[int | None] = mapped_column(Integer, nullable=True)

    drive_folder_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    drive_folder_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    caf_token: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True, index=True)
    caf_sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    caf_submitted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    needs_hr_review: Mapped[bool] = mapped_column(Boolean, default=False)

    application_docs_status: Mapped[str] = mapped_column(String(20), default="none")
    joining_docs_status: Mapped[str] = mapped_column(String(20), default="none")

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    @validates("final_decision")
    def _normalize_final_decision(self, key, value):
        return value or "pending"


@event.listens_for(RecCandidate, "before_insert")
def _set_default_final_decision(mapper, connection, target):
    if not target.final_decision:
        target.final_decision = "pending"


@event.listens_for(Session, "before_flush")
def _ensure_candidate_final_decision(session, flush_context, instances):
    for obj in session.new:
        if isinstance(obj, RecCandidate) and not obj.final_decision:
            obj.final_decision = "pending"
