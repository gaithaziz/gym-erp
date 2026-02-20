import uuid
from datetime import date
from enum import Enum
from sqlalchemy import Enum as SAEnum, ForeignKey, Float, Integer, Date
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

class ContractType(str, Enum):
    FULL_TIME = "FULL_TIME"
    PART_TIME = "PART_TIME"
    CONTRACTOR = "CONTRACTOR"
    HYBRID = "HYBRID"

class PayrollStatus(str, Enum):
    DRAFT = "DRAFT"
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

    user = relationship("User")

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
