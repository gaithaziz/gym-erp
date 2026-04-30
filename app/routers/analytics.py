from typing import Annotated
from datetime import date
import csv
import io
import uuid
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import false, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.auth import dependencies
from app.models.user import User
from app.models.enums import Role
from app.models.tenancy import Branch
from app.services.analytics import AnalyticsService
from app.services.tenancy_service import TenancyService
from app.core.responses import StandardResponse

router = APIRouter()

async def _resolve_scope(
    *,
    db: AsyncSession,
    current_user: User,
    gym_id: uuid.UUID | None,
    branch_id: uuid.UUID | None,
) -> tuple[uuid.UUID, list[uuid.UUID]]:
    if current_user.role == Role.SUPER_ADMIN:
        target_gym_id = gym_id or current_user.gym_id
        if branch_id is not None:
            branch = await TenancyService.get_branch_in_gym(db, gym_id=target_gym_id, branch_id=branch_id)
            if branch is None:
                return target_gym_id, []
            return target_gym_id, [branch.id]
        branch_rows = await db.execute(select(Branch.id).where(Branch.gym_id == target_gym_id))
        return target_gym_id, list(branch_rows.scalars().all())
    return current_user.gym_id, await TenancyService.branch_scope_ids(
        db,
        current_user=current_user,
        branch_id=branch_id,
        allow_all_for_admin=True,
    )


@router.get("/dashboard", response_model=StandardResponse)
async def get_dashboard(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    gym_id: uuid.UUID | None = Query(None),
    branch_id: uuid.UUID | None = Query(None),
):
    scoped_gym_id, branch_ids = await _resolve_scope(db=db, current_user=current_user, gym_id=gym_id, branch_id=branch_id)
    stats = await AnalyticsService.get_dashboard_stats(
        db,
        gym_id=scoped_gym_id,
        from_date=from_date,
        to_date=to_date,
        branch_ids=branch_ids,
    )
    return StandardResponse(data=stats)


@router.get("/attendance", response_model=StandardResponse)
async def get_attendance_trends(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    days: int = 30,
    gym_id: uuid.UUID | None = Query(None),
    branch_id: uuid.UUID | None = Query(None),
):
    scoped_gym_id, branch_ids = await _resolve_scope(db=db, current_user=current_user, gym_id=gym_id, branch_id=branch_id)
    trends = await AnalyticsService.get_attendance_trends(
        days,
        db,
        gym_id=scoped_gym_id,
        branch_ids=branch_ids,
    )
    return StandardResponse(data=trends)


@router.get("/revenue-chart", response_model=StandardResponse)
async def get_revenue_chart(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    days: int = 30,
    gym_id: uuid.UUID | None = Query(None),
    branch_id: uuid.UUID | None = Query(None),
):
    scoped_gym_id, branch_ids = await _resolve_scope(db=db, current_user=current_user, gym_id=gym_id, branch_id=branch_id)
    data = await AnalyticsService.get_revenue_vs_expenses(
        days,
        db,
        gym_id=scoped_gym_id,
        branch_ids=branch_ids,
    )
    return StandardResponse(data=data)


@router.get("/recent-activity", response_model=StandardResponse)
async def get_recent_activity(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    gym_id: uuid.UUID | None = Query(None),
    branch_id: uuid.UUID | None = Query(None),
):
    """Return the last 10 notable events: check-ins, new users, transactions."""
    from sqlalchemy import select as sel
    from app.models.access import AccessLog, AttendanceLog
    from app.models.finance import Transaction

    scoped_gym_id, branch_ids = await _resolve_scope(db=db, current_user=current_user, gym_id=gym_id, branch_id=branch_id)
    events = []

    access_stmt = (
        sel(AccessLog)
        .where(AccessLog.gym_id == scoped_gym_id)
        .order_by(AccessLog.scan_time.desc())
        .limit(10)
    )
    access_stmt = access_stmt.where(AccessLog.branch_id.in_(branch_ids) if branch_ids else false())
    access_result = await db.execute(access_stmt)
    access_logs = access_result.scalars().all()

    att_stmt = (
        sel(AttendanceLog)
        .where(AttendanceLog.gym_id == scoped_gym_id)
        .order_by(AttendanceLog.check_in_time.desc())
        .limit(10)
    )
    att_stmt = att_stmt.where(AttendanceLog.branch_id.in_(branch_ids) if branch_ids else false())
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

    tx_stmt = (
        sel(Transaction)
        .where(Transaction.gym_id == scoped_gym_id)
        .order_by(Transaction.date.desc())
        .limit(10)
    )
    tx_stmt = tx_stmt.where(Transaction.branch_id.in_(branch_ids) if branch_ids else false())
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
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    group_by: str = Query("day", pattern="^(day|week)$"),
    format: str = Query("json", pattern="^(json|csv)$"),
    gym_id: uuid.UUID | None = Query(None),
    branch_id: uuid.UUID | None = Query(None),
):
    scoped_gym_id, branch_ids = await _resolve_scope(db=db, current_user=current_user, gym_id=gym_id, branch_id=branch_id)
    data = await AnalyticsService.get_daily_visitors_report(
        db,
        gym_id=scoped_gym_id,
        from_date=from_date,
        to_date=to_date,
        group_by=group_by,
        branch_ids=branch_ids,
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


@router.get("/branch-comparison", response_model=StandardResponse)
async def get_branch_comparison(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.SUPER_ADMIN, Role.ADMIN]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    gym_id: uuid.UUID | None = Query(None),
    branch_id: uuid.UUID | None = Query(None),
):
    scoped_gym_id, branch_ids = await _resolve_scope(db=db, current_user=current_user, gym_id=gym_id, branch_id=branch_id)
    comparison = await AnalyticsService.get_branch_comparison(
        db,
        gym_id=scoped_gym_id,
        branch_ids=branch_ids,
        from_date=from_date,
        to_date=to_date,
    )
    return StandardResponse(data=comparison)
