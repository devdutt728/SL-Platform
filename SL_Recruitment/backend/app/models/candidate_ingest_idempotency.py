from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.datetime_utils import now_ist_naive
from app.db.base import Base


class RecCandidateIngestIdempotency(Base):
    __tablename__ = "rec_candidate_ingest_idempotency"
    __table_args__ = (
        UniqueConstraint("source_origin", "external_source_ref", name="uq_rec_candidate_ingest_idempotency_origin_ref"),
    )

    candidate_ingest_idempotency_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    source_origin: Mapped[str] = mapped_column(String(32), index=True)
    external_source_ref: Mapped[str] = mapped_column(String(191))
    candidate_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    result_status: Mapped[str] = mapped_column(String(32), default="created")
    result_message: Mapped[str | None] = mapped_column(String(500), nullable=True)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime, default=now_ist_naive)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, default=now_ist_naive, onupdate=now_ist_naive)
