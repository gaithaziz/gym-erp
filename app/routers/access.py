from typing import Annotated
from datetime import datetime
import uuid
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.database import get_db
from app.auth import dependencies
from app.models.user import User
from app.models.enums import Role
from app.models.access import AccessLog
from app.services.access_service import AccessService
from app.core.responses import StandardResponse

router = APIRouter()

class QRTokenResponse(BaseModel):
    qr_token: str
    expires_in_seconds: int

class AccessScanRequest(BaseModel):
    qr_token: str
    kiosk_id: str

class AccessScanResponse(BaseModel):
    status: str
    user_name: str
    reason: str | None = None

class AccessLogResponse(BaseModel):
    id: uuid.UUID
    scan_time: datetime
    status: str
    reason: str | None = None

    class Config:
        from_attributes = True

@router.get("/qr", response_model=StandardResponse[QRTokenResponse])
async def generate_qr(
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
):
    token, expires_in = AccessService.generate_qr_token(current_user.id)
    return StandardResponse(
        data=QRTokenResponse(qr_token=token, expires_in_seconds=expires_in)
    )

@router.post("/scan", response_model=StandardResponse[AccessScanResponse])
async def scan_qr(
    scan_request: AccessScanRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await AccessService.process_scan(scan_request.qr_token, scan_request.kiosk_id, db)
    return StandardResponse(data=AccessScanResponse(**result))

@router.post("/check-in", response_model=StandardResponse)
async def check_in(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.COACH, Role.EMPLOYEE]))],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    await AccessService.process_check_in(current_user.id, db)
    return StandardResponse(message="Clocked In Successfully")

@router.post("/check-out", response_model=StandardResponse)
async def check_out(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.COACH, Role.EMPLOYEE]))],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    log = await AccessService.process_check_out(current_user.id, db)
    return StandardResponse(message=f"Clocked Out. Hours: {log.hours_worked}")

@router.get("/members", response_model=StandardResponse[list[dict]])
async def sync_members(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.EMPLOYEE]))],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    members = await AccessService.get_all_members_for_sync(db)
    return StandardResponse(data=members)

@router.get("/my-history", response_model=StandardResponse[list[AccessLogResponse]])
async def get_my_history(
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Get access history for the current user."""
    stmt = select(AccessLog).where(AccessLog.user_id == current_user.id).order_by(AccessLog.scan_time.desc())
    result = await db.execute(stmt)
    logs = result.scalars().all()
    return StandardResponse(data=[AccessLogResponse.model_validate(log) for log in logs])
