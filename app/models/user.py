import uuid
from sqlalchemy import String, Enum as SAEnum, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base
from app.models.enums import Role

class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String, nullable=False)
    full_name: Mapped[str] = mapped_column(String, nullable=True)
    role: Mapped[Role] = mapped_column(SAEnum(Role, native_enum=False), default=Role.CUSTOMER, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
