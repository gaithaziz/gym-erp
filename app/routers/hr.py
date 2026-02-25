from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Literal, Optional
from decimal import Decimal
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select, or_
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, Field

from app.database import get_db
from app.auth import dependencies
from app.models.user import User
from app.models.enums import Role
from app.models.hr import (
    Contract,
    Payroll,
    PayrollPayment,
    PayrollSettings,
    ContractType,
    LeaveRequest,
    LeaveType,
    LeaveStatus,
    PayrollStatus,
)
from app.models.finance import Transaction, TransactionType, TransactionCategory, PaymentMethod
from app.models.access import AttendanceLog
from app.services.payroll_service import PayrollService
from app.services.payroll_automation_service import PayrollAutomationService
from app.services.audit_service import AuditService
from app.services.whatsapp_service import WhatsAppNotificationService
from app.core.responses import StandardResponse
import uuid

router = APIRouter()
logger = logging.getLogger(__name__)


def _enum_value(value):
    return value.value if hasattr(value, "value") else value

# Schema for Contract
class ContractCreate(BaseModel):
    user_id: uuid.UUID
    start_date: date
    end_date: date | None = None
    base_salary: float
    contract_type: ContractType
    standard_hours: int = 160
    commission_rate: float = 0.0

class PayrollRequest(BaseModel):
    user_id: uuid.UUID
    month: int = Field(..., ge=1, le=12)
    year: int = Field(..., ge=2000, le=2100)
    sales_volume: float = 0.0 # Input for commission calculation

class LeaveRequestCreate(BaseModel):
    start_date: date
    end_date: date
    leave_type: LeaveType
    reason: Optional[str] = None

class LeaveRequestUpdate(BaseModel):
    status: LeaveStatus


class PayrollStatusUpdate(BaseModel):
    status: Literal["DRAFT", "PAID"]


class PayrollSettingsUpdate(BaseModel):
    salary_cutoff_day: int = Field(..., ge=1, le=31)


class PayrollPaymentCreate(BaseModel):
    amount: float = Field(..., gt=0)
    payment_method: PaymentMethod = PaymentMethod.CASH
    description: str | None = None


class PayrollAutomationRunRequest(BaseModel):
    month: int | None = Field(default=None, ge=1, le=12)
    year: int | None = Field(default=None, ge=2000, le=2100)
    user_id: uuid.UUID | None = None
    dry_run: bool = False


def _money(value: float | Decimal) -> float:
    return float(Decimal(value).quantize(Decimal("0.01")))


def _payroll_paid_amount(payroll: Payroll) -> float:
    return _money(sum(float(p.amount) for p in getattr(payroll, "payments", [])))


def _serialize_payroll(payroll: Payroll, user: User) -> dict:
    paid_amount = _payroll_paid_amount(payroll)
    pending_amount = _money(max(float(payroll.total_pay) - paid_amount, 0.0))
    payments = list(getattr(payroll, "payments", []))
    def _normalized(dt: datetime | None) -> datetime:
        if dt is None:
            return datetime.min.replace(tzinfo=timezone.utc)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)

    last_payment_at = max((_normalized(p.paid_at) for p in payments), default=None)
    return {
        "id": str(payroll.id),
        "user_id": str(payroll.user_id),
        "user_name": user.full_name,
        "user_email": user.email,
        "month": payroll.month,
        "year": payroll.year,
        "base_pay": payroll.base_pay,
        "overtime_hours": payroll.overtime_hours,
        "overtime_pay": payroll.overtime_pay,
        "commission_pay": payroll.commission_pay,
        "bonus_pay": payroll.bonus_pay,
        "deductions": payroll.deductions,
        "total_pay": payroll.total_pay,
        "status": payroll.status.value,
        "paid_amount": paid_amount,
        "pending_amount": pending_amount,
        "payment_count": len(payments),
        "last_payment_at": last_payment_at.isoformat() if last_payment_at else None,
        "paid_transaction_id": str(payroll.paid_transaction_id) if payroll.paid_transaction_id else None,
        "paid_at": payroll.paid_at.isoformat() if payroll.paid_at else None,
        "paid_by_user_id": str(payroll.paid_by_user_id) if payroll.paid_by_user_id else None,
        "payments": [
            {
                "id": str(payment.id),
                "amount": _money(payment.amount),
                "payment_method": payment.payment_method.value,
                "description": payment.description,
                "transaction_id": str(payment.transaction_id),
                "paid_at": payment.paid_at.isoformat(),
                "paid_by_user_id": str(payment.paid_by_user_id),
            }
            for payment in sorted(payments, key=lambda p: _normalized(p.paid_at), reverse=True)
        ],
    }


async def _best_effort_recalc_user_current_previous(db: AsyncSession, user_id: uuid.UUID, *, reason: str) -> None:
    try:
        periods = await PayrollAutomationService.get_current_previous_periods(db)
        await PayrollAutomationService.recalc_user_for_periods(
            db,
            user_id=user_id,
            periods=periods,
            dry_run=False,
        )
    except Exception:
        logger.exception("Payroll auto-recalc failed for user %s (%s)", user_id, reason)

