from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
import uuid
from datetime import datetime, timezone

from app.database import get_db
from app.auth import dependencies
from app.models.user import User
from app.models.enums import Role
from app.models.inventory import Product, ProductCategory
from app.models.finance import Transaction, TransactionType, TransactionCategory, PaymentMethod
from app.core.responses import StandardResponse

router = APIRouter()


# ===== Pydantic Schemas =====

class ProductCreate(BaseModel):
    name: str
    sku: str | None = None
    category: ProductCategory = ProductCategory.OTHER
    price: float
    cost_price: float | None = None
    stock_quantity: int = 0
    low_stock_threshold: int = 5
    image_url: str | None = None


class ProductUpdate(BaseModel):
    name: str | None = None
    sku: str | None = None
    category: ProductCategory | None = None
    price: float | None = None
    cost_price: float | None = None
    stock_quantity: int | None = None
    low_stock_threshold: int | None = None
    image_url: str | None = None


class ProductResponse(BaseModel):
    id: uuid.UUID
    name: str
    sku: str | None
    category: ProductCategory
    price: float
    cost_price: float | None
    stock_quantity: int
    low_stock_threshold: int
    is_active: bool
    image_url: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class POSSaleRequest(BaseModel):
    product_id: uuid.UUID
    quantity: int = 1
    payment_method: PaymentMethod = PaymentMethod.CASH
    member_id: uuid.UUID | None = None


class POSSaleResponse(BaseModel):
    transaction_id: uuid.UUID
    product_name: str
    quantity: int
    total: float
    remaining_stock: int


# ===== Product CRUD Endpoints =====

@router.post("/products", response_model=StandardResponse[ProductResponse])
async def create_product(
    data: ProductCreate,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN]))],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Create a new product in inventory."""
    product = Product(**data.model_dump())
    db.add(product)
    await db.commit()
    await db.refresh(product)
    return StandardResponse(data=ProductResponse.model_validate(product))


@router.get("/products", response_model=StandardResponse[list[ProductResponse]])
async def list_products(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.EMPLOYEE]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    search: Optional[str] = Query(None),
    category: Optional[ProductCategory] = Query(None),
    show_inactive: bool = Query(False),
):
    """List inventory products with optional filters."""
    stmt = select(Product)
    if not show_inactive:
        stmt = stmt.where(Product.is_active.is_(True))
    if category:
        stmt = stmt.where(Product.category == category)
    if search:
        stmt = stmt.where(Product.name.ilike(f"%{search}%"))
    stmt = stmt.order_by(Product.name)

    result = await db.execute(stmt)
    products = result.scalars().all()
    return StandardResponse(data=[ProductResponse.model_validate(p) for p in products])


@router.put("/products/{product_id}", response_model=StandardResponse[ProductResponse])
async def update_product(
    product_id: uuid.UUID,
    data: ProductUpdate,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN]))],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Update a product's details or stock."""
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(product, key, value)

    await db.commit()
    await db.refresh(product)
    return StandardResponse(data=ProductResponse.model_validate(product))


@router.delete("/products/{product_id}", response_model=StandardResponse)
async def delete_product(
    product_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN]))],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Soft-delete a product (set is_active=False)."""
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    product.is_active = False
    await db.commit()
    return StandardResponse(message="Product deactivated")


# ===== POS Endpoints =====

@router.post("/pos/sell", response_model=StandardResponse[POSSaleResponse])
async def pos_sell(
    data: POSSaleRequest,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.EMPLOYEE]))],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Process a POS sale: decrement stock and create a financial transaction."""
    result = await db.execute(select(Product).where(Product.id == data.product_id))
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if not product.is_active:
        raise HTTPException(status_code=400, detail="Product is no longer available")
    if product.stock_quantity < data.quantity:
        raise HTTPException(status_code=400, detail=f"Insufficient stock. Available: {product.stock_quantity}")

    # Decrement stock
    product.stock_quantity -= data.quantity
    total = product.price * data.quantity

    # Create transaction
    transaction = Transaction(
        amount=total,
        type=TransactionType.INCOME,
        category=TransactionCategory.POS_SALE,
        description=f"POS: {data.quantity}x {product.name}",
        payment_method=data.payment_method,
        user_id=data.member_id,
        date=datetime.now(timezone.utc),
    )
    db.add(transaction)
    await db.commit()
    await db.refresh(product)

    return StandardResponse(data=POSSaleResponse(
        transaction_id=transaction.id,
        product_name=product.name,
        quantity=data.quantity,
        total=total,
        remaining_stock=product.stock_quantity,
    ))


@router.get("/pos/recent", response_model=StandardResponse)
async def recent_sales(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.EMPLOYEE]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(20, ge=1, le=100),
):
    """Get recent POS sale transactions."""
    stmt = (
        select(Transaction)
        .where(Transaction.category == TransactionCategory.POS_SALE)
        .order_by(Transaction.date.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    transactions = result.scalars().all()
    serialized = [
        {
            "id": str(t.id),
            "amount": t.amount,
            "type": t.type.value if hasattr(t.type, "value") else str(t.type),
            "category": t.category.value if hasattr(t.category, "value") else str(t.category),
            "description": t.description,
            "payment_method": t.payment_method.value if hasattr(t.payment_method, "value") else str(t.payment_method),
            "date": t.date.isoformat() if t.date else None,
            "user_id": str(t.user_id) if t.user_id else None
        } for t in transactions
    ]
    return StandardResponse(data=serialized)
