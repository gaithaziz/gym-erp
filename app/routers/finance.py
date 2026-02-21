from typing import Annotated, Optional
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, extract
from pydantic import BaseModel, Field

from app.database import get_db
from app.auth import dependencies
from app.models.user import User
from app.models.enums import Role
from app.models.finance import Transaction, TransactionType, TransactionCategory, PaymentMethod
from app.services.audit_service import AuditService
from app.core.responses import StandardResponse
import uuid


router = APIRouter()

class TransactionCreate(BaseModel):
    amount: float = Field(..., gt=0)
    type: TransactionType
    category: TransactionCategory
    description: str | None = None
    payment_method: PaymentMethod = PaymentMethod.CASH
    user_id: uuid.UUID | None = None

class TransactionResponse(TransactionCreate):
    id: uuid.UUID
    date: datetime

    class Config:
        from_attributes = True

@router.post("/transactions", response_model=StandardResponse)
async def create_transaction(
    data: TransactionCreate,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN]))],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Log a manual transaction (Bill, One-off Income, etc)."""
    transaction = Transaction(**data.model_dump())
    db.add(transaction)
    await db.commit()
    
    await AuditService.log_action(
        db=db,
        user_id=current_user.id,
        action="MANUAL_TRANSACTION",
        target_id=str(transaction.id),
        details=f"Logged {data.type.value} of {data.amount} for {data.category.value}"
    )
    await db.commit()
    
    return StandardResponse(message="Transaction Logged", data={"id": str(transaction.id)})

@router.get("/transactions", response_model=StandardResponse)
async def list_transactions(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = 50,
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None, ge=2000, le=2100),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
):
    """List recent transactions, optionally filtered by month/year or date range."""
    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=400, detail="start_date cannot be after end_date")

    stmt = select(Transaction)
    if start_date or end_date:
        if start_date:
            start_dt = datetime(start_date.year, start_date.month, start_date.day, tzinfo=timezone.utc)
            stmt = stmt.where(Transaction.date >= start_dt)
        if end_date:
            end_exclusive = datetime(end_date.year, end_date.month, end_date.day, tzinfo=timezone.utc) + timedelta(days=1)
            stmt = stmt.where(Transaction.date < end_exclusive)
    elif month and year:
        stmt = stmt.where(
            extract('month', Transaction.date) == month,
            extract('year', Transaction.date) == year
        )
    stmt = stmt.order_by(Transaction.date.desc()).limit(limit)
    result = await db.execute(stmt)
    transactions = result.scalars().all()
    # Serialize to dicts using Pydantic
    serialized = [TransactionResponse.model_validate(t).model_dump(mode="json") for t in transactions]
    return StandardResponse(data=serialized)

@router.get("/summary", response_model=StandardResponse)
async def get_financial_summary(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None, ge=2000, le=2100),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
):
    """Get total Income vs Expenses, optionally filtered by month/year or date range."""
    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=400, detail="start_date cannot be after end_date")

    base_filter_inc = [Transaction.type == TransactionType.INCOME]
    base_filter_exp = [Transaction.type == TransactionType.EXPENSE]
    if start_date or end_date:
        if start_date:
            start_dt = datetime(start_date.year, start_date.month, start_date.day, tzinfo=timezone.utc)
            base_filter_inc.append(Transaction.date >= start_dt)
            base_filter_exp.append(Transaction.date >= start_dt)
        if end_date:
            end_exclusive = datetime(end_date.year, end_date.month, end_date.day, tzinfo=timezone.utc) + timedelta(days=1)
            base_filter_inc.append(Transaction.date < end_exclusive)
            base_filter_exp.append(Transaction.date < end_exclusive)
    elif month and year:
        date_filters = [
            extract('month', Transaction.date) == month,
            extract('year', Transaction.date) == year
        ]
        base_filter_inc.extend(date_filters)
        base_filter_exp.extend(date_filters)

    stmt_inc = select(func.sum(Transaction.amount)).where(*base_filter_inc)
    result_inc = await db.execute(stmt_inc)
    income = result_inc.scalar() or Decimal("0")

    stmt_exp = select(func.sum(Transaction.amount)).where(*base_filter_exp)
    result_exp = await db.execute(stmt_exp)
    expenses = result_exp.scalar() or Decimal("0")

    profit = income - expenses

    return StandardResponse(data={
        "total_income": float(income),
        "total_expenses": float(expenses),
        "net_profit": float(profit)
    })

@router.get("/my-transactions", response_model=StandardResponse)
async def get_my_transactions(
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Get transactions linked to the current user."""
    stmt = select(Transaction).where(Transaction.user_id == current_user.id).order_by(Transaction.date.desc())
    result = await db.execute(stmt)
    transactions = result.scalars().all()
    serialized = [TransactionResponse.model_validate(t).model_dump(mode="json") for t in transactions]
    return StandardResponse(data=serialized)

