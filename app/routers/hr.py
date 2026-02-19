from datetime import date, datetime
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, Field

from app.database import get_db
from app.auth import dependencies
from app.models.user import User
from app.models.enums import Role
from app.models.hr import Contract, Payroll, ContractType
from app.models.access import AttendanceLog
from app.services.payroll_service import PayrollService
from app.core.responses import StandardResponse
import uuid

router = APIRouter()

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
        contract.end_date = contract_data.end_date
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
    return StandardResponse(message=msg)

@router.post("/payroll/generate", response_model=StandardResponse)
async def generate_payroll(
    request: PayrollRequest,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN]))],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    payroll = await PayrollService.calculate_payroll(request.user_id, request.month, request.year, request.sales_volume, db)
    return StandardResponse(
        message=f"Payroll generated for {request.month}/{request.year}",
        data={
            "user_id": str(payroll.user_id),
            "base_pay": payroll.base_pay,
            "overtime_pay": payroll.overtime_pay,
            "total_pay": payroll.total_pay
        }
    )

@router.get("/payroll/{user_id}", response_model=StandardResponse)
async def get_payrolls(
    user_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.COACH, Role.EMPLOYEE]))],
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
            "month": p.month,
            "year": p.year,
            "total_pay": p.total_pay,
            "status": p.status
        } for p in payrolls
    ])

@router.get("/staff", response_model=StandardResponse)
async def get_staff(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN]))],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """List all users with roles COACH or EMPLOYEE, including their contract info."""
    stmt = select(User).where(User.role.in_([Role.COACH, Role.EMPLOYEE])).order_by(User.full_name)
    result = await db.execute(stmt)
    staff_members = result.scalars().all()
    
    # We might want to fetch contracts too. 
    # For now, let's just return User info. 
    # Ideal: join with Contract.
    
    data = []
    for staff in staff_members:
        # Lazy load contract if needed, or just return basic info
        # Let's do a separate query or join for better performance, but for V1 loop is okay for small staff
        contract_stmt = select(Contract).where(Contract.user_id == staff.id)
        c_result = await db.execute(contract_stmt)
        contract = c_result.scalar_one_or_none()
        
        data.append({
            "id": str(staff.id),
            "full_name": staff.full_name,
            "email": staff.email,
            "role": staff.role.value,
            "contract": {
                "type": contract.contract_type.value if contract else None,
                "base_salary": contract.base_salary if contract else None,
                "commission_rate": contract.commission_rate if contract else None
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
    limit: int = 100
):
    """List attendance logs (timesheet). Optionally filter by user_id."""
    stmt = select(AttendanceLog).order_by(AttendanceLog.check_in_time.desc())
    if user_id:
        stmt = stmt.where(AttendanceLog.user_id == user_id)
    stmt = stmt.limit(limit)
    result = await db.execute(stmt)
    logs = result.scalars().all()

    # Also fetch user names for display
    data = []
    for log in logs:
        user_stmt = select(User).where(User.id == log.user_id)
        user_result = await db.execute(user_stmt)
        user = user_result.scalar_one_or_none()
        data.append({
            "id": str(log.id),
            "user_id": str(log.user_id),
            "user_name": user.full_name if user else "Unknown",
            "check_in_time": log.check_in_time.isoformat() if log.check_in_time else None,
            "check_out_time": log.check_out_time.isoformat() if log.check_out_time else None,
            "hours_worked": log.hours_worked
        })

    return StandardResponse(data=data)


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
        duration = cout - cin
        log.hours_worked = round(duration.total_seconds() / 3600.0, 2)

    await db.commit()
    return StandardResponse(message="Attendance record corrected")


@router.get("/members", response_model=StandardResponse)
async def list_members(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.COACH]))],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """List all users with MEMBER role."""
    from app.models.access import Subscription
    stmt = select(User).where(User.role == Role.CUSTOMER).order_by(User.full_name)
    result = await db.execute(stmt)
    users = result.scalars().all()

    data = []
    for u in users:
        # Get subscription status
        sub_stmt = select(Subscription).where(Subscription.user_id == u.id).order_by(Subscription.end_date.desc()).limit(1)
        sub_result = await db.execute(sub_stmt)
        sub = sub_result.scalar_one_or_none()

        data.append({
            "id": str(u.id),
            "full_name": u.full_name,
            "email": u.email,
            "role": u.role.value,
            "subscription": {
                "status": sub.status.value if sub else "NONE",
                "end_date": sub.end_date.isoformat() if sub and sub.end_date else None,
            } if sub else None
        })

    return StandardResponse(data=data)


# ==================== SUBSCRIPTION MANAGEMENT ====================

class SubscriptionCreate(BaseModel):
    user_id: uuid.UUID
    plan_name: str = "Monthly"
    duration_days: int = 30

class SubscriptionUpdate(BaseModel):
    status: str  # ACTIVE, FROZEN, EXPIRED


@router.post("/subscriptions", response_model=StandardResponse)
async def create_subscription(
    data: SubscriptionCreate,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN]))],
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

    await db.commit()
    return StandardResponse(message=msg)


@router.put("/subscriptions/{user_id}", response_model=StandardResponse)
async def update_subscription(
    user_id: uuid.UUID,
    data: SubscriptionUpdate,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN]))],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Update subscription status: FREEZE, CANCEL, ACTIVATE."""
    from app.models.access import Subscription
    from app.models.subscription_enums import SubscriptionStatus

    stmt = select(Subscription).where(Subscription.user_id == user_id)
    result = await db.execute(stmt)
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="No subscription found")

    sub.status = SubscriptionStatus(data.status)
    await db.commit()
    return StandardResponse(message=f"Subscription status updated to {data.status}")



