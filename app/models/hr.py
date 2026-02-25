import uuid
from datetime import date, datetime
from enum import Enum
from decimal import Decimal
from sqlalchemy import Enum as SAEnum, ForeignKey, Float, Integer, Date, DateTime, Numeric, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
from app.models.finance import PaymentMethod

class ContractType(str, Enum):
    FULL_TIME = "FULL_TIME"
    PART_TIME = "PART_TIME"
    CONTRACTOR = "CONTRACTOR"
    HYBRID = "HYBRID"

class PayrollStatus(str, Enum):
    DRAFT = "DRAFT"
    PARTIAL = "PARTIAL"
    PAID = "PAID"

class LeaveStatus(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    DENIED = "DENIED"

class LeaveType(str, Enum):
    SICK = "SICK"
    VACATION = "VACATION"
    OTHER = "OTHER"

class Contract(Base):
    __tablename__ = "contracts"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, unique=True)
    base_salary: Mapped[float] = mapped_column(Float, nullable=False, default=0.0) # Monthly for FT, Hourly for PT? Let's assume Monthly for FT.
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=True)
    contract_type: Mapped[ContractType] = mapped_column(SAEnum(ContractType, native_enum=False), default=ContractType.FULL_TIME, nullable=False)
    
    # Simple logic: Standard hours per month
    standard_hours: Mapped[int] = mapped_column(Integer, default=160, nullable=False)
    
    # For Hybrid/Commission based
    commission_rate: Mapped[float] = mapped_column(Float, default=0.0, nullable=True)

    user = relationship("User", backref="contract")

class Payroll(Base):
    __tablename__ = "payrolls"
    __table_args__ = (
        UniqueConstraint("user_id", "month", "year", name="uq_payroll_user_month_year"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    
    base_pay: Mapped[float] = mapped_column(Float, default=0.0)
    overtime_hours: Mapped[float] = mapped_column(Float, default=0.0)
    overtime_pay: Mapped[float] = mapped_column(Float, default=0.0)
    commission_pay: Mapped[float] = mapped_column(Float, default=0.0)
    bonus_pay: Mapped[float] = mapped_column(Float, default=0.0)
    deductions: Mapped[float] = mapped_column(Float, default=0.0)
    total_pay: Mapped[float] = mapped_column(Float, default=0.0)
    
    status: Mapped[PayrollStatus] = mapped_column(SAEnum(PayrollStatus, native_enum=False), default=PayrollStatus.DRAFT, nullable=False)
    paid_transaction_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("transactions.id"), nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    paid_by_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    user = relationship("User", foreign_keys=[user_id])
    payments = relationship("PayrollPayment", back_populates="payroll", cascade="all, delete-orphan")


class PayrollPayment(Base):
    __tablename__ = "payroll_payments"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    payroll_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("payrolls.id"), nullable=False, index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    payment_method: Mapped[PaymentMethod] = mapped_column(SAEnum(PaymentMethod, native_enum=False), nullable=False)
    description: Mapped[str | None] = mapped_column(nullable=True)
    transaction_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("transactions.id"), nullable=False, unique=True)
    paid_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, index=True)
    paid_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)

    payroll = relationship("Payroll", back_populates="payments")
    transaction = relationship("Transaction")
    paid_by_user = relationship("User")


class PayrollSettings(Base):
    __tablename__ = "payroll_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    salary_cutoff_day: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

class LeaveRequest(Base):
    __tablename__ = "leave_requests"
    
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    
    leave_type: Mapped[LeaveType] = mapped_column(SAEnum(LeaveType, native_enum=False), default=LeaveType.SICK, nullable=False)
    status: Mapped[LeaveStatus] = mapped_column(SAEnum(LeaveStatus, native_enum=False), default=LeaveStatus.PENDING, nullable=False)
    
    reason: Mapped[str] = mapped_column(nullable=True)
    
    user = relationship("User")
