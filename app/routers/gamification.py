from typing import Annotated
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.auth import dependencies
from app.models.user import User
from app.core.responses import StandardResponse
from app.services import gamification_service

router = APIRouter()


@router.get("/stats", response_model=StandardResponse)
async def get_my_gamification_stats(
    current_user: Annotated[User, Depends(dependencies.require_active_customer_subscription)],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Get gamification stats for the current user (streaks, badges, total visits)."""
    stats = await gamification_service.get_user_stats(current_user.id, db)
    return StandardResponse(data=stats)
