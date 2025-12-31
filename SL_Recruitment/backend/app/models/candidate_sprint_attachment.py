from datetime import datetime

from sqlalchemy import DateTime, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class RecCandidateSprintAttachment(Base):
    __tablename__ = "rec_candidate_sprint_attachment"

    candidate_sprint_attachment_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    candidate_sprint_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    sprint_attachment_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    source_sprint_template_attachment_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
