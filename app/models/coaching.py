import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.tenancy import GymScopedMixin


class CoachingPackage(GymScopedMixin, Base):
    __tablename__ = "coaching_packages"
    __table_args__ = (
        UniqueConstraint("gym_id", "user_id", "coach_id", "package_key", name="uq_coaching_packages_user_coach_key"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    coach_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    package_key: Mapped[str] = mapped_column(String(120), nullable=False)
    package_label: Mapped[str] = mapped_column(String(255), nullable=False)
    total_sessions: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    used_sessions: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    start_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    end_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    user = relationship("User", foreign_keys=[user_id])
    coach = relationship("User", foreign_keys=[coach_id])
    ledger_entries = relationship("CoachingPackageLedger", back_populates="package", cascade="all, delete-orphan")


class CoachingPackageLedger(GymScopedMixin, Base):
    __tablename__ = "coaching_package_ledger"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    package_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("coaching_packages.id"), nullable=False, index=True)
    session_delta: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    performed_by_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    performed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    package = relationship("CoachingPackage", back_populates="ledger_entries")
    performed_by = relationship("User", foreign_keys=[performed_by_user_id])
