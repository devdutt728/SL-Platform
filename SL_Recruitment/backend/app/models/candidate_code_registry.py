from datetime import datetime

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.datetime_utils import now_ist_naive
from app.db.base import Base


class RecCandidateCodeCounter(Base):
    __tablename__ = "rec_candidate_code_counter"

    counter_key: Mapped[str] = mapped_column(String(32), primary_key=True)
    next_sequence: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_ist_naive)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now_ist_naive, onupdate=now_ist_naive)


class RecCandidateCodeRegistry(Base):
    __tablename__ = "rec_candidate_code_registry"

    candidate_code_registry_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    sequence_no: Mapped[int] = mapped_column(Integer, nullable=False, unique=True, index=True)
    candidate_code: Mapped[str] = mapped_column(String(32), nullable=False, unique=True, index=True)
    candidate_id: Mapped[int | None] = mapped_column(Integer, nullable=True, unique=True, index=True)
    state: Mapped[str] = mapped_column(String(16), nullable=False, default="released", index=True)
    reserved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    assigned_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    released_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_ist_naive)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now_ist_naive, onupdate=now_ist_naive)
