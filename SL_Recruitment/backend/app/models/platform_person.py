from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class DimPerson(Base):
    __tablename__ = "dim_person"

    # sl_platform.dim_person uses string IDs (e.g. "DK_0498")
    person_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    person_code: Mapped[str] = mapped_column(String(64), nullable=False)
    email: Mapped[str] = mapped_column(String(255), index=True)
    first_name: Mapped[str] = mapped_column(String(255))
    last_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    mobile_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    is_deleted: Mapped[int | None] = mapped_column(Integer, nullable=True)
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
