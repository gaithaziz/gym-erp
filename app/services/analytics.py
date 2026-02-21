from datetime import datetime, timedelta, timezone, date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.models.access import Subscription, SubscriptionStatus, AttendanceLog
from app.models.hr import Payroll

class AnalyticsService:
    _dashboard_cache: dict[str, tuple[datetime, dict]] = {}
    _dashboard_cache_ttl_seconds = 30

    @staticmethod
    async def get_dashboard_stats(db: AsyncSession, from_date: date | None = None, to_date: date | None = None):
        from app.models.finance import Transaction, TransactionType

        now = datetime.now(timezone.utc)
        cache_key = f"{from_date.isoformat() if from_date else 'none'}:{to_date.isoformat() if to_date else 'none'}"
        bind = db.get_bind()
        use_cache = bool(bind and bind.dialect.name != "sqlite")

        if use_cache:
            cache_entry = AnalyticsService._dashboard_cache.get(cache_key)
            if cache_entry and cache_entry[0] > now:
                return cache_entry[1]

        start_of_today = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
        start_of_month = datetime(now.year, now.month, 1, tzinfo=timezone.utc)

        date_filters = []
        if from_date:
            date_filters.append(Transaction.date >= datetime(from_date.year, from_date.month, from_date.day, tzinfo=timezone.utc))
        if to_date:
            to_exclusive = datetime(to_date.year, to_date.month, to_date.day, tzinfo=timezone.utc) + timedelta(days=1)
            date_filters.append(Transaction.date < to_exclusive)

        # 1. Live Headcount (checked-in today but NOT checked-out)
        stmt_headcount = select(func.count(AttendanceLog.id)).where(
            AttendanceLog.check_in_time >= start_of_today,
            AttendanceLog.check_out_time.is_(None)
        )
        result_hc = await db.execute(stmt_headcount)
        live_headcount = result_hc.scalar() or 0
        
        # 2. Today's Revenue
        today_filters = [Transaction.type == TransactionType.INCOME]
        if not from_date:
            today_filters.append(Transaction.date >= start_of_today)
        today_filters.extend(date_filters)
        stmt_today_rev = select(func.sum(Transaction.amount)).where(*today_filters)
        result_today = await db.execute(stmt_today_rev)
        todays_revenue = float(result_today.scalar() or 0.0)
        
        # 3. Active Members
        stmt_members = select(func.count(Subscription.id)).where(Subscription.status == SubscriptionStatus.ACTIVE)
        result_members = await db.execute(stmt_members)
        active_members = result_members.scalar() or 0

        # 4. Monthly Revenue
        month_rev_filters = [Transaction.type == TransactionType.INCOME]
        if not from_date:
            month_rev_filters.append(Transaction.date >= start_of_month)
        month_rev_filters.extend(date_filters)
        stmt_month_rev = select(func.sum(Transaction.amount)).where(*month_rev_filters)
        result_month_rev = await db.execute(stmt_month_rev)
        monthly_revenue = float(result_month_rev.scalar() or 0.0)

        # 5. Monthly Expenses
        month_exp_filters = [Transaction.type == TransactionType.EXPENSE]
        if not from_date:
            month_exp_filters.append(Transaction.date >= start_of_month)
        month_exp_filters.extend(date_filters)
        stmt_month_exp = select(func.sum(Transaction.amount)).where(*month_exp_filters)
        result_month_exp = await db.execute(stmt_month_exp)
        monthly_expenses = float(result_month_exp.scalar() or 0.0)
        
        # 6. Pending Salaries (rough: active staff * avg salary - paid payrolls this month)
        # Simplified: count unpaid payroll records for current month
        stmt_pending = select(func.sum(Payroll.total_pay)).where(
            Payroll.month == now.month,
            Payroll.year == now.year
        )
        result_pending = await db.execute(stmt_pending)
        pending_salaries = float(result_pending.scalar() or 0.0)

        payload = {
            "live_headcount": live_headcount,
            "todays_revenue": todays_revenue,
            "active_members": active_members,
            "monthly_revenue": monthly_revenue,
            "monthly_expenses": monthly_expenses,
            "pending_salaries": pending_salaries,
        }
        if use_cache:
            AnalyticsService._dashboard_cache[cache_key] = (
                now + timedelta(seconds=AnalyticsService._dashboard_cache_ttl_seconds),
                payload,
            )
        return payload

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
        
        daily_data: dict[str, dict[str, float | str]] = {}
        for row_date, row_type, row_amount in rows:
            day_key = row_date.date().isoformat()
            if day_key not in daily_data:
                daily_data[day_key] = {"date": day_key, "revenue": 0.0, "expenses": 0.0}
            if row_type == TransactionType.INCOME:
                daily_data[day_key]["revenue"] += float(row_amount)
            else:
                daily_data[day_key]["expenses"] += float(row_amount)
        
        chart_data = [daily_data[key] for key in sorted(daily_data.keys())]
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
