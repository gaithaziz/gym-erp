from sqlalchemy import Boolean, String
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class SystemConfig(Base):
    __tablename__ = "system_config"

    key: Mapped[str] = mapped_column(String(120), primary_key=True)
    value_bool: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    value_str: Mapped[str | None] = mapped_column(String, nullable=True)
