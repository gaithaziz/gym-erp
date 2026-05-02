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
from app.models.staff_debt import StaffDebtAccount
from app.models.user import User
from app.models.enums import Role


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


def _month_period_end(year: int, month: int, cutoff_day: int) -> datetime:
    if cutoff_day == 1:
        if month == 12:
            return datetime(year + 1, 1, 1, tzinfo=timezone.utc)
        return datetime(year, month + 1, 1, tzinfo=timezone.utc)

    _, end = _resolve_cutoff(year, month, cutoff_day)
    return end


def _calculate_days_worked_base_pay(contract: Contract, *, days_worked: int) -> float:
    daily_rate = float(contract.base_salary) / 30.0
    return daily_rate * max(days_worked, 0)


class PayrollService:
    @staticmethod
    async def _get_cutoff_day(db: AsyncSession) -> int:
        stmt = select(PayrollSettings).limit(1)
        result = await db.execute(stmt)
        settings = result.scalar_one_or_none()
        if settings:
            return settings.salary_cutoff_day
        settings = PayrollSettings(salary_cutoff_day=1)
        db.add(settings)
        await db.flush()
        return settings.salary_cutoff_day

    @staticmethod
    async def calculate_payroll(
        user_id: uuid.UUID,
        month: int,
        year: int,
        db: AsyncSession,
        *,
        period_start: datetime | None = None,
        period_end: datetime | None = None,
        manual_deductions: float = 0.0,
        calculation_mode: str = "MONTHLY",
        allow_paid_recalc: bool = False,
        allow_approved_recalc: bool = False,
    ) -> Payroll:
        stmt = select(Contract).where(Contract.user_id == user_id)
        result = await db.execute(stmt)
        contract = result.scalar_one_or_none()
        if not contract:
            raise ValueError("No active contract found for user")
        if contract.contract_type != ContractType.FULL_TIME:
            raise ValueError("Payroll is only available for full-time employees")
        user_stmt = select(User).where(User.id == user_id)
        user_result = await db.execute(user_stmt)
        user = user_result.scalar_one_or_none()
        if user is None:
            raise ValueError("User not found")
        if user.role == Role.CUSTOMER:
            raise ValueError("Payroll is only available for staff members")

        cutoff_day = await PayrollService._get_cutoff_day(db)
        if period_start is None or period_end is None:
            start_date, end_date = _resolve_cutoff(year, month, cutoff_day)
        else:
            start_date = period_start.astimezone(timezone.utc) if period_start.tzinfo else period_start.replace(tzinfo=timezone.utc)
            end_date = period_end.astimezone(timezone.utc) if period_end.tzinfo else period_end.replace(tzinfo=timezone.utc)
            if end_date <= start_date:
                raise ValueError("Payroll period end must be after the start")

        stmt_logs = select(AttendanceLog).where(
            AttendanceLog.user_id == user_id,
            AttendanceLog.check_in_time >= start_date,
            AttendanceLog.check_in_time < end_date,
        )
        result_logs = await db.execute(stmt_logs)
        logs = result_logs.scalars().all()

        total_hours = sum(float(log.hours_worked or 0.0) for log in logs)
        worked_days = len({log.check_in_time.date() for log in logs if log.check_in_time})

        overtime_pay = 0.0
        overtime_hours = 0.0
        commission_pay = 0.0
        bonus_pay = 0.0
        automatic_deductions = 0.0
        debt_deductions = 0.0

        base_pay = float(contract.base_salary)
        if calculation_mode == "DAYS_WORKED":
            base_pay = _calculate_days_worked_base_pay(contract, days_worked=worked_days)
        hourly_rate = (float(contract.base_salary) / contract.standard_hours) if contract.standard_hours > 0 else 0.0
        if total_hours > contract.standard_hours:
            overtime_hours = total_hours - contract.standard_hours
            overtime_pay = overtime_hours * hourly_rate * 1.5

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

        if leave_days > 0:
            daily_rate = float(contract.base_salary) / 30.0
            automatic_deductions = leave_days * daily_rate

        manual_deductions = max(float(manual_deductions or 0.0), 0.0)
        gross_after_other_deductions = base_pay + overtime_pay + commission_pay + bonus_pay - automatic_deductions - manual_deductions
        if gross_after_other_deductions > 0:
            debt_stmt = select(StaffDebtAccount).where(
                StaffDebtAccount.gym_id == contract.gym_id,
                StaffDebtAccount.user_id == user_id,
            )
            debt_result = await db.execute(debt_stmt)
            debt_account = debt_result.scalar_one_or_none()
            if debt_account is not None and float(debt_account.current_balance or 0) > 0:
                debt_deductions = min(float(debt_account.current_balance), gross_after_other_deductions)

        deductions = automatic_deductions + manual_deductions + debt_deductions
        total_pay = base_pay + overtime_pay + commission_pay + bonus_pay - deductions

        stmt_payroll = select(Payroll).where(
            Payroll.user_id == user_id,
            Payroll.month == month,
            Payroll.year == year,
        )
        result_payroll = await db.execute(stmt_payroll)
        existing = result_payroll.scalar_one_or_none()

        if existing:
            if existing.status in {PayrollStatus.APPROVED, PayrollStatus.PARTIAL, PayrollStatus.PAID} and not (allow_paid_recalc or allow_approved_recalc):
                raise ValueError("Payroll is locked because it has already been approved. Reopen it first.")
            payroll = existing
            payroll.period_start = start_date
            payroll.period_end = end_date
            payroll.base_pay = _round_money(base_pay)
            payroll.overtime_hours = _round_money(overtime_hours)
            payroll.overtime_pay = _round_money(overtime_pay)
            payroll.commission_pay = _round_money(commission_pay)
            payroll.bonus_pay = _round_money(bonus_pay)
            payroll.manual_deductions = _round_money(manual_deductions)
            payroll.debt_deductions = _round_money(debt_deductions)
            payroll.deductions = _round_money(deductions)
            payroll.total_pay = _round_money(total_pay)
        else:
            payroll = Payroll(
                user_id=user_id,
                month=month,
                year=year,
                period_start=start_date,
                period_end=end_date,
                base_pay=_round_money(base_pay),
                overtime_hours=_round_money(overtime_hours),
                overtime_pay=_round_money(overtime_pay),
                commission_pay=_round_money(commission_pay),
                bonus_pay=_round_money(bonus_pay),
                manual_deductions=_round_money(manual_deductions),
                debt_deductions=_round_money(debt_deductions),
                deductions=_round_money(deductions),
                total_pay=_round_money(total_pay),
                status=PayrollStatus.DRAFT,
            )
            db.add(payroll)

        await db.commit()
        return payroll
