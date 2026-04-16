import uuid
from datetime import datetime
from enum import Enum
from decimal import Decimal
from sqlalchemy import String, Enum as SAEnum, ForeignKey, DateTime, Numeric, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

class TransactionType(str, Enum):
    INCOME = "INCOME"
    EXPENSE = "EXPENSE"

class TransactionCategory(str, Enum):
    # Income
    SUBSCRIPTION = "SUBSCRIPTION"
    POS_SALE = "POS_SALE"
    OTHER_INCOME = "OTHER_INCOME"
    
    # Expense
    SALARY = "SALARY"
    RENT = "RENT"
    UTILITIES = "UTILITIES" # Water, Electricity
    MAINTENANCE = "MAINTENANCE"
    EQUIPMENT = "EQUIPMENT"
    OTHER_EXPENSE = "OTHER_EXPENSE"

class PaymentMethod(str, Enum):
    CASH = "CASH"
    CARD = "CARD"
    TRANSFER = "TRANSFER"
    SYSTEM = "SYSTEM" # For auto-generated entries like Salaries

class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    type: Mapped[TransactionType] = mapped_column(SAEnum(TransactionType, native_enum=False), nullable=False)
    category: Mapped[TransactionCategory] = mapped_column(SAEnum(TransactionCategory, native_enum=False), nullable=False)
    description: Mapped[str] = mapped_column(String, nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(String, nullable=True, unique=True, index=True)
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    
    # Optional links for traceability
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=True)
    payment_method: Mapped[PaymentMethod] = mapped_column(SAEnum(PaymentMethod, native_enum=False), default=PaymentMethod.CASH, nullable=False)

    user = relationship("User")
    pos_items = relationship("POSTransactionItem", back_populates="transaction", cascade="all, delete-orphan")


class POSTransactionItem(Base):
    __tablename__ = "pos_transaction_items"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    transaction_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("transactions.id"), nullable=False, index=True)
    product_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("products.id"), nullable=True)
    product_name: Mapped[str] = mapped_column(String, nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    line_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

    transaction = relationship("Transaction", back_populates="pos_items")
    product = relationship("Product")
