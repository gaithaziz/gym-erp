import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.tenancy import GymScopedMixin


class PolicyDocument(GymScopedMixin, Base):
    __tablename__ = "policy_documents"
    __table_args__ = (
        UniqueConstraint("gym_id", "locale", name="uq_policy_documents_gym_locale"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    locale: Mapped[str] = mapped_column(String(8), nullable=False)
    version: Mapped[str] = mapped_column(String(32), nullable=False, default="1.0")
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    effective_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    intro: Mapped[str] = mapped_column(Text, nullable=False)
    sections_json: Mapped[str] = mapped_column(Text, nullable=False)
    footer_note: Mapped[str] = mapped_column(Text, nullable=False)
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    created_by = relationship("User", foreign_keys=[created_by_user_id])


class PolicySignature(GymScopedMixin, Base):
    __tablename__ = "policy_signatures"
    __table_args__ = (
        UniqueConstraint("gym_id", "user_id", "locale", name="uq_policy_signatures_user_locale"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    locale: Mapped[str] = mapped_column(String(8), nullable=False)
    policy_version: Mapped[str] = mapped_column(String(32), nullable=False)
    signer_name: Mapped[str] = mapped_column(String(255), nullable=False)
    accepted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    signed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    user = relationship("User", foreign_keys=[user_id])


class PerkAccount(GymScopedMixin, Base):
    __tablename__ = "perk_accounts"
    __table_args__ = (
        UniqueConstraint("gym_id", "user_id", "perk_key", "period_type", name="uq_perk_accounts_user_key_period"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    perk_key: Mapped[str] = mapped_column(String(120), nullable=False)
    perk_label: Mapped[str] = mapped_column(String(255), nullable=False)
    period_type: Mapped[str] = mapped_column(String(32), nullable=False, default="CONTRACT")
    total_allowance: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    used_allowance: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    contract_starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    contract_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    monthly_reset_day: Mapped[int | None] = mapped_column(Integer, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    user = relationship("User", foreign_keys=[user_id])
    usages = relationship("PerkUsage", back_populates="perk_account", cascade="all, delete-orphan")


class PerkUsage(GymScopedMixin, Base):
    __tablename__ = "perk_usages"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    perk_account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("perk_accounts.id"), nullable=False, index=True)
    used_amount: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    used_by_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    used_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    perk_account = relationship("PerkAccount", back_populates="usages")
    used_by = relationship("User", foreign_keys=[used_by_user_id])