@router.post("/contracts", response_model=StandardResponse)
async def create_contract(
    contract_data: ContractCreate,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN]))],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    # Check if user exists
    user_stmt = select(User).where(User.id == contract_data.user_id)
    result = await db.execute(user_stmt)
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="User not found")

    # Check existing contract
    contract_stmt = select(Contract).where(Contract.user_id == contract_data.user_id)
    result_contract = await db.execute(contract_stmt)
    existing = result_contract.scalar_one_or_none()
    
    if existing:
        contract = existing
        contract.start_date = contract_data.start_date
        contract.end_date = contract_data.end_date  # type: ignore
        contract.base_salary = contract_data.base_salary
        contract.contract_type = contract_data.contract_type
        contract.standard_hours = contract_data.standard_hours
        contract.commission_rate = contract_data.commission_rate
        msg = "Contract Updated"
    else:
        contract = Contract(**contract_data.model_dump())
        db.add(contract)
        msg = "Contract Created"
        
    await db.commit()
    
    await AuditService.log_action(
        db=db,
        user_id=current_user.id,
        action="UPDATE_CONTRACT" if existing else "CREATE_CONTRACT",
        target_id=str(contract_data.user_id),
        details=f"Type: {contract_data.contract_type.value}, Base: {contract_data.base_salary}"
    )
    await db.commit() # Commit the audit log
    await _best_effort_recalc_user_current_previous(
        db,
        contract_data.user_id,
        reason="contract_update",
    )
    
    return StandardResponse(message=msg)

@router.post("/payroll/generate", response_model=StandardResponse)
async def generate_payroll(
    request: PayrollRequest,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN]))],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    try:
        payroll = await PayrollService.calculate_payroll(
            request.user_id,
            request.month,
            request.year,
            request.sales_volume,
            db,
            allow_paid_recalc=False,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return StandardResponse(
        message=f"Payroll generated for {request.month}/{request.year}",
        data={
            "id": str(payroll.id),
            "user_id": str(payroll.user_id),
            "base_pay": payroll.base_pay,
            "overtime_pay": payroll.overtime_pay,
            "total_pay": payroll.total_pay
        }
    )

@router.get("/payroll/{user_id}", response_model=StandardResponse)
async def get_payrolls(
    user_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.COACH, Role.EMPLOYEE, Role.CASHIER, Role.RECEPTION, Role.FRONT_DESK]))],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    # Enforce self access only unless Admin
    if current_user.role != Role.ADMIN and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Cannot view other user's payroll")
        
    stmt = select(Payroll).where(Payroll.user_id == user_id).order_by(Payroll.year.desc(), Payroll.month.desc())
    result = await db.execute(stmt)
    payrolls = result.scalars().all()
    
    return StandardResponse(data=[
        {
            "id": str(p.id),
            "month": p.month,
            "year": p.year,
            "total_pay": p.total_pay,
            "status": p.status.value
        } for p in payrolls
    ])


@router.get("/payrolls/settings", response_model=StandardResponse)
async def get_payroll_settings(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    stmt = select(PayrollSettings).limit(1)
    result = await db.execute(stmt)
    settings = result.scalar_one_or_none()
    if not settings:
        settings = PayrollSettings(id=1, salary_cutoff_day=1)
        db.add(settings)
        await db.commit()
    return StandardResponse(data={"salary_cutoff_day": settings.salary_cutoff_day})


@router.patch("/payrolls/settings", response_model=StandardResponse)
async def update_payroll_settings(
    request: PayrollSettingsUpdate,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    stmt = select(PayrollSettings).limit(1)
    result = await db.execute(stmt)
    settings = result.scalar_one_or_none()
    if not settings:
        settings = PayrollSettings(id=1, salary_cutoff_day=request.salary_cutoff_day)
        db.add(settings)
    else:
        settings.salary_cutoff_day = request.salary_cutoff_day
    await db.commit()
    await AuditService.log_action(
        db=db,
        user_id=current_user.id,
        action="UPDATE_PAYROLL_SETTINGS",
        target_id="1",
        details=f"salary_cutoff_day={request.salary_cutoff_day}",
    )
    await db.commit()
    return StandardResponse(message="Payroll settings updated", data={"salary_cutoff_day": settings.salary_cutoff_day})


@router.get("/payrolls/automation/status", response_model=StandardResponse)
async def get_payroll_automation_status(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN]))],
):
    _ = current_user
    return StandardResponse(data=PayrollAutomationService.status())


@router.post("/payrolls/automation/run", response_model=StandardResponse)
async def run_payroll_automation(
    request: PayrollAutomationRunRequest,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    if (request.month is None) != (request.year is None):
        raise HTTPException(status_code=400, detail="month and year must be provided together")
    summary = await PayrollAutomationService.run(
        db,
        month=request.month,
        year=request.year,
        user_id=request.user_id,
        dry_run=request.dry_run,
        reason="manual",
    )
    await AuditService.log_action(
        db=db,
        user_id=current_user.id,
        action="RUN_PAYROLL_AUTOMATION",
        target_id=str(request.user_id) if request.user_id else None,
        details=(
            f"dry_run={request.dry_run}, month={request.month}, year={request.year}, "
            f"created={summary['created']}, updated={summary['updated']}, skipped_paid={summary['skipped_paid']}"
        ),
    )
    await db.commit()
    return StandardResponse(message="Payroll automation run completed", data=summary)


@router.get("/payrolls/pending", response_model=StandardResponse)
async def list_pending_payrolls(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None, ge=2000, le=2100),
    status: Optional[PayrollStatus] = Query(None),
    user_id: Optional[uuid.UUID] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    stmt = (
        select(Payroll, User)
        .join(User, User.id == Payroll.user_id)
        .options(selectinload(Payroll.payments))
    )

    if month:
        stmt = stmt.where(Payroll.month == month)
    if year:
        stmt = stmt.where(Payroll.year == year)
    if status:
        stmt = stmt.where(Payroll.status == status)
    if user_id:
        stmt = stmt.where(Payroll.user_id == user_id)
    if search:
        q = f"%{search.strip().lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(User.full_name).like(q),
                func.lower(User.email).like(q),
            )
        )

    stmt = stmt.order_by(Payroll.year.desc(), Payroll.month.desc(), User.full_name.asc()).offset(offset).limit(limit)
    result = await db.execute(stmt)
    rows = result.all()

    return StandardResponse(data=[_serialize_payroll(payroll, user) for payroll, user in rows])


