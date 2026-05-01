import uuid
from datetime import datetime, timezone
from decimal import Decimal
from enum import Enum

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, Integer, Numeric, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.tenancy import BranchScopedMixin, GymScopedMixin


class StaffDebtEntryType(str, Enum):
    ADVANCE = "ADVANCE"
    DEDUCTION = "DEDUCTION"
    REPAYMENT = "REPAYMENT"
    SETTLEMENT = "SETTLEMENT"
    ADJUSTMENT = "ADJUSTMENT"


class StaffDebtAccount(BranchScopedMixin, Base):
    __tablename__ = "staff_debt_accounts"
    __table_args__ = (
        UniqueConstraint("gym_id", "user_id", name="uq_staff_debt_accounts_gym_user"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    current_balance: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    notes: Mapped[str | None] = mapped_column(nullable=True)
    updated_by_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    user = relationship("User", foreign_keys=[user_id])
    updated_by_user = relationship("User", foreign_keys=[updated_by_user_id])
    entries = relationship("StaffDebtEntry", back_populates="account", cascade="all, delete-orphan")
    monthly_balances = relationship("StaffDebtMonthlyBalance", back_populates="account", cascade="all, delete-orphan")


class StaffDebtEntry(BranchScopedMixin, Base):
    __tablename__ = "staff_debt_entries"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("staff_debt_accounts.id"), nullable=False, index=True)
    entry_type: Mapped[StaffDebtEntryType] = mapped_column(
        SAEnum(StaffDebtEntryType, native_enum=False, length=16),
        nullable=False,
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    balance_before: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    balance_after: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    notes: Mapped[str | None] = mapped_column(nullable=True)
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )

    account = relationship("StaffDebtAccount", back_populates="entries")
    created_by_user = relationship("User")


class StaffDebtMonthlyBalance(BranchScopedMixin, Base):
    __tablename__ = "staff_debt_monthly_balances"
    __table_args__ = (
        UniqueConstraint("account_id", "year", "month", name="uq_staff_debt_monthly_balances_account_period"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("staff_debt_accounts.id"), nullable=False, index=True)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    opening_balance: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    advances_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    deductions_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    repayments_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    settlements_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    adjustments_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    closing_balance: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    entry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_by_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    account = relationship("StaffDebtAccount", back_populates="monthly_balances")
    updated_by_user = relationship("User")
