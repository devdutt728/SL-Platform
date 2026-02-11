from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

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
    source_origin: Mapped[str] = mapped_column(String(32), nullable=False, default="ui")
    external_source_ref: Mapped[str | None] = mapped_column(String(191), nullable=True)
    educational_qualification: Mapped[str | None] = mapped_column(String(255), nullable=True)
    years_of_experience: Mapped[float | None] = mapped_column(nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    terms_consent: Mapped[bool] = mapped_column(Boolean, default=False)
    terms_consent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    current_location: Mapped[str | None] = mapped_column(String(100), nullable=True)
    current_company: Mapped[str | None] = mapped_column(String(150), nullable=True)

    status: Mapped[str] = mapped_column(String(50), default="new")
    final_decision: Mapped[str | None] = mapped_column(String(20), nullable=True)

    cv_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    resume_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    portfolio_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    portfolio_not_uploaded_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    questions_from_candidate: Mapped[str | None] = mapped_column(Text, nullable=True)

    owner_person_id_platform: Mapped[int | None] = mapped_column(Integer, nullable=True)
    hired_person_id_platform: Mapped[int | None] = mapped_column(Integer, nullable=True)
    l2_owner_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    l2_owner_name: Mapped[str | None] = mapped_column(String(200), nullable=True)

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
