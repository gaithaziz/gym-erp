import uuid
from datetime import date
from sqlalchemy import String, Enum as SAEnum, Boolean, Date, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
from app.models.enums import Role
from app.models.tenancy import GymScopedMixin


class User(GymScopedMixin, Base):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("email", "gym_id", name="uq_users_email_gym"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String, nullable=False)
    session_version: Mapped[int] = mapped_column(default=0, nullable=False)
    full_name: Mapped[str] = mapped_column(String, nullable=True)
    role: Mapped[Role] = mapped_column(SAEnum(Role, native_enum=False), default=Role.CUSTOMER, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    
    # Session state (non-persistent)
    is_impersonated: bool = False
    
    # Profile Extensions
    profile_picture_url: Mapped[str | None] = mapped_column(String, nullable=True)
    phone_number: Mapped[str | None] = mapped_column(String, nullable=True)
    date_of_birth: Mapped[date | None] = mapped_column(Date, nullable=True)
    emergency_contact: Mapped[str | None] = mapped_column(String, nullable=True)
    bio: Mapped[str | None] = mapped_column(String, nullable=True)
    home_branch_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("branches.id"), nullable=True, index=True)

    home_branch = relationship("Branch", foreign_keys=[home_branch_id])
