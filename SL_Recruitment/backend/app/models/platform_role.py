from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class DimRole(Base):
    __tablename__ = "dim_role"

    role_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    role_code: Mapped[str] = mapped_column(String(64), index=True)
    role_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

