from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class RecCandidateScreening(Base):
    __tablename__ = "rec_candidate_screening"

    candidate_screening_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    candidate_id: Mapped[int] = mapped_column(Integer, unique=True, nullable=False, index=True)

    salary_band_fit: Mapped[str | None] = mapped_column(String(50), nullable=True)

    willing_to_relocate: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    gender_identity: Mapped[str | None] = mapped_column(String(50), nullable=True)
    gender_self_describe: Mapped[str | None] = mapped_column(String(255), nullable=True)

    screening_result: Mapped[str | None] = mapped_column(String(20), nullable=True)
    screening_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
