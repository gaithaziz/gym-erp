import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import dependencies, schemas
from app.core.responses import StandardResponse
from app.database import get_db
from app.models.user import User
from app.services.mobile_customer_service import MobileCustomerService
from app.services.mobile_bootstrap_service import MobileBootstrapService

router = APIRouter()


class MobileCustomerHomeResponse(BaseModel):
    subscription: dict[str, Any]
    qr: dict[str, Any]
    quick_stats: dict[str, int]
    latest_biometric: dict[str, Any] | None = None
    recent_receipts: list[dict[str, Any]]


class MobileCustomerBillingResponse(BaseModel):
    subscription: dict[str, Any]
    renewal_offers: list[dict[str, Any]]
    payable_items: list[dict[str, Any]]
    receipts: list[dict[str, Any]]
    payment_policy: dict[str, Any]


class MobileCustomerPlansResponse(BaseModel):
    workout_plans: list[dict[str, Any]]
    diet_plans: list[dict[str, Any]]


class MobileCustomerProgressResponse(BaseModel):
    biometrics: list[dict[str, Any]]
    attendance_history: list[dict[str, Any]]
    recent_workout_sessions: list[dict[str, Any]]
    workout_stats: list[dict[str, Any]]


class MobileCustomerNotificationsResponse(BaseModel):
    items: list[dict[str, Any]]


@router.get("/bootstrap", response_model=StandardResponse[schemas.MobileBootstrap])
async def read_mobile_bootstrap(
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    bootstrap = await MobileBootstrapService.build_bootstrap(current_user=current_user, db=db)
    return StandardResponse(data=bootstrap)


@router.get("/customer/home", response_model=StandardResponse[MobileCustomerHomeResponse])
async def read_customer_home(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([schemas.Role.CUSTOMER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    summary = await MobileCustomerService.get_home_summary(current_user=current_user, db=db)
    return StandardResponse(data=MobileCustomerHomeResponse(**summary))


@router.get("/customer/billing", response_model=StandardResponse[MobileCustomerBillingResponse])
async def read_customer_billing(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([schemas.Role.CUSTOMER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    summary = await MobileCustomerService.get_billing_overview(current_user=current_user, db=db)
    return StandardResponse(data=MobileCustomerBillingResponse(**summary))


@router.get("/customer/receipts/{transaction_id}", response_model=StandardResponse[dict[str, Any]])
async def read_customer_receipt_detail(
    transaction_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([schemas.Role.CUSTOMER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    try:
        detail = await MobileCustomerService.get_receipt_detail(
            current_user=current_user,
            transaction_id=transaction_id,
            db=db,
        )
    except ValueError:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Receipt not found")
    return StandardResponse(data=detail)


@router.get("/customer/plans", response_model=StandardResponse[MobileCustomerPlansResponse])
async def read_customer_plans(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([schemas.Role.CUSTOMER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    payload = await MobileCustomerService.get_plans(current_user=current_user, db=db)
    return StandardResponse(data=MobileCustomerPlansResponse(**payload))


@router.get("/customer/progress", response_model=StandardResponse[MobileCustomerProgressResponse])
async def read_customer_progress(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([schemas.Role.CUSTOMER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    payload = await MobileCustomerService.get_progress(current_user=current_user, db=db)
    return StandardResponse(data=MobileCustomerProgressResponse(**payload))


@router.get("/customer/notifications", response_model=StandardResponse[MobileCustomerNotificationsResponse])
async def read_customer_notifications(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([schemas.Role.CUSTOMER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    items = await MobileCustomerService.get_notifications(current_user=current_user, db=db)
    return StandardResponse(data=MobileCustomerNotificationsResponse(items=items))
