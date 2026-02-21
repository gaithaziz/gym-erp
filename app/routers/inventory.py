from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, Field
import uuid
from datetime import datetime, timezone, timedelta

from app.database import get_db
from app.auth import dependencies
from app.models.user import User
from app.models.enums import Role
from app.models.inventory import Product, ProductCategory
from app.models.finance import Transaction, TransactionType, TransactionCategory, PaymentMethod
from app.services.audit_service import AuditService
from app.core.responses import StandardResponse

router = APIRouter()


async def _get_product_or_404(db: AsyncSession, product_id: uuid.UUID) -> Product:
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


async def _log_and_commit(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    action: str,
    target_id: str,
    details: str,
) -> None:
    await AuditService.log_action(
        db=db,
        user_id=user_id,
        action=action,
        target_id=target_id,
        details=details,
    )
    await db.commit()


def _serialize_transaction(transaction: Transaction) -> dict:
    return {
        "id": str(transaction.id),
        "amount": transaction.amount,
        "type": transaction.type.value if hasattr(transaction.type, "value") else str(transaction.type),
        "category": transaction.category.value if hasattr(transaction.category, "value") else str(transaction.category),
        "description": transaction.description,
        "payment_method": (
            transaction.payment_method.value
            if hasattr(transaction.payment_method, "value")
            else str(transaction.payment_method)
        ),
        "date": transaction.date.isoformat() if transaction.date else None,
        "user_id": str(transaction.user_id) if transaction.user_id else None,
    }


# ===== Pydantic Schemas =====

class ProductCreate(BaseModel):
    name: str
    sku: str | None = None
    category: ProductCategory = ProductCategory.OTHER
    price: float
    cost_price: float | None = None
    stock_quantity: int = 0
    low_stock_threshold: int = 5
    low_stock_restock_target: int | None = None
    image_url: str | None = None


class ProductUpdate(BaseModel):
    name: str | None = None
    sku: str | None = None
    category: ProductCategory | None = None
    price: float | None = None
    cost_price: float | None = None
    stock_quantity: int | None = None
    low_stock_threshold: int | None = None
    low_stock_restock_target: int | None = None
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
    low_stock_restock_target: int | None
    low_stock_acknowledged_at: datetime | None
    low_stock_snoozed_until: datetime | None
    is_active: bool
    image_url: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class POSSaleRequest(BaseModel):
    product_id: uuid.UUID
    quantity: int = Field(default=1, ge=1)
    payment_method: PaymentMethod = PaymentMethod.CASH
    member_id: uuid.UUID | None = None
    idempotency_key: str | None = None


class POSSaleResponse(BaseModel):
    transaction_id: uuid.UUID
    product_name: str
    quantity: int
    total: float
    remaining_stock: int


class LowStockSnoozeRequest(BaseModel):
    hours: int = Field(default=24, ge=1, le=168)


class LowStockRestockTargetRequest(BaseModel):
    target_quantity: int = Field(..., ge=0)


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
    
    await AuditService.log_action(
        db=db,
        user_id=current_user.id,
        action="CREATE_PRODUCT",
        target_id=str(product.id),
        details=f"Name: {product.name}, SKU: {product.sku}, Price: {product.price}"
    )
    await db.commit()
    
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