@router.get("/transactions/{transaction_id}/receipt", response_model=StandardResponse)
async def generate_receipt(
    transaction_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Generate a simple JSON layout for a printable receipt."""
    stmt = select(Transaction).where(Transaction.id == transaction_id)
    result = await db.execute(stmt)
    transaction = result.scalar_one_or_none()
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
        
    current_admin_or_owner = current_user.role == Role.ADMIN or current_user.id == transaction.user_id
    if not current_admin_or_owner:
        raise HTTPException(status_code=403, detail="Not authorized to view this receipt")
        
    user_name = "Guest/System"
    if transaction.user_id:
        user_stmt = select(User).where(User.id == transaction.user_id)
        user_result = await db.execute(user_stmt)
        u = user_result.scalar_one_or_none()
        if u:
            user_name = u.full_name
            
    receipt_data = {
        "receipt_no": str(transaction.id).split('-')[0].upper(),
        "date": transaction.date.isoformat(),
        "amount": transaction.amount,
        "type": transaction.type.value,
        "category": transaction.category.value,
        "payment_method": transaction.payment_method.value,
        "description": transaction.description or "Gym Service/Item",
        "billed_to": user_name,
        "gym_name": "Gym ERP Management",
    }
    return StandardResponse(data=receipt_data)


@router.get("/transactions/{transaction_id}/receipt/print", response_class=HTMLResponse)
async def generate_receipt_printable(
    transaction_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    stmt = select(Transaction).where(Transaction.id == transaction_id)
    result = await db.execute(stmt)
    transaction = result.scalar_one_or_none()

    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    current_admin_or_owner = current_user.role == Role.ADMIN or current_user.id == transaction.user_id
    if not current_admin_or_owner:
        raise HTTPException(status_code=403, detail="Not authorized to view this receipt")

    user_name = "Guest/System"
    if transaction.user_id:
        user_stmt = select(User).where(User.id == transaction.user_id)
        user_result = await db.execute(user_stmt)
        user = user_result.scalar_one_or_none()
        if user:
            user_name = user.full_name

    html = f"""
    <html>
      <head><title>Receipt {str(transaction.id)[:8].upper()}</title></head>
      <body style="font-family: Arial, sans-serif; padding: 24px;">
        <h2>Gym ERP Receipt</h2>
        <p><strong>Receipt No:</strong> {str(transaction.id)[:8].upper()}</p>
        <p><strong>Date:</strong> {transaction.date.isoformat()}</p>
        <p><strong>Billed To:</strong> {user_name}</p>
        <p><strong>Category:</strong> {transaction.category.value}</p>
        <p><strong>Payment:</strong> {transaction.payment_method.value}</p>
        <p><strong>Description:</strong> {transaction.description or "Gym Service/Item"}</p>
        <h3>Total: {float(transaction.amount):.2f}</h3>
      </body>
    </html>
    """
    return HTMLResponse(content=html)
