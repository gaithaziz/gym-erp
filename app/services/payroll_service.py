from datetime import datetime, timezone
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.hr import Contract, Payroll, ContractType, PayrollStatus
from app.models.access import AttendanceLog

class PayrollService:
    @staticmethod
    async def calculate_payroll(user_id: uuid.UUID, month: int, year: int, sales_volume: float, db: AsyncSession) -> Payroll:
        # ... (lines 11-39 same) ...
        
        # 3. Calculate Hours (re-fetching context for diff stability, assuming surrounding lines exist)
        # Note: I'll use a larger chunk to be safe or just target the specific lines if I can.
        # Let's replace the signature first, then the logic.
        pass

    # Actually, let's do it in one chunk if possible or multiple.
    # The tool suggests using multi_replace or careful replace.
    # I will replace the whole function content or key parts.
    # Let's replace the signature first.

        # 1. Fetch Contract
        stmt = select(Contract).where(Contract.user_id == user_id)
        result = await db.execute(stmt)
        contract = result.scalar_one_or_none()
        
        if not contract:
            raise ValueError("No active contract found for user")

        # 2. Fetch Attendance Logs for the month
        # Start and end of month
        # Simple approximation: 1st to 1st of next month? Or just filter by month/year attributes if DB supported it.
        # Let's use Python date ranges.
        start_date = datetime(year, month, 1, tzinfo=timezone.utc)
        if month == 12:
            end_date = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
        else:
            end_date = datetime(year, month + 1, 1, tzinfo=timezone.utc)
            
        stmt_logs = select(AttendanceLog).where(
            AttendanceLog.user_id == user_id,
            AttendanceLog.check_in_time >= start_date,
            AttendanceLog.check_in_time < end_date
        )
        result_logs = await db.execute(stmt_logs)
        logs = result_logs.scalars().all()
        
        # 3. Calculate Hours
        total_hours = sum([log.hours_worked for log in logs if log.hours_worked])
        
        base_pay = 0.0
        overtime_pay = 0.0
        overtime_hours = 0.0
        commission_pay = 0.0
        
        if contract.contract_type == ContractType.FULL_TIME:
            # Fixed Base Salary
            base_pay = contract.base_salary
            
            # Hourly rate for OT = Base / Standard Hours (160)
            if contract.standard_hours > 0:
                hourly_rate = contract.base_salary / contract.standard_hours
            else:
                hourly_rate = 0.0
            
            if total_hours > contract.standard_hours:
                overtime_hours = total_hours - contract.standard_hours
                overtime_pay = overtime_hours * hourly_rate * 1.5
                
        elif contract.contract_type == ContractType.PART_TIME:
            # Paid by hour (assuming base_salary holds the hourly rate)
            hourly_rate = contract.base_salary
            base_pay = total_hours * hourly_rate
            
        elif contract.contract_type == ContractType.CONTRACTOR:
             # Similar to PT
            hourly_rate = contract.base_salary
            base_pay = total_hours * hourly_rate
            
        elif contract.contract_type == ContractType.HYBRID:
            # Base + Commission
            base_pay = contract.base_salary
            # Commission calculation
            commission_pay = sales_volume * contract.commission_rate
            
        # Calculate Total Pay
        total_pay = base_pay + overtime_pay + commission_pay
        
        # 4. Create/Update Payroll Record
        # Check if exists
        stmt_payroll = select(Payroll).where(
            Payroll.user_id == user_id,
            Payroll.month == month,
            Payroll.year == year
        )
        result_payroll = await db.execute(stmt_payroll)
        existing = result_payroll.scalar_one_or_none()
        
        if existing:
            payroll = existing
            payroll.base_pay = round(base_pay, 2)
            payroll.overtime_hours = round(overtime_hours, 2)
            payroll.overtime_pay = round(overtime_pay, 2)
            payroll.total_pay = round(total_pay, 2)
            payroll.commission_pay = round(commission_pay, 2)
        else:
            payroll = Payroll(
                user_id=user_id,
                month=month,
                year=year,
                base_pay=round(base_pay, 2),
                overtime_hours=round(overtime_hours, 2),
                overtime_pay=round(overtime_pay, 2),
                total_pay=round(total_pay, 2),
                commission_pay=round(commission_pay, 2),
                status=PayrollStatus.DRAFT
            )
            db.add(payroll)
            
        await db.commit()
        return payroll
