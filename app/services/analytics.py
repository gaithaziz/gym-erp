from datetime import datetime, timedelta, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.models.access import Subscription, SubscriptionStatus, AttendanceLog
from app.models.hr import Payroll

class AnalyticsService:
    @staticmethod
    async def get_dashboard_stats(db: AsyncSession):
        from app.models.finance import Transaction, TransactionType

        now = datetime.now(timezone.utc)
        start_of_today = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
        start_of_month = datetime(now.year, now.month, 1, tzinfo=timezone.utc)

        # 1. Live Headcount (checked-in today but NOT checked-out)
        stmt_headcount = select(func.count(AttendanceLog.id)).where(
            AttendanceLog.check_in_time >= start_of_today,
            AttendanceLog.check_out_time.is_(None)
        )
        result_hc = await db.execute(stmt_headcount)
        live_headcount = result_hc.scalar() or 0
        
        # 2. Today's Revenue
        stmt_today_rev = select(func.sum(Transaction.amount)).where(
            Transaction.type == TransactionType.INCOME,
            Transaction.date >= start_of_today
        )
        result_today = await db.execute(stmt_today_rev)
        todays_revenue = result_today.scalar() or 0.0
        
        # 3. Active Members
        stmt_members = select(func.count(Subscription.id)).where(Subscription.status == SubscriptionStatus.ACTIVE)
        result_members = await db.execute(stmt_members)
        active_members = result_members.scalar() or 0

        # 4. Monthly Revenue
        stmt_month_rev = select(func.sum(Transaction.amount)).where(
            Transaction.type == TransactionType.INCOME,
            Transaction.date >= start_of_month
        )
        result_month_rev = await db.execute(stmt_month_rev)
        monthly_revenue = result_month_rev.scalar() or 0.0

        # 5. Monthly Expenses
        stmt_month_exp = select(func.sum(Transaction.amount)).where(
            Transaction.type == TransactionType.EXPENSE,
            Transaction.date >= start_of_month
        )
        result_month_exp = await db.execute(stmt_month_exp)
        monthly_expenses = result_month_exp.scalar() or 0.0
        
        # 6. Pending Salaries (rough: active staff * avg salary - paid payrolls this month)
        # Simplified: count unpaid payroll records for current month
        stmt_pending = select(func.sum(Payroll.total_pay)).where(
            Payroll.month == now.month,
            Payroll.year == now.year
        )
        result_pending = await db.execute(stmt_pending)
        pending_salaries = result_pending.scalar() or 0.0

        return {
            "live_headcount": live_headcount,
            "todays_revenue": todays_revenue,
            "active_members": active_members,
            "monthly_revenue": monthly_revenue,
            "monthly_expenses": monthly_expenses,
            "pending_salaries": pending_salaries,
        }

    @staticmethod
    async def get_revenue_vs_expenses(days: int, db: AsyncSession):
        """Get daily revenue vs expenses for the last N days, for chart."""
        from app.models.finance import Transaction, TransactionType

        start_date = datetime.now(timezone.utc) - timedelta(days=days)
        
        stmt = select(Transaction.date, Transaction.type, Transaction.amount).where(
            Transaction.date >= start_date
        )
        result = await db.execute(stmt)
        rows = result.all()
        
        daily_data = {}
        for row_date, row_type, row_amount in rows:
            day_str = row_date.strftime("%b %d")
            if day_str not in daily_data:
                daily_data[day_str] = {"date": day_str, "revenue": 0, "expenses": 0}
            if row_type == TransactionType.INCOME:
                daily_data[day_str]["revenue"] += row_amount
            else:
                daily_data[day_str]["expenses"] += row_amount
        
        chart_data = list(daily_data.values())
        chart_data.sort(key=lambda x: x["date"])
        return chart_data

    @staticmethod
    async def get_attendance_trends(days: int, db: AsyncSession):
        start_date = datetime.now(timezone.utc) - timedelta(days=days)
        
        stmt = select(AttendanceLog.check_in_time).where(AttendanceLog.check_in_time >= start_date)
        result = await db.execute(stmt)
        logs = result.scalars().all()
        
        # Aggregate by hour for "Visits by Hour" chart
        hourly_counts = {}
        for log_time in logs:
            hour = log_time.strftime("%I %p")  # "09 AM"
            hourly_counts[hour] = hourly_counts.get(hour, 0) + 1
            
        trends = [{"hour": k, "visits": v} for k, v in hourly_counts.items()]
        trends.sort(key=lambda x: x["hour"])
        return trends
