from datetime import datetime

from sqlalchemy import DateTime, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.core.datetime_utils import now_ist_naive
from app.db.base import Base


class RecSprintTemplateAttachment(Base):
    __tablename__ = "rec_sprint_template_attachment"

    sprint_template_attachment_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    sprint_template_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    sprint_attachment_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    is_active: Mapped[bool] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_ist_naive)
