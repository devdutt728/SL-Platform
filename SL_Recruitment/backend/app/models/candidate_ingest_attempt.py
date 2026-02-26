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
    candidate_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    message: Mapped[str | None] = mapped_column(String(500), nullable=True)
    payload_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    attempted_at: Mapped[datetime] = mapped_column(DateTime, default=now_ist_naive, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_ist_naive)
