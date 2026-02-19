from typing import Annotated
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.auth import dependencies
from app.models.user import User
from app.models.enums import Role
from app.services.analytics import AnalyticsService
from app.core.responses import StandardResponse

router = APIRouter()

@router.get("/dashboard", response_model=StandardResponse)
async def get_dashboard(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN]))],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    stats = await AnalyticsService.get_dashboard_stats(db)
    return StandardResponse(data=stats)

@router.get("/attendance", response_model=StandardResponse)
async def get_attendance_trends(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    days: int = 30
):
    trends = await AnalyticsService.get_attendance_trends(days, db)
    return StandardResponse(data=trends)

@router.get("/revenue-chart", response_model=StandardResponse)
async def get_revenue_chart(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    days: int = 30
):
    data = await AnalyticsService.get_revenue_vs_expenses(days, db)
    return StandardResponse(data=data)

@router.get("/recent-activity", response_model=StandardResponse)
async def get_recent_activity(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN]))],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Return the last 10 notable events: check-ins, new users, transactions."""
    from sqlalchemy import select, union_all, literal, func
    from app.models.access import AccessLog, AttendanceLog
    from app.models.finance import Transaction

    events = []

    # Latest access logs
    from sqlalchemy import select as sel
    access_stmt = sel(AccessLog).order_by(AccessLog.scan_time.desc()).limit(5)
    access_result = await db.execute(access_stmt)
    for log in access_result.scalars().all():
        user_stmt = sel(User).where(User.id == log.user_id)
        user_result = await db.execute(user_stmt)
        user = user_result.scalar_one_or_none()
        events.append({
            "text": f"{user.full_name if user else 'Unknown'} scanned — {log.status}",
            "time": log.scan_time.isoformat() if log.scan_time else "",
            "color": "bg-emerald-500" if log.status == "GRANTED" else "bg-red-500",
            "type": "access"
        })

    # Latest transactions
    tx_stmt = sel(Transaction).order_by(Transaction.date.desc()).limit(3)
    tx_result = await db.execute(tx_stmt)
    for tx in tx_result.scalars().all():
        events.append({
            "text": f"{'Income' if tx.type.value == 'INCOME' else 'Expense'}: {tx.amount:.2f} JOD — {tx.description or tx.category.value}",
            "time": tx.date.isoformat() if tx.date else "",
            "color": "bg-emerald-500" if tx.type.value == "INCOME" else "bg-red-500",
            "type": "finance"
        })

    # Latest attendance
    att_stmt = sel(AttendanceLog).order_by(AttendanceLog.check_in_time.desc()).limit(3)
    att_result = await db.execute(att_stmt)
    for att in att_result.scalars().all():
        user_stmt = sel(User).where(User.id == att.user_id)
        user_result = await db.execute(user_stmt)
        user = user_result.scalar_one_or_none()
        events.append({
            "text": f"{user.full_name if user else 'Unknown'} checked in",
            "time": att.check_in_time.isoformat() if att.check_in_time else "",
            "color": "bg-blue-500",
            "type": "attendance"
        })

    # Sort all events by time descending and return top 10
    events.sort(key=lambda x: x.get("time", ""), reverse=True)
    return StandardResponse(data=events[:10])
