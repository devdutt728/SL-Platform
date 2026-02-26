from datetime import date, datetime

from sqlalchemy import Date, DateTime, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.datetime_utils import now_ist_naive
from app.db.base import Base


class RecCandidateOffer(Base):
    __tablename__ = "rec_candidate_offer"

    candidate_offer_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    candidate_id: Mapped[int] = mapped_column(Integer, index=True)
    opening_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    offer_template_code: Mapped[str] = mapped_column(String(50))
    offer_version: Mapped[int] = mapped_column(Integer, default=1)

    gross_ctc_annual: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    fixed_ctc_annual: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    variable_ctc_annual: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    currency: Mapped[str | None] = mapped_column(String(10), nullable=True, default="INR")
    designation_title: Mapped[str | None] = mapped_column(String(150), nullable=True)
    grade_id_platform: Mapped[int | None] = mapped_column(Integer, nullable=True)

    joining_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    probation_months: Mapped[int | None] = mapped_column(Integer, nullable=True)
    offer_valid_until: Mapped[date | None] = mapped_column(Date, nullable=True)

    offer_status: Mapped[str] = mapped_column(String(30), default="draft")
    public_token: Mapped[str] = mapped_column(String(64), unique=True, index=True)

    generated_by_person_id_platform: Mapped[int | None] = mapped_column(Integer, nullable=True)
    generated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    approved_by_person_id_platform: Mapped[int | None] = mapped_column(Integer, nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    approval_principal_email: Mapped[str | None] = mapped_column(String(191), nullable=True)
    approval_requested_by_email: Mapped[str | None] = mapped_column(String(191), nullable=True)
    approval_requested_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    approval_request_token: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    approval_request_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    approval_request_used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    approval_decision: Mapped[str | None] = mapped_column(String(20), nullable=True)
    approval_decision_by_email: Mapped[str | None] = mapped_column(String(191), nullable=True)
    approval_decision_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    approval_rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    viewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    declined_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    acceptance_typed_name: Mapped[str | None] = mapped_column(String(191), nullable=True)
    acceptance_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    acceptance_user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)

    pdf_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes_internal: Mapped[str | None] = mapped_column(Text, nullable=True)
    offer_letter_overrides: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_ist_naive)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now_ist_naive, onupdate=now_ist_naive)