@router.post("/payrolls/{payroll_id}/payments", response_model=StandardResponse)
async def create_payroll_payment(
    payroll_id: uuid.UUID,
    request: PayrollPaymentCreate,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    stmt = (
        select(Payroll, User)
        .join(User, User.id == Payroll.user_id)
        .where(Payroll.id == payroll_id)
        .options(selectinload(Payroll.payments))
    )
    result = await db.execute(stmt)
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Payroll record not found")
    payroll, staff_user = row

    paid_amount = _payroll_paid_amount(payroll)
    pending_amount = _money(max(float(payroll.total_pay) - paid_amount, 0.0))
    if pending_amount <= 0:
        raise HTTPException(status_code=400, detail="Payroll has no pending amount")
    if request.amount > pending_amount:
        raise HTTPException(status_code=400, detail="Payment amount cannot exceed pending amount")

    period = f"{payroll.month:02d}/{payroll.year}"
    tx = Transaction(
        amount=request.amount,
        type=TransactionType.EXPENSE,
        category=TransactionCategory.SALARY,
        payment_method=request.payment_method,
        description=request.description or f"Salary payment - {staff_user.full_name} ({period})",
        user_id=payroll.user_id,
    )
    db.add(tx)
    await db.flush()

    payment = PayrollPayment(
        payroll_id=payroll.id,
        amount=request.amount,
        payment_method=request.payment_method,
        description=request.description,
        transaction_id=tx.id,
        paid_at=datetime.now(timezone.utc),
        paid_by_user_id=current_user.id,
    )
    db.add(payment)
    await db.flush()

    payroll.status = PayrollStatus.PARTIAL
    payroll.paid_transaction_id = None
    payroll.paid_at = None
    payroll.paid_by_user_id = None

    await db.commit()

    await AuditService.log_action(
        db=db,
        user_id=current_user.id,
        action="CREATE_PAYROLL_PAYMENT",
        target_id=str(payroll.id),
        details=f"amount={request.amount}, method={request.payment_method.value}",
    )
    await db.commit()

    await db.refresh(payroll, attribute_names=["payments"])
    return StandardResponse(
        message="Payroll payment recorded",
        data=_serialize_payroll(payroll, staff_user),
    )


@router.patch("/payrolls/{payroll_id}/status", response_model=StandardResponse)
async def update_payroll_status(
    payroll_id: uuid.UUID,
    request: PayrollStatusUpdate,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    stmt = (
        select(Payroll, User)
        .join(User, User.id == Payroll.user_id)
        .where(Payroll.id == payroll_id)
        .options(selectinload(Payroll.payments))
    )
    result = await db.execute(stmt)
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Payroll record not found")
    payroll, staff_user = row
    target_status = PayrollStatus(request.status)
    paid_amount = _payroll_paid_amount(payroll)
    pending_amount = _money(max(float(payroll.total_pay) - paid_amount, 0.0))

    if payroll.status == target_status:
        return StandardResponse(
            message="Payroll status unchanged",
            data={
                "id": str(payroll.id),
                "status": payroll.status.value,
                "pending_amount": pending_amount,
            },
        )

    staff_name = staff_user.full_name if staff_user else "Staff"
    period = f"{payroll.month:02d}/{payroll.year}"
    now = datetime.now(timezone.utc)

    if target_status == PayrollStatus.PAID:
        if pending_amount > 0:
            raise HTTPException(status_code=400, detail="Cannot mark paid while pending amount is greater than zero")
        payroll.status = PayrollStatus.PAID
        latest_payment = max(payroll.payments, key=lambda p: p.paid_at, default=None)
        payroll.paid_transaction_id = latest_payment.transaction_id if latest_payment else payroll.paid_transaction_id
        payroll.paid_at = latest_payment.paid_at if latest_payment else now
        payroll.paid_by_user_id = latest_payment.paid_by_user_id if latest_payment else current_user.id
    else:
        if paid_amount > 0:
            tx_amount = _money(paid_amount)
            tx = Transaction(
                amount=tx_amount,
                type=TransactionType.INCOME,
                category=TransactionCategory.OTHER_INCOME,
                payment_method=PaymentMethod.SYSTEM,
                description=f"Salary reversal - {staff_name} ({period})",
                user_id=payroll.user_id,
            )
            db.add(tx)
            await db.flush()

            for payment in list(payroll.payments):
                await db.delete(payment)

        payroll.status = PayrollStatus.DRAFT
        payroll.paid_transaction_id = None
        payroll.paid_at = None
        payroll.paid_by_user_id = None

    await db.commit()

    await AuditService.log_action(
        db=db,
        user_id=current_user.id,
        action="UPDATE_PAYROLL_STATUS",
        target_id=str(payroll.id),
        details=f"Payroll set to {target_status.value}",
    )
    await db.commit()
    await db.refresh(payroll, attribute_names=["payments"])

    return StandardResponse(
        message=f"Payroll status updated to {target_status.value}",
        data=_serialize_payroll(payroll, staff_user),
    )

@router.get("/payroll/{payroll_id}/payslip", response_model=StandardResponse)
async def generate_payslip(
    payroll_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Generate a simple JSON layout for a printable payslip."""
    stmt = select(Payroll).where(Payroll.id == payroll_id)
    result = await db.execute(stmt)
    payroll = result.scalar_one_or_none()
    
    if not payroll:
        raise HTTPException(status_code=404, detail="Payroll record not found")
        
    if current_user.role != Role.ADMIN and current_user.id != payroll.user_id:
        raise HTTPException(status_code=403, detail="Cannot access this payslip")
        
    # Get user and contract info
    user_stmt = select(User).where(User.id == payroll.user_id)
    u_res = await db.execute(user_stmt)
    u = u_res.scalar_one_or_none()
    
    contract_stmt = select(Contract).where(Contract.user_id == payroll.user_id)
    c_res = await db.execute(contract_stmt)
    c = c_res.scalar_one_or_none()
    
    payslip_data = {
        "payslip_id": str(payroll.id).split('-')[0].upper(),
        "employee_name": u.full_name if u else "Unknown",
        "email": u.email if u else "Unknown",
        "period": f"{payroll.month:02d}/{payroll.year}",
        "base_pay": payroll.base_pay,
        "overtime_pay": payroll.overtime_pay,
        "bonus_pay": payroll.bonus_pay,
        "deductions": payroll.deductions,
        "total_pay": payroll.total_pay,
        "status": payroll.status,
        "contract_type": c.contract_type.value if c else "Unknown",
        "generated_on": datetime.now().isoformat()
    }
    
    return StandardResponse(data=payslip_data)


@router.get("/payroll/{payroll_id}/payslip/print", response_class=HTMLResponse)
async def generate_payslip_printable(
    payroll_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    stmt = select(Payroll).where(Payroll.id == payroll_id)
    result = await db.execute(stmt)
    payroll = result.scalar_one_or_none()

    if not payroll:
        raise HTTPException(status_code=404, detail="Payroll record not found")

    if current_user.role != Role.ADMIN and current_user.id != payroll.user_id:
        raise HTTPException(status_code=403, detail="Cannot access this payslip")

    user_stmt = select(User).where(User.id == payroll.user_id)
    user_result = await db.execute(user_stmt)
    user = user_result.scalar_one_or_none()

    html = f"""
    <html>
      <head><title>Payslip {str(payroll.id)[:8].upper()}</title></head>
      <body style="font-family: Arial, sans-serif; padding: 24px;">
        <h2>Gym ERP Payslip</h2>
        <p><strong>Payslip ID:</strong> {str(payroll.id)[:8].upper()}</p>
        <p><strong>Employee:</strong> {user.full_name if user else "Unknown"}</p>
        <p><strong>Period:</strong> {payroll.month:02d}/{payroll.year}</p>
        <p><strong>Base Pay:</strong> {payroll.base_pay:.2f}</p>
        <p><strong>Overtime:</strong> {payroll.overtime_pay:.2f}</p>
        <p><strong>Commission:</strong> {payroll.commission_pay:.2f}</p>
        <p><strong>Deductions:</strong> {payroll.deductions:.2f}</p>
        <h3>Total Pay: {payroll.total_pay:.2f}</h3>
      </body>
    </html>
    """
    return HTMLResponse(content=html)

@router.get("/staff", response_model=StandardResponse)
async def get_staff(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN]))],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """List all users with staff roles, including their contract info."""
    stmt = (
        select(User, Contract)
        .outerjoin(Contract, Contract.user_id == User.id)
        .where(User.role.in_([Role.COACH, Role.EMPLOYEE, Role.CASHIER, Role.RECEPTION, Role.FRONT_DESK]))
        .order_by(User.full_name)
    )
    result = await db.execute(stmt)
    staff_members = result.all()

    data = []
    for staff, contract in staff_members:
        data.append({
            "id": str(staff.id),
            "full_name": staff.full_name,
            "email": staff.email,
            "role": staff.role.value,
            "profile_picture_url": staff.profile_picture_url,
            "phone_number": staff.phone_number,
            "date_of_birth": staff.date_of_birth.isoformat() if staff.date_of_birth else None,
            "emergency_contact": staff.emergency_contact,
            "bio": staff.bio,
            "contract": {
                "type": contract.contract_type.value if contract else None,
                "base_salary": contract.base_salary if contract else None,
                "commission_rate": contract.commission_rate if contract else None,
                "start_date": contract.start_date.isoformat() if contract and contract.start_date else None,
                "end_date": contract.end_date.isoformat() if contract and contract.end_date else None,
                "standard_hours": contract.standard_hours if contract else None,
            } if contract else None
        })
        
    return StandardResponse(data=data)


class AttendanceCorrection(BaseModel):
    check_in_time: datetime | None = None
    check_out_time: datetime | None = None


@router.get("/attendance", response_model=StandardResponse)
async def list_attendance(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    user_id: Optional[uuid.UUID] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    limit: int = 100
):
    """List attendance logs (timesheet). Optionally filter by user/date range."""
    stmt = (
        select(AttendanceLog, User.full_name)
        .join(User, User.id == AttendanceLog.user_id)
        .order_by(AttendanceLog.check_in_time.desc())
    )
    if user_id:
        stmt = stmt.where(AttendanceLog.user_id == user_id)
    if start_date:
        stmt = stmt.where(func.date(AttendanceLog.check_in_time) >= start_date.isoformat())
    if end_date:
        stmt = stmt.where(func.date(AttendanceLog.check_in_time) <= end_date.isoformat())
    stmt = stmt.limit(limit)
    result = await db.execute(stmt)
    logs = result.all()

    data = []
    for log, user_name in logs:
        data.append({
            "id": str(log.id),
            "user_id": str(log.user_id),
            "user_name": user_name or "Unknown",
            "check_in_time": log.check_in_time.isoformat() if log.check_in_time else None,
            "check_out_time": log.check_out_time.isoformat() if log.check_out_time else None,
            "hours_worked": log.hours_worked
        })

    return StandardResponse(data=data)


def _overlap_days(start_a: date, end_a: date, start_b: date, end_b: date) -> int:
    start = max(start_a, start_b)
    end = min(end_a, end_b)
    if start > end:
        return 0
    return (end - start).days + 1


@router.get("/staff/{user_id}/summary", response_model=StandardResponse)
async def get_staff_summary(
    user_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
):
    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=400, detail="start_date cannot be after end_date")

    user_stmt = select(User, Contract).outerjoin(Contract, Contract.user_id == User.id).where(User.id == user_id)
    user_result = await db.execute(user_stmt)
    row = user_result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Staff user not found")
    user, contract = row

    attendance_stmt = select(AttendanceLog).where(AttendanceLog.user_id == user_id)
    if start_date:
        attendance_stmt = attendance_stmt.where(func.date(AttendanceLog.check_in_time) >= start_date)
    if end_date:
        attendance_stmt = attendance_stmt.where(func.date(AttendanceLog.check_in_time) <= end_date)
    attendance_stmt = attendance_stmt.order_by(AttendanceLog.check_in_time.desc())
    attendance_result = await db.execute(attendance_stmt)
    attendance_logs = attendance_result.scalars().all()

    present_dates = {log.check_in_time.date().isoformat() for log in attendance_logs if log.check_in_time}
    total_hours = round(sum(float(log.hours_worked or 0.0) for log in attendance_logs), 2)
    days_present = len(present_dates)
    avg_hours = round((total_hours / days_present), 2) if days_present else 0.0

    leave_stmt = select(LeaveRequest).where(LeaveRequest.user_id == user_id)
    if start_date:
        leave_stmt = leave_stmt.where(LeaveRequest.end_date >= start_date)
    if end_date:
        leave_stmt = leave_stmt.where(LeaveRequest.start_date <= end_date)
    leave_stmt = leave_stmt.order_by(LeaveRequest.start_date.desc())
    leave_result = await db.execute(leave_stmt)
    leaves = leave_result.scalars().all()

    approved_days = 0
    for leave in leaves:
        if leave.status != LeaveStatus.APPROVED:
            continue
        if start_date and end_date:
            approved_days += _overlap_days(leave.start_date, leave.end_date, start_date, end_date)
        elif start_date:
            approved_days += _overlap_days(leave.start_date, leave.end_date, start_date, leave.end_date)
        elif end_date:
            approved_days += _overlap_days(leave.start_date, leave.end_date, leave.start_date, end_date)
        else:
            approved_days += (leave.end_date - leave.start_date).days + 1

    summary_data = {
        "employee": {
            "id": str(user.id),
            "full_name": user.full_name,
            "email": user.email,
            "role": _enum_value(user.role),
            "contract_type": _enum_value(contract.contract_type) if contract else None,
            "base_salary": contract.base_salary if contract else None,
        },
        "range": {
            "start_date": start_date.isoformat() if start_date else None,
            "end_date": end_date.isoformat() if end_date else None,
        },
        "attendance_summary": {
            "days_present": days_present,
            "total_hours": total_hours,
            "avg_hours_per_day": avg_hours,
            "records": [
                {
                    "id": str(log.id),
                    "check_in_time": log.check_in_time.isoformat() if log.check_in_time else None,
                    "check_out_time": log.check_out_time.isoformat() if log.check_out_time else None,
                    "hours_worked": float(log.hours_worked or 0.0),
                }
                for log in attendance_logs
            ],
        },
        "leave_summary": {
            "total_requests": len(leaves),
            "approved_days": approved_days,
            "pending_count": sum(1 for leave in leaves if _enum_value(leave.status) == LeaveStatus.PENDING.value),
            "records": [
                {
                    "id": str(leave.id),
                    "start_date": leave.start_date.isoformat(),
                    "end_date": leave.end_date.isoformat(),
                    "leave_type": _enum_value(leave.leave_type),
                    "status": _enum_value(leave.status),
                    "reason": leave.reason,
                }
                for leave in leaves
            ],
        },
    }
    return StandardResponse(data=summary_data)


@router.get("/staff/{user_id}/summary/print", response_class=HTMLResponse)
async def print_staff_summary(
    user_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
):
    summary_response = await get_staff_summary(user_id, current_user, db, start_date, end_date)
    data = summary_response.data
    employee = data["employee"]
    attendance = data["attendance_summary"]
    leaves = data["leave_summary"]
    range_text = "All Dates"
    if data["range"]["start_date"] and data["range"]["end_date"]:
        range_text = f"{data['range']['start_date']} to {data['range']['end_date']}"

    attendance_rows = "".join([
        f"""
        <tr>
          <td>{(row['check_in_time'] or '-')}</td>
          <td>{(row['check_out_time'] or '-')}</td>
          <td style='text-align:right;'>{row['hours_worked']:.2f}</td>
        </tr>
        """
        for row in attendance["records"]
    ]) or "<tr><td colspan='3' style='text-align:center;'>No attendance records</td></tr>"

    leave_rows = "".join([
        f"""
        <tr>
          <td>{row['start_date']}</td>
          <td>{row['end_date']}</td>
          <td>{row['leave_type']}</td>
          <td>{row['status']}</td>
        </tr>
        """
        for row in leaves["records"]
    ]) or "<tr><td colspan='4' style='text-align:center;'>No leave records</td></tr>"

    html = f"""
    <html>
      <head>
        <title>Employee Summary - {employee['full_name']}</title>
        <style>
          body {{ font-family: Arial, sans-serif; background: #0b1220; color: #e5e7eb; padding: 24px; }}
          .card {{ background: #111827; border: 1px solid #243045; border-radius: 12px; padding: 16px; margin-bottom: 14px; }}
          .meta {{ color: #93a4c0; font-size: 12px; }}
          .grid {{ display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }}
          table {{ width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }}
          th, td {{ border: 1px solid #243045; padding: 8px; text-align: left; }}
          th {{ background: #182033; }}
          h1, h2 {{ margin: 0 0 10px; }}
        </style>
      </head>
      <body>
        <div class="card">
          <h1>{employee['full_name']}</h1>
          <div class="meta">{employee['email']} • {employee['role']} • Range: {range_text}</div>
        </div>
        <div class="card">
          <h2>Attendance Summary</h2>
          <div class="grid">
            <div><strong>Days Present</strong><br/>{attendance['days_present']}</div>
            <div><strong>Total Hours</strong><br/>{attendance['total_hours']:.2f}</div>
            <div><strong>Avg / Day</strong><br/>{attendance['avg_hours_per_day']:.2f}</div>
          </div>
          <table>
            <thead><tr><th>Check In</th><th>Check Out</th><th style='text-align:right;'>Hours</th></tr></thead>
            <tbody>{attendance_rows}</tbody>
          </table>
        </div>
        <div class="card">
          <h2>Leaves Summary</h2>
          <div class="grid">
            <div><strong>Total Requests</strong><br/>{leaves['total_requests']}</div>
            <div><strong>Approved Days</strong><br/>{leaves['approved_days']}</div>
            <div><strong>Pending Requests</strong><br/>{leaves['pending_count']}</div>
          </div>
          <table>
            <thead><tr><th>Start</th><th>End</th><th>Type</th><th>Status</th></tr></thead>
            <tbody>{leave_rows}</tbody>
          </table>
        </div>
      </body>
    </html>
    """
    return HTMLResponse(content=html)


@router.put("/attendance/{attendance_id}", response_model=StandardResponse)
async def correct_attendance(
    attendance_id: uuid.UUID,
    correction: AttendanceCorrection,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN]))],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Admin manually corrects an attendance record."""
    stmt = select(AttendanceLog).where(AttendanceLog.id == attendance_id)
    result = await db.execute(stmt)
    log = result.scalar_one_or_none()

    if not log:
        raise HTTPException(status_code=404, detail="Attendance record not found")

    if correction.check_in_time is not None:
        log.check_in_time = correction.check_in_time
    if correction.check_out_time is not None:
        log.check_out_time = correction.check_out_time

    # Recalculate hours if both times present
    if log.check_in_time and log.check_out_time:
        from datetime import timezone
        cin = log.check_in_time if log.check_in_time.tzinfo else log.check_in_time.replace(tzinfo=timezone.utc)
        cout = log.check_out_time if log.check_out_time.tzinfo else log.check_out_time.replace(tzinfo=timezone.utc)

        if cout < cin:
            raise HTTPException(status_code=400, detail="check_out_time cannot be earlier than check_in_time")

        duration = cout - cin
        if duration.total_seconds() > 24 * 3600:
            raise HTTPException(status_code=400, detail="Shift duration cannot exceed 24 hours")

        log.hours_worked = round(duration.total_seconds() / 3600.0, 2)

    await db.commit()

    await AuditService.log_action(
        db=db,
        user_id=current_user.id,
        action="CORRECT_ATTENDANCE",
        target_id=str(attendance_id),
        details="Attendance record corrected by admin",
    )
    await db.commit()
    await _best_effort_recalc_user_current_previous(
        db,
        log.user_id,
        reason="attendance_correction",
    )

    return StandardResponse(message="Attendance record corrected")


@router.get("/members", response_model=StandardResponse)
async def list_members(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.COACH, Role.RECEPTION, Role.FRONT_DESK]))],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """List all users with MEMBER role."""
    from app.models.access import Subscription
    from app.models.subscription_enums import SubscriptionStatus
    stmt = select(User).where(User.role == Role.CUSTOMER).order_by(User.full_name)
    result = await db.execute(stmt)
    users = result.scalars().all()
    now = datetime.now(timezone.utc)

    data = []
    for u in users:
        # Get subscription status. Be defensive here so malformed legacy rows do not fail the entire list.
        sub = None
        effective_status = "NONE"
        subscription_end_date = None
        try:
            sub_stmt = select(Subscription).where(Subscription.user_id == u.id).order_by(Subscription.end_date.desc()).limit(1)
            sub_result = await db.execute(sub_stmt)
            sub = sub_result.scalar_one_or_none()
        except Exception:
            sub = None

        if sub:
            raw_status = sub.status.value if hasattr(sub.status, "value") else str(sub.status)
            effective_status = raw_status
            end_date = sub.end_date
            if end_date:
                if end_date.tzinfo is None:
                    end_date = end_date.replace(tzinfo=timezone.utc)
                if end_date < now:
                    effective_status = SubscriptionStatus.EXPIRED.value
                subscription_end_date = end_date.isoformat()

        data.append({
            "id": str(u.id),
            "full_name": u.full_name,
            "email": u.email,
            "role": u.role.value,
            "profile_picture_url": u.profile_picture_url,
            "phone_number": u.phone_number,
            "date_of_birth": u.date_of_birth.isoformat() if u.date_of_birth else None,
            "emergency_contact": u.emergency_contact,
            "bio": u.bio,
            "subscription": {
                "status": effective_status,
                "end_date": subscription_end_date,
            } if sub else None
        })

    return StandardResponse(data=data)


# ==================== SUBSCRIPTION MANAGEMENT ====================

class SubscriptionCreate(BaseModel):
    user_id: uuid.UUID
    plan_name: str = "Monthly"
    duration_days: int = Field(default=30, ge=1)
    amount_paid: float = Field(..., gt=0)
    payment_method: PaymentMethod = PaymentMethod.CASH

class SubscriptionUpdate(BaseModel):
    status: Literal["ACTIVE", "FROZEN"]


@router.post("/subscriptions", response_model=StandardResponse)
async def create_subscription(
    data: SubscriptionCreate,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.RECEPTION, Role.FRONT_DESK]))],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Create or renew a subscription for a member."""
    from app.models.access import Subscription
    from app.models.subscription_enums import SubscriptionStatus
    from datetime import timedelta, timezone

    stmt = select(Subscription).where(Subscription.user_id == data.user_id)
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()

    now = datetime.now(timezone.utc)
    end = now + timedelta(days=data.duration_days)

    if existing:
        existing.plan_name = data.plan_name
        existing.start_date = now
        existing.end_date = end
        existing.status = SubscriptionStatus.ACTIVE
        msg = "Subscription renewed"
    else:
        sub = Subscription(
            user_id=data.user_id,
            plan_name=data.plan_name,
            start_date=now,
            end_date=end,
            status=SubscriptionStatus.ACTIVE
        )
        db.add(sub)
        msg = "Subscription created"

    tx = Transaction(
        amount=data.amount_paid,
        type=TransactionType.INCOME,
        category=TransactionCategory.SUBSCRIPTION,
        payment_method=data.payment_method,
        description=f"Subscription {'renewal' if existing else 'activation'} - {data.plan_name}",
        user_id=data.user_id,
    )
    db.add(tx)

    await db.commit()

    user_result = await db.execute(select(User).where(User.id == data.user_id))
    member = user_result.scalar_one_or_none()
    if member:
        await WhatsAppNotificationService.queue_and_send(
            db=db,
            user=member,
            phone_number=member.phone_number,
            template_key="subscription_updated",
            event_type="SUBSCRIPTION_RENEWED" if existing else "SUBSCRIPTION_CREATED",
            event_ref=str(data.user_id),
            params={
                "member_name": member.full_name,
                "plan_name": data.plan_name,
                "duration_days": data.duration_days,
                "status": "ACTIVE",
            },
            idempotency_key=f"subscription-create:{data.user_id}:{end.date().isoformat()}",
        )
    
    await AuditService.log_action(
        db=db,
        user_id=current_user.id,
        action="RENEW_SUBSCRIPTION" if existing else "CREATE_SUBSCRIPTION",
        target_id=str(data.user_id),
        details=f"Plan: {data.plan_name}, Duration: {data.duration_days} days, Amount: {data.amount_paid} {data.payment_method.value}"
    )
    await db.commit()

    return StandardResponse(message=msg)


@router.put("/subscriptions/{user_id}", response_model=StandardResponse)
async def update_subscription(
    user_id: uuid.UUID,
    data: SubscriptionUpdate,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.RECEPTION, Role.FRONT_DESK]))],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Update subscription status: FREEZE or ACTIVATE (unfreeze)."""
    from app.models.access import Subscription
    from app.models.subscription_enums import SubscriptionStatus

    stmt = select(Subscription).where(Subscription.user_id == user_id)
    result = await db.execute(stmt)
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="No subscription found")

    now = datetime.now(timezone.utc)
    end_date = sub.end_date
    if end_date.tzinfo is None:
        end_date = end_date.replace(tzinfo=timezone.utc)
    if end_date < now:
        raise HTTPException(status_code=400, detail="Subscription is expired. Renew it to reactivate access.")

    sub.status = SubscriptionStatus(data.status)
    await db.commit()

    user_result = await db.execute(select(User).where(User.id == user_id))
    member = user_result.scalar_one_or_none()
    if member:
        await WhatsAppNotificationService.queue_and_send(
            db=db,
            user=member,
            phone_number=member.phone_number,
            template_key="subscription_status_changed",
            event_type="SUBSCRIPTION_STATUS_CHANGED",
            event_ref=str(user_id),
            params={
                "member_name": member.full_name,
                "status": data.status,
                "end_date": sub.end_date.isoformat() if sub.end_date else None,
            },
            idempotency_key=f"subscription-update:{user_id}:{data.status}:{sub.end_date.isoformat() if sub.end_date else 'none'}",
        )
    
    await AuditService.log_action(
        db=db,
        user_id=current_user.id,
        action="UPDATE_SUBSCRIPTION_STATUS",
        target_id=str(user_id),
        details=f"Status changed to {data.status}"
    )
    await db.commit()
    
    return StandardResponse(message=f"Subscription status updated to {data.status}")





@router.post("/leaves", response_model=StandardResponse)
async def create_leave_request(
    request: LeaveRequestCreate,
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Employee requests leave"""
    leave = LeaveRequest(
        user_id=current_user.id,
        start_date=request.start_date,
        end_date=request.end_date,
        leave_type=request.leave_type,
        status=LeaveStatus.PENDING,
        reason=request.reason
    )
    db.add(leave)
    await db.commit()
    await AuditService.log_action(db, current_user.id, "LEAVE_REQUESTED", f"Requested leave from {request.start_date} to {request.end_date}")
    return StandardResponse(message="Leave requested successfully")

@router.get("/leaves", response_model=StandardResponse)
async def get_all_leaves(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    status: Optional[LeaveStatus] = Query(None),
    leave_type: Optional[LeaveType] = Query(None),
    user_id: Optional[uuid.UUID] = Query(None),
    search: Optional[str] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """Admin gets all leaves"""
    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=400, detail="start_date cannot be after end_date")

    stmt = select(LeaveRequest, User).join(User, LeaveRequest.user_id == User.id)

    if status:
        stmt = stmt.where(LeaveRequest.status == status)
    if leave_type:
        stmt = stmt.where(LeaveRequest.leave_type == leave_type)
    if user_id:
        stmt = stmt.where(LeaveRequest.user_id == user_id)
    if search:
        q = f"%{search.strip().lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(User.full_name).like(q),
                func.lower(User.email).like(q),
            )
        )
    if start_date:
        stmt = stmt.where(LeaveRequest.end_date >= start_date)
    if end_date:
        stmt = stmt.where(LeaveRequest.start_date <= end_date)

    stmt = stmt.order_by(LeaveRequest.start_date.desc()).offset(offset).limit(limit)
    res = await db.execute(stmt)
    records = res.all()
    
    data = []
    for leave, user in records:
        data.append({
            "id": str(leave.id),
            "user_id": str(leave.user_id),
            "user_name": user.full_name,
            "start_date": leave.start_date.isoformat(),
            "end_date": leave.end_date.isoformat(),
            "leave_type": leave.leave_type.value,
            "status": leave.status.value,
            "reason": leave.reason
        })
    return StandardResponse(data=data)

@router.get("/leaves/me", response_model=StandardResponse)
async def get_my_leaves(
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Employee gets their own leaves"""
    stmt = select(LeaveRequest).where(LeaveRequest.user_id == current_user.id).order_by(LeaveRequest.start_date.desc())
    res = await db.execute(stmt)
    leaves = res.scalars().all()
    
    data = [{
        "id": str(l.id),
        "start_date": l.start_date.isoformat(),
        "end_date": l.end_date.isoformat(),
        "leave_type": l.leave_type.value,
        "status": l.status.value,
        "reason": l.reason
    } for l in leaves]
    return StandardResponse(data=data)

@router.put("/leaves/{leave_id}", response_model=StandardResponse)
async def update_leave_status(
    leave_id: uuid.UUID,
    request: LeaveRequestUpdate,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN]))],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Admin updates leave status"""
    stmt = select(LeaveRequest).where(LeaveRequest.id == leave_id)
    res = await db.execute(stmt)
    leave = res.scalar_one_or_none()
    
    if not leave:
        raise HTTPException(status_code=404, detail="Leave request not found")
        
    old_status = leave.status
    leave.status = request.status
    await db.commit()
    
    await AuditService.log_action(db, current_user.id, "LEAVE_STATUS_UPDATED", f"Leave {leave_id} status changed from {old_status} to {request.status}")
    await db.commit()

    should_recalc = (
        (old_status == LeaveStatus.APPROVED and request.status != LeaveStatus.APPROVED)
        or (old_status != LeaveStatus.APPROVED and request.status == LeaveStatus.APPROVED)
    )
    if should_recalc:
        try:
            periods = await PayrollAutomationService.get_current_previous_periods(db)
            start_dt = datetime.combine(leave.start_date, datetime.min.time(), tzinfo=timezone.utc)
            end_dt = datetime.combine(leave.end_date, datetime.max.time(), tzinfo=timezone.utc)
            periods_from_leave = await PayrollAutomationService.periods_from_date_range(
                db,
                start_date=start_dt,
                end_date=end_dt,
            )
            merged_periods = list(dict.fromkeys([*periods, *periods_from_leave]))
            await PayrollAutomationService.recalc_user_for_periods(
                db,
                user_id=leave.user_id,
                periods=merged_periods,
                dry_run=False,
            )
        except Exception:
            logger.exception("Payroll auto-recalc failed for leave status change %s", leave_id)

    return StandardResponse(message=f"Leave status updated to {request.status.value}")
