from datetime import date
from typing import Annotated, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, Field

from app.database import get_db
from app.auth import dependencies
from app.models.user import User
from app.models.enums import Role
from app.models.hr import Contract, Payroll, ContractType
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

class PayrollRequest(BaseModel):
    user_id: uuid.UUID
    month: int = Field(..., ge=1, le=12)
    year: int = Field(..., ge=2000, le=2100)

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
    payroll = await PayrollService.calculate_payroll(request.user_id, request.month, request.year, db)
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
