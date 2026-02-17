from datetime import datetime, date, timedelta, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from app.models.access import Subscription, SubscriptionStatus, AttendanceLog
from app.models.hr import Payroll
from app.models.user import User

class AnalyticsService:
    @staticmethod
    async def get_dashboard_stats(db: AsyncSession):
        # 1. Total Active Members
        stmt_members = select(func.count(Subscription.id)).where(Subscription.status == SubscriptionStatus.ACTIVE)
        result_members = await db.execute(stmt_members)
        active_members = result_members.scalar() or 0
        
        # 2. Total Revenue (Last 30 Days) - Approximated from Payroll Expenses for now as we don't have income tracking
        # Actually plan says: "Sum of Payroll (Expenses) vs Subscription Income (Revenue - inferred)"
        # Let's just show Payroll Expenses for this initial version as strict revenue tracking needs Payments module.
        # But I can estimate Revenue: Active Subs * Avg Price (e.g. $50)
        estimated_revenue = active_members * 50.0 
        
        # Total Expenses (Last Payroll Month)
        # Get latest payroll month
        stmt_payroll = select(func.sum(Payroll.total_pay))
        # For simplicity, just sum ALL payrolls for now or filter by current month
        # Let's sum all payrolls generated in the system for this demo
        result_payroll = await db.execute(stmt_payroll)
        total_expenses = result_payroll.scalar() or 0.0
        
        return {
            "active_members": active_members,
            "estimated_monthly_revenue": estimated_revenue,
            "total_expenses_to_date": total_expenses
        }

    @staticmethod
    async def get_attendance_trends(days: int, db: AsyncSession):
        # Group by Date
        # SQLite vs Postgres date truncation is different. 
        # For cross-db compatibility in this demo, we might fetch and aggregate in python if dataset is small.
        # But let's try a simple approach: Count per day.
        
        start_date = datetime.now(timezone.utc) - timedelta(days=days)
        
        stmt = select(AttendanceLog.check_in_time).where(AttendanceLog.check_in_time >= start_date)
        result = await db.execute(stmt)
        logs = result.scalars().all()
        
        # Aggregate in Python
        daily_counts = {}
        for log_time in logs:
            day_str = log_time.strftime("%Y-%m-%d")
            daily_counts[day_str] = daily_counts.get(day_str, 0) + 1
            
        # Format for chart
        trends = [{"date": k, "count": v} for k, v in daily_counts.items()]
        trends.sort(key=lambda x: x["date"])
        return trends
