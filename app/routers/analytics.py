from typing import Annotated
from datetime import date
import csv
import io
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
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
    db: Annotated[AsyncSession, Depends(get_db)],
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
):
    stats = await AnalyticsService.get_dashboard_stats(db, from_date=from_date, to_date=to_date)
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
    from sqlalchemy import select as sel
    from app.models.access import AccessLog, AttendanceLog
    from app.models.finance import Transaction

    events = []

    access_stmt = sel(AccessLog).order_by(AccessLog.scan_time.desc()).limit(5)
    access_result = await db.execute(access_stmt)
    access_logs = access_result.scalars().all()

    att_stmt = sel(AttendanceLog).order_by(AttendanceLog.check_in_time.desc()).limit(3)
    att_result = await db.execute(att_stmt)
    attendance_logs = att_result.scalars().all()

    user_ids = {log.user_id for log in access_logs} | {log.user_id for log in attendance_logs}
    user_map = {}
    if user_ids:
        users_result = await db.execute(sel(User).where(User.id.in_(list(user_ids))))
        users = users_result.scalars().all()
        user_map = {u.id: u.full_name for u in users}

    for log in access_logs:
        events.append({
            "text": f"{user_map.get(log.user_id, 'Unknown')} scanned - {log.status}",
            "time": log.scan_time.isoformat() if log.scan_time else "",
            "color": "bg-emerald-500" if log.status == "GRANTED" else "bg-red-500",
            "type": "access"
        })

    tx_stmt = sel(Transaction).order_by(Transaction.date.desc()).limit(3)
    tx_result = await db.execute(tx_stmt)
    for tx in tx_result.scalars().all():
        events.append({
            "text": f"{'Income' if tx.type.value == 'INCOME' else 'Expense'}: {float(tx.amount):.2f} JOD - {tx.description or tx.category.value}",
            "time": tx.date.isoformat() if tx.date else "",
            "color": "bg-emerald-500" if tx.type.value == "INCOME" else "bg-red-500",
            "type": "finance"
        })

    for att in attendance_logs:
        events.append({
            "text": f"{user_map.get(att.user_id, 'Unknown')} checked in",
            "time": att.check_in_time.isoformat() if att.check_in_time else "",
            "color": "bg-blue-500",
            "type": "attendance"
        })

    events.sort(key=lambda x: x.get("time", ""), reverse=True)
    return StandardResponse(data=events[:10])


@router.get("/daily-visitors")
async def get_daily_visitors(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    group_by: str = Query("day", pattern="^(day|week)$"),
    format: str = Query("json", pattern="^(json|csv)$"),
):
    data = await AnalyticsService.get_daily_visitors_report(
        db,
        from_date=from_date,
        to_date=to_date,
        group_by=group_by,
    )

    if format == "csv":
        output = io.StringIO()
        if group_by == "week":
            fieldnames = ["week_start", "unique_visitors"]
        else:
            fieldnames = ["date", "unique_visitors"]
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(data)
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=daily_visitors_report.csv"},
        )

    return StandardResponse(data=data)
