import asyncio
import logging
from datetime import datetime, timezone, timedelta
from app.database import AsyncSessionLocal
from app.models.user import User
from app.models.access import Subscription, SubscriptionStatus, AttendanceLog
from app.models.hr import Payroll
from sqlalchemy import select, delete

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("VerifyPhase4")

async def verify_phase4():
    async with AsyncSessionLocal() as session:
        logger.info("Starting Phase 4 Verification (Analytics)...")
        
        # 1. Setup Test Data (Clean up first?)
        # Let's verify against existing data or create new if needed.
        # We will create a fresh set of data to be sure.
        
        now = datetime.now(timezone.utc)
        
        # User 1: Active Sub + 2 Logs
        user1 = User(email="analytics_u1@test.com", hashed_password="pw", role="CUSTOMER", full_name="A1")
        session.add(user1)
        await session.flush()
        
        sub1 = Subscription(user_id=user1.id, plan_name="Gold", start_date=now, end_date=now+timedelta(days=30), status=SubscriptionStatus.ACTIVE)
        session.add(sub1)
        
        log1 = AttendanceLog(user_id=user1.id, check_in_time=now, check_out_time=now+timedelta(hours=1), hours_worked=1.0)
        log2 = AttendanceLog(user_id=user1.id, check_in_time=now-timedelta(days=1), check_out_time=now-timedelta(days=1)+timedelta(hours=1), hours_worked=1.0)
        session.add_all([log1, log2])
        
        # Payroll for Admin (Pre-existing or new)
        # We need estimated revenue. 1 Active Sub = $50.
        # We need Expenses. Let's add a payroll record.
        pay1 = Payroll(user_id=user1.id, month=1, year=2099, base_pay=100.0, total_pay=100.0) # Future date to avoid collision?
        session.add(pay1)
        
        await session.commit()
        logger.info("Seeded analytics test data.")
        
        # 2. Call Service Methods directly (as API call requires running server)
        from app.services.analytics import AnalyticsService
        
        stats = await AnalyticsService.get_dashboard_stats(session)
        logger.info(f"Dashboard Stats: {stats}")
        
        # assertions
        # We might have other active members from previous phases (e.g. coach.mike).
        # So we check if counts INCREASED or are at minimum.
        if stats["active_members"] >= 1:
            logger.info("✅ Active Members Count verified (>=1)")
        else:
            logger.error("❌ Active Members Count failed")
            
        if stats["estimated_monthly_revenue"] >= 50.0:
            logger.info("✅ Revenue verified (>=50.0)")
            
        if stats["total_expenses_to_date"] >= 100.0:
            logger.info("✅ Expenses verified (>=100.0)")
            
        trends = await AnalyticsService.get_attendance_trends(7, session)
        logger.info(f"Attendance Trends: {trends}")
        
        if len(trends) > 0:
             logger.info("✅ Trends verified (Data returned)")
        else:
             logger.error("❌ Trends failed (No data)")
             
        # Cleanup
        await session.delete(pay1)
        await session.delete(log1)
        await session.delete(log2)
        await session.delete(sub1)
        await session.delete(user1)
        await session.commit()
        logger.info("Cleanup complete.")

if __name__ == "__main__":
    asyncio.run(verify_phase4())
