from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.datetime_utils import now_ist_naive
from app.db.base import Base


class RecCandidateIngestAttempt(Base):
    __tablename__ = "rec_candidate_ingest_attempt"

    candidate_ingest_attempt_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    source_origin: Mapped[str] = mapped_column(String(32), index=True)
    sheet_id: Mapped[str | None] = mapped_column(String(191), nullable=True)
    sheet_name: Mapped[str | None] = mapped_column(String(191), nullable=True)
    batch_id: Mapped[str | None] = mapped_column(String(191), nullable=True)
    row_key: Mapped[str | None] = mapped_column(String(64), nullable=True)
    opening_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    opening_code: Mapped[str | None] = mapped_column(String(100), nullable=True)
    email_normalized: Mapped[str] = mapped_column(String(255), index=True)
    external_source_ref: Mapped[str | None] = mapped_column(String(191), nullable=True, index=True)
    attempt_status: Mapped[str] = mapped_column(String(32), index=True)
    ingest_state: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    error_code: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    resolution_hint: Mapped[str | None] = mapped_column(String(500), nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    candidate_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    message: Mapped[str | None] = mapped_column(String(500), nullable=True)
    payload_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime, default=now_ist_naive, index=True)
    last_attempt_at: Mapped[datetime] = mapped_column(DateTime, default=now_ist_naive, index=True)
    next_retry_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    resolved_by_person_id_platform: Mapped[int | None] = mapped_column(Integer, nullable=True)
    resolved_by_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    triggered_by_person_id_platform: Mapped[int | None] = mapped_column(Integer, nullable=True)
    triggered_by_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    attempted_at: Mapped[datetime] = mapped_column(DateTime, default=now_ist_naive, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_ist_naive)