@router.get("/products/low-stock", response_model=StandardResponse[list[ProductResponse]])
async def get_low_stock_products(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.EMPLOYEE]))],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Fetch products that have reached or fallen below their low stock threshold."""
    now = datetime.now(timezone.utc)
    stmt = (
        select(Product)
        .where(Product.is_active.is_(True))
        .where(Product.stock_quantity <= Product.low_stock_threshold)
        .where((Product.low_stock_snoozed_until.is_(None)) | (Product.low_stock_snoozed_until <= now))
        .order_by(Product.stock_quantity.asc())
    )
    result = await db.execute(stmt)
    products = result.scalars().all()
    return StandardResponse(data=[ProductResponse.model_validate(p) for p in products])


@router.post("/products/{product_id}/low-stock/ack", response_model=StandardResponse[ProductResponse])
async def acknowledge_low_stock(
    product_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.EMPLOYEE]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    product = await _get_product_or_404(db, product_id)

    product.low_stock_acknowledged_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(product)

    await _log_and_commit(
        db,
        user_id=current_user.id,
        action="LOW_STOCK_ACKNOWLEDGED",
        target_id=str(product.id),
        details=f"Acknowledged low stock for {product.name}",
    )

    return StandardResponse(message="Low stock alert acknowledged", data=ProductResponse.model_validate(product))


@router.post("/products/{product_id}/low-stock/snooze", response_model=StandardResponse[ProductResponse])
async def snooze_low_stock(
    product_id: uuid.UUID,
    request: LowStockSnoozeRequest,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.EMPLOYEE]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    product = await _get_product_or_404(db, product_id)

    product.low_stock_snoozed_until = datetime.now(timezone.utc) + timedelta(hours=request.hours)
    await db.commit()
    await db.refresh(product)

    await _log_and_commit(
        db,
        user_id=current_user.id,
        action="LOW_STOCK_SNOOZED",
        target_id=str(product.id),
        details=f"Snoozed low stock for {request.hours} hours",
    )

    return StandardResponse(message="Low stock alert snoozed", data=ProductResponse.model_validate(product))


@router.put("/products/{product_id}/low-stock-target", response_model=StandardResponse[ProductResponse])
async def set_low_stock_restock_target(
    product_id: uuid.UUID,
    request: LowStockRestockTargetRequest,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.EMPLOYEE]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    product = await _get_product_or_404(db, product_id)

    product.low_stock_restock_target = request.target_quantity
    await db.commit()
    await db.refresh(product)

    await _log_and_commit(
        db,
        user_id=current_user.id,
        action="LOW_STOCK_RESTOCK_TARGET_SET",
        target_id=str(product.id),
        details=f"Set restock target to {request.target_quantity}",
    )

    return StandardResponse(message="Restock target updated", data=ProductResponse.model_validate(product))


@router.put("/products/{product_id}", response_model=StandardResponse[ProductResponse])
async def update_product(
    product_id: uuid.UUID,
    data: ProductUpdate,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN]))],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Update a product's details or stock."""
    product = await _get_product_or_404(db, product_id)

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(product, key, value)

    await db.commit()
    await db.refresh(product)
    
    await _log_and_commit(
        db,
        user_id=current_user.id,
        action="UPDATE_PRODUCT",
        target_id=str(product.id),
        details=f"Updated product {product.name}. Fields: {list(update_data.keys())}",
    )

    return StandardResponse(data=ProductResponse.model_validate(product))


@router.delete("/products/{product_id}", response_model=StandardResponse)
async def delete_product(
    product_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN]))],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Soft-delete a product (set is_active=False)."""
    product = await _get_product_or_404(db, product_id)

    product.is_active = False
    await db.commit()
    
    await _log_and_commit(
        db,
        user_id=current_user.id,
        action="DELETE_PRODUCT",
        target_id=str(product.id),
        details=f"Deactivated product {product.name}",
    )
    
    return StandardResponse(message="Product deactivated")


# ===== POS Endpoints =====

@router.post("/pos/sell", response_model=StandardResponse[POSSaleResponse])
async def pos_sell(
    data: POSSaleRequest,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.EMPLOYEE]))],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Process a POS sale: decrement stock and create a financial transaction."""
    product = await _get_product_or_404(db, data.product_id)
    if not product.is_active:
        raise HTTPException(status_code=400, detail="Product is no longer available")
    if product.stock_quantity < data.quantity:
        raise HTTPException(status_code=400, detail=f"Insufficient stock. Available: {product.stock_quantity}")

    if data.idempotency_key:
        existing_stmt = select(Transaction).where(Transaction.idempotency_key == data.idempotency_key)
        existing_result = await db.execute(existing_stmt)
        existing_transaction = existing_result.scalar_one_or_none()
        if existing_transaction:
            return StandardResponse(
                message="Sale already processed",
                data=POSSaleResponse(
                    transaction_id=existing_transaction.id,
                    product_name=product.name,
                    quantity=data.quantity,
                    total=float(existing_transaction.amount),
                    remaining_stock=product.stock_quantity,
                )
            )

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
        idempotency_key=data.idempotency_key,
        date=datetime.now(timezone.utc),
    )
    db.add(transaction)
    await db.commit()
    await db.refresh(product)

    await _log_and_commit(
        db,
        user_id=current_user.id,
        action="POS_SALE",
        target_id=str(transaction.id),
        details=f"Sold {data.quantity}x {product.name} (Total: {total})",
    )

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
    serialized = [_serialize_transaction(transaction) for transaction in transactions]
    return StandardResponse(data=serialized)
