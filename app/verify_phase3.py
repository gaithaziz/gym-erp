import asyncio
import logging
from datetime import datetime, timedelta, timezone, date
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models.user import User
from app.models.hr import Contract, Payroll
from app.models.access import AttendanceLog
from app.services.payroll_service import PayrollService

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ManualVerification")

async def verify_phase3():
    async with AsyncSessionLocal() as session:
        logger.info("Starting Manual Verification for Phase 3 (HR & Payroll)...")
        
        # 1. Fetch Coach Mike
        stmt = select(User).where(User.email == "coach.mike@gym-erp.com")
        result = await session.execute(stmt)
        user = result.scalar_one_or_none()
        
        if not user:
            logger.error("Coach Mike not found! Run seed data first.")
            return

        logger.info(f"Found User: {user.full_name} ({user.role})")
        
        # 2. Check Contract
        stmt_c = select(Contract).where(Contract.user_id == user.id)
        result_c = await session.execute(stmt_c)
        contract = result_c.scalar_one_or_none()
        
        if not contract:
            logger.error("Contract not found!")
            return
            
        logger.info(f"Contract: Type={contract.contract_type}, Base Salary={contract.base_salary}, Standard Hours={contract.standard_hours}")
        
        # 3. Simulate Attendance (170 Hours)
        # Create logs for current month
        now = datetime.now(timezone.utc)
        month = now.month
        year = now.year
        
        # Cleanup existing logs from previous runs
        from sqlalchemy import delete
        await session.execute(delete(AttendanceLog).where(AttendanceLog.user_id == user.id))
        await session.flush()

        # Force dates to be within current month
        start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        
        # Log 1: 160 hours (Day 1)
        log1 = AttendanceLog(
            user_id=user.id,
            check_in_time=start_of_month + timedelta(days=1),
            check_out_time=start_of_month + timedelta(days=1) + timedelta(hours=160),
            hours_worked=160.0 # Directly setting for test
        )
        # Log 2: 10 hours overtime (Day 10)
        log2 = AttendanceLog(
            user_id=user.id,
            check_in_time=start_of_month + timedelta(days=10),
            check_out_time=start_of_month + timedelta(days=10) + timedelta(hours=10),
            hours_worked=10.0
        )
        session.add(log1)
        session.add(log2)
        await session.flush()
        logger.info("Simulated Attendance: Added 170 hours of logs.")
        
        # 4. Generate Payroll
        logger.info(f"Generating Payroll for {month}/{year}...")
        payroll = await PayrollService.calculate_payroll(user.id, month, year, session)
        
        # 5. Verify Amount
        # Base = 5000
        # Hourly = 5000 / 160 = 31.25
        # OT Rate = 31.25 * 1.5 = 46.875
        # OT Hours = 10
        # OT Pay = 468.75
        # Total = 5468.75
        
        logger.info("--- Payroll Result ---")
        logger.info(f"User: {user.full_name}")
        logger.info(f"Base Pay: {payroll.base_pay} (Expected: 5000.0)")
        logger.info(f"OT Hours: {payroll.overtime_hours} (Expected: 10.0)")
        logger.info(f"OT Pay: {payroll.overtime_pay} (Expected: ~468.75)")
        logger.info(f"Total Pay: {payroll.total_pay} (Expected: ~5468.75)")
        
        expected_total = 5000.0 + (10 * (5000.0/160 * 1.5))
        diff = abs(payroll.total_pay - expected_total)
        
        if diff < 0.01:
            logger.info("✅ VERIFICATION PASSED: Amounts match expected values.")
        else:
            logger.error(f"❌ VERIFICATION FAILED: Expected {expected_total}, got {payroll.total_pay}")

        # Cleanup logs/payroll? No, leave for manual inspection if needed or rollback
        # We'll rollback to keep DB clean if we run this multiple times
        await session.rollback()
        logger.info("Rolled back changes to keep DB clean.")

if __name__ == "__main__":
    asyncio.run(verify_phase3())
