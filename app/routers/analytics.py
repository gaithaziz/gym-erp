from typing import Annotated
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.auth import dependencies
from app.models.user import User
from app.models.enums import Role
from app.services.analytics import AnalyticsService
from app.core.responses import StandardResponse

router = APIRouter()

@router.get("/dashboard", response_model=StandardResponse)
async def get_dashboard(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN]))],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    stats = await AnalyticsService.get_dashboard_stats(db)
    return StandardResponse(data=stats)

@router.get("/attendance", response_model=StandardResponse)
async def get_attendance_trends(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    days: int = 30
):
    trends = await AnalyticsService.get_attendance_trends(days, db)
    return StandardResponse(data=trends)

@router.get("/revenue-chart", response_model=StandardResponse)
async def get_revenue_chart(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    days: int = 30
):
    data = await AnalyticsService.get_revenue_vs_expenses(days, db)
    return StandardResponse(data=data)
