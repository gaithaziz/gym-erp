from typing import Annotated
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.auth import dependencies
from app.models.user import User
from app.models.enums import Role
from app.services.access_service import AccessService
from app.core.responses import StandardResponse
from pydantic import BaseModel

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
    # Kiosk authentication? For now, open or maybe protected by a static API key/admin token.
    # The requirement doesn't specify auth for Kiosk, but it implies a machine.
    # We will leave it open or require generic auth if needed.
    # Let's assume Kiosk checks are public or use a shared secret in headers (not implemented yet).
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
