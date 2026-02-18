from typing import Annotated, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, extract
from pydantic import BaseModel

from app.database import get_db
from app.auth import dependencies
from app.models.user import User
from app.models.enums import Role
from app.models.finance import Transaction, TransactionType, TransactionCategory, PaymentMethod
from app.core.responses import StandardResponse
import uuid

router = APIRouter()

class TransactionCreate(BaseModel):
    amount: float
    type: TransactionType
    category: TransactionCategory
    description: str | None = None
    payment_method: PaymentMethod = PaymentMethod.CASH
    user_id: uuid.UUID | None = None

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
    return StandardResponse(message="Transaction Logged", data={"id": str(transaction.id)})

@router.get("/transactions", response_model=StandardResponse)
async def list_transactions(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = 50,
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None, ge=2000, le=2100)
):
    """List recent transactions, optionally filtered by month/year."""
    stmt = select(Transaction)
    if month and year:
        stmt = stmt.where(
            extract('month', Transaction.date) == month,
            extract('year', Transaction.date) == year
        )
    stmt = stmt.order_by(Transaction.date.desc()).limit(limit)
    result = await db.execute(stmt)
    transactions = result.scalars().all()
    return StandardResponse(data=transactions)

@router.get("/summary", response_model=StandardResponse)
async def get_financial_summary(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None, ge=2000, le=2100)
):
    """Get total Income vs Expenses, optionally filtered by month/year."""
    base_filter_inc = [Transaction.type == TransactionType.INCOME]
    base_filter_exp = [Transaction.type == TransactionType.EXPENSE]
    if month and year:
        date_filters = [
            extract('month', Transaction.date) == month,
            extract('year', Transaction.date) == year
        ]
        base_filter_inc.extend(date_filters)
        base_filter_exp.extend(date_filters)

    stmt_inc = select(func.sum(Transaction.amount)).where(*base_filter_inc)
    result_inc = await db.execute(stmt_inc)
    income = result_inc.scalar() or 0.0

    stmt_exp = select(func.sum(Transaction.amount)).where(*base_filter_exp)
    result_exp = await db.execute(stmt_exp)
    expenses = result_exp.scalar() or 0.0

    profit = income - expenses

    return StandardResponse(data={
        "total_income": income,
        "total_expenses": expenses,
        "net_profit": profit
    })
