from calendar import monthrange
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.access import AttendanceLog
from app.models.hr import (
    Contract,
    ContractType,
    LeaveRequest,
    LeaveStatus,
    Payroll,
    PayrollSettings,
    PayrollStatus,
)


def _round_money(value: float | Decimal) -> float:
    return float(Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _resolve_cutoff(year: int, month: int, cutoff_day: int) -> tuple[datetime, datetime]:
    # Keep legacy behavior for day 1: exact calendar month.
    if cutoff_day == 1:
        start = datetime(year, month, 1, tzinfo=timezone.utc)
        if month == 12:
            end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
        else:
            end = datetime(year, month + 1, 1, tzinfo=timezone.utc)
        return start, end

    prev_year = year - 1 if month == 1 else year
    prev_month = 12 if month == 1 else month - 1
    prev_last_day = monthrange(prev_year, prev_month)[1]
    curr_last_day = monthrange(year, month)[1]

    start_day = min(cutoff_day, prev_last_day)
    end_day = min(cutoff_day, curr_last_day)

    start = datetime(prev_year, prev_month, start_day, tzinfo=timezone.utc)
    end = datetime(year, month, end_day, tzinfo=timezone.utc)
    return start, end


class PayrollService:
    @staticmethod
    async def _get_cutoff_day(db: AsyncSession) -> int:
        stmt = select(PayrollSettings).limit(1)
        result = await db.execute(stmt)
        settings = result.scalar_one_or_none()
        if settings:
            return settings.salary_cutoff_day
        settings = PayrollSettings(id=1, salary_cutoff_day=1)
        db.add(settings)
        await db.flush()
        return settings.salary_cutoff_day

    @staticmethod
    async def calculate_payroll(
        user_id: uuid.UUID,
        month: int,
        year: int,
        sales_volume: float,
        db: AsyncSession,
    ) -> Payroll:
        stmt = select(Contract).where(Contract.user_id == user_id)
        result = await db.execute(stmt)
        contract = result.scalar_one_or_none()
        if not contract:
            raise ValueError("No active contract found for user")

        cutoff_day = await PayrollService._get_cutoff_day(db)
        start_date, end_date = _resolve_cutoff(year, month, cutoff_day)

        stmt_logs = select(AttendanceLog).where(
            AttendanceLog.user_id == user_id,
            AttendanceLog.check_in_time >= start_date,
            AttendanceLog.check_in_time < end_date,
        )
        result_logs = await db.execute(stmt_logs)
        logs = result_logs.scalars().all()

        total_hours = sum(float(log.hours_worked or 0.0) for log in logs)

        base_pay = 0.0
        overtime_pay = 0.0
        overtime_hours = 0.0
        commission_pay = 0.0
        bonus_pay = 0.0
        deductions = 0.0

        if contract.contract_type == ContractType.FULL_TIME:
            base_pay = float(contract.base_salary)
            hourly_rate = (float(contract.base_salary) / contract.standard_hours) if contract.standard_hours > 0 else 0.0
            if total_hours > contract.standard_hours:
                overtime_hours = total_hours - contract.standard_hours
                overtime_pay = overtime_hours * hourly_rate * 1.5
        elif contract.contract_type in (ContractType.PART_TIME, ContractType.CONTRACTOR):
            hourly_rate = float(contract.base_salary)
            base_pay = total_hours * hourly_rate
        elif contract.contract_type == ContractType.HYBRID:
            base_pay = float(contract.base_salary)
            commission_pay = sales_volume * float(contract.commission_rate or 0.0)

        stmt_leave = select(LeaveRequest).where(
            LeaveRequest.user_id == user_id,
            LeaveRequest.status == LeaveStatus.APPROVED,
            LeaveRequest.start_date < end_date.date(),
            LeaveRequest.end_date >= start_date.date(),
        )
        res_leave = await db.execute(stmt_leave)
        leaves = res_leave.scalars().all()

        leave_days = 0
        for leave in leaves:
            l_start = max(leave.start_date, start_date.date())
            l_end = min(leave.end_date, end_date.date() - timedelta(days=1))
            if l_end >= l_start:
                leave_days += (l_end - l_start).days + 1

        if leave_days > 0 and contract.contract_type in (ContractType.FULL_TIME, ContractType.HYBRID):
            daily_rate = float(contract.base_salary) / 30.0
            deductions = leave_days * daily_rate

        total_pay = base_pay + overtime_pay + commission_pay + bonus_pay - deductions

        stmt_payroll = select(Payroll).where(
            Payroll.user_id == user_id,
            Payroll.month == month,
            Payroll.year == year,
        )
        result_payroll = await db.execute(stmt_payroll)
        existing = result_payroll.scalar_one_or_none()

        if existing:
            payroll = existing
            payroll.base_pay = _round_money(base_pay)
            payroll.overtime_hours = _round_money(overtime_hours)
            payroll.overtime_pay = _round_money(overtime_pay)
            payroll.commission_pay = _round_money(commission_pay)
            payroll.bonus_pay = _round_money(bonus_pay)
            payroll.deductions = _round_money(deductions)
            payroll.total_pay = _round_money(total_pay)
            if payroll.status == PayrollStatus.PAID:
                pass
        else:
            payroll = Payroll(
                user_id=user_id,
                month=month,
                year=year,
                base_pay=_round_money(base_pay),
                overtime_hours=_round_money(overtime_hours),
                overtime_pay=_round_money(overtime_pay),
                commission_pay=_round_money(commission_pay),
                bonus_pay=_round_money(bonus_pay),
                deductions=_round_money(deductions),
                total_pay=_round_money(total_pay),
                status=PayrollStatus.DRAFT,
            )
            db.add(payroll)

        await db.commit()
        return payroll
