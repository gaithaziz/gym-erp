from datetime import date, datetime
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, Field

from app.database import get_db
from app.auth import dependencies
from app.models.user import User
from app.models.enums import Role
from app.models.hr import Contract, Payroll, ContractType, LeaveRequest, LeaveType, LeaveStatus
from app.models.access import AttendanceLog
from app.services.payroll_service import PayrollService
from app.services.audit_service import AuditService
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

class LeaveRequestCreate(BaseModel):
    start_date: date
    end_date: date
    leave_type: LeaveType
    reason: Optional[str] = None

class LeaveRequestUpdate(BaseModel):
    status: LeaveStatus

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
            "id": str(p.id),
            "month": p.month,
            "year": p.year,
            "total_pay": p.total_pay,
            "status": p.status
        } for p in payrolls
    ])

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
    """List all users with roles COACH or EMPLOYEE, including their contract info."""
    stmt = (
        select(User, Contract)
        .outerjoin(Contract, Contract.user_id == User.id)
        .where(User.role.in_([Role.COACH, Role.EMPLOYEE]))
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
    stmt = (
        select(AttendanceLog, User.full_name)
        .join(User, User.id == AttendanceLog.user_id)
        .order_by(AttendanceLog.check_in_time.desc())
    )
    if user_id:
        stmt = stmt.where(AttendanceLog.user_id == user_id)
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
            "profile_picture_url": u.profile_picture_url,
            "phone_number": u.phone_number,
            "date_of_birth": u.date_of_birth.isoformat() if u.date_of_birth else None,
            "emergency_contact": u.emergency_contact,
            "bio": u.bio,
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
    
    await AuditService.log_action(
        db=db,
        user_id=current_user.id,
        action="RENEW_SUBSCRIPTION" if existing else "CREATE_SUBSCRIPTION",
        target_id=str(data.user_id),
        details=f"Plan: {data.plan_name}, Duration: {data.duration_days} days"
    )
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
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Admin gets all leaves"""
    stmt = select(LeaveRequest, User).join(User, LeaveRequest.user_id == User.id).order_by(LeaveRequest.start_date.desc())
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
    return StandardResponse(message=f"Leave status updated to {request.status.value}")
