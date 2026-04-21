import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from app.database import Base


class Gym(Base):
    __tablename__ = "gyms"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(120), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    brand_name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_maintenance_mode: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    plan_tier: Mapped[str] = mapped_column(String(32), nullable=False, default="standard")
    deployment_mode: Mapped[str] = mapped_column(String(32), nullable=False, default="shared")
    subscription_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    grace_period_days: Mapped[int] = mapped_column(nullable=False, default=7)
    logo_url: Mapped[str | None] = mapped_column(String, nullable=True)
    primary_color: Mapped[str] = mapped_column(String(20), nullable=False, default="#0F766E")
    secondary_color: Mapped[str] = mapped_column(String(20), nullable=False, default="#F59E0B")
    support_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    support_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    public_web_domain: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True)
    admin_web_domain: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True)
    mobile_shell_key: Mapped[str | None] = mapped_column(String(120), nullable=True, unique=True)
    mobile_app_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    timezone: Mapped[str] = mapped_column(String(80), nullable=False, default="UTC")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    branches = relationship("Branch", back_populates="gym", cascade="all, delete-orphan")


class Branch(Base):
    __tablename__ = "branches"
    __table_args__ = (
        UniqueConstraint("gym_id", "slug", name="uq_branches_gym_slug"),
        UniqueConstraint("gym_id", "code", name="uq_branches_gym_code"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    gym_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("gyms.id"), nullable=False, index=True)
    slug: Mapped[str] = mapped_column(String(120), nullable=False)
    code: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    timezone: Mapped[str] = mapped_column(String(80), nullable=False, default="UTC")
    address_line_1: Mapped[str | None] = mapped_column(String(255), nullable=True)
    address_line_2: Mapped[str | None] = mapped_column(String(255), nullable=True)
    city: Mapped[str | None] = mapped_column(String(120), nullable=True)
    state: Mapped[str | None] = mapped_column(String(120), nullable=True)
    postal_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    country: Mapped[str | None] = mapped_column(String(120), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    gym = relationship("Gym", back_populates="branches")


class UserBranchAccess(Base):
    __tablename__ = "user_branch_access"
    __table_args__ = (
        UniqueConstraint("user_id", "branch_id", name="uq_user_branch_access_user_branch"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    gym_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("gyms.id"), nullable=False, index=True)
    branch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("branches.id"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    user = relationship("User", foreign_keys=[user_id])
    gym = relationship("Gym")
    branch = relationship("Branch")


class GymScopedMixin:
    @declared_attr
    def gym_id(cls) -> Mapped[uuid.UUID]:
        return mapped_column(ForeignKey("gyms.id"), nullable=False, index=True)

    @declared_attr
    def gym(cls):
        return relationship("Gym")


class BranchScopedMixin(GymScopedMixin):
    @declared_attr
    def branch_id(cls) -> Mapped[uuid.UUID | None]:
        return mapped_column(ForeignKey("branches.id"), nullable=True, index=True)

    @declared_attr
    def branch(cls):
        return relationship("Branch")
