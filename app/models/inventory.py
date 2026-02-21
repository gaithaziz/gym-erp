import uuid
from datetime import datetime, timezone
from enum import Enum
from sqlalchemy import String, Float, Integer, Boolean, Enum as SAEnum, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class ProductCategory(str, Enum):
    SUPPLEMENT = "SUPPLEMENT"
    DRINK = "DRINK"
    MERCHANDISE = "MERCHANDISE"
    SNACK = "SNACK"
    OTHER = "OTHER"


class Product(Base):
    """Inventory product available for sale at the gym."""
    __tablename__ = "products"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String, nullable=False)
    sku: Mapped[str] = mapped_column(String, nullable=True, unique=True)
    category: Mapped[ProductCategory] = mapped_column(
        SAEnum(ProductCategory, native_enum=False), default=ProductCategory.OTHER, nullable=False
    )
    price: Mapped[float] = mapped_column(Float, nullable=False)
    cost_price: Mapped[float] = mapped_column(Float, nullable=True)  # for profit tracking
    stock_quantity: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    low_stock_threshold: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    low_stock_restock_target: Mapped[int | None] = mapped_column(Integer, nullable=True)
    low_stock_acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    low_stock_snoozed_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    image_url: Mapped[str] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
