from datetime import datetime, timedelta, timezone
from typing import Annotated
import hashlib
import json
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, status
from jose import JWTError, jwt
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import dependencies
from app.config import settings
from app.core.responses import StandardResponse
from app.database import get_db
from app.models.access import AccessLog
from app.models.enums import Role
from app.models.user import User
from app.services.access_service import AccessRateLimiter, AccessService
from app.services.payroll_automation_service import PayrollAutomationService

router = APIRouter()


class QRTokenResponse(BaseModel):
    qr_token: str
    expires_in_seconds: int


class AccessScanRequest(BaseModel):
    qr_token: str
    kiosk_id: str = Field(min_length=3, max_length=64, pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]*$")


class AccessScanResponse(BaseModel):
    status: str
    user_name: str
    reason: str | None = None


class SessionCheckInRequest(BaseModel):
    kiosk_id: str = Field(min_length=3, max_length=64, pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]*$")


class KioskAuthRequest(BaseModel):
    kiosk_id: str = Field(min_length=3, max_length=64, pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]*$")


class KioskAuthResponse(BaseModel):
    kiosk_token: str
    expires_in_seconds: int


class AccessLogResponse(BaseModel):
    id: uuid.UUID
    scan_time: datetime
    kiosk_id: str | None = None
    status: str
    reason: str | None = None

    class Config:
        from_attributes = True


def _kiosk_signing_key() -> str:
    return settings.KIOSK_SIGNING_KEY or settings.SECRET_KEY


def _create_kiosk_token(kiosk_id: str) -> tuple[str, int]:
    expires_delta = timedelta(minutes=settings.KIOSK_TOKEN_EXPIRE_MINUTES)
    expires_at = datetime.now(timezone.utc) + expires_delta
    payload = {
        "sub": kiosk_id,
        "type": "kiosk",
        "exp": int(expires_at.timestamp()),
    }
    token = jwt.encode(payload, _kiosk_signing_key(), algorithm=settings.ALGORITHM)
    return token, int(expires_delta.total_seconds())


def _verify_kiosk_token(kiosk_token: str, expected_kiosk_id: str) -> None:
    try:
        payload = jwt.decode(kiosk_token, _kiosk_signing_key(), algorithms=[settings.ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid kiosk credentials",
        )

    token_type = payload.get("type")
    token_kiosk_id = payload.get("sub")
    if token_type != "kiosk" or token_kiosk_id != expected_kiosk_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Kiosk credentials do not match this device",
        )


@router.post("/kiosk/auth", response_model=StandardResponse[KioskAuthResponse])
async def create_kiosk_auth(
    auth_request: KioskAuthRequest,
    _current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.EMPLOYEE, Role.RECEPTION, Role.FRONT_DESK]))],
):
    token, expires_in_seconds = _create_kiosk_token(auth_request.kiosk_id)
    return StandardResponse(
        data=KioskAuthResponse(kiosk_token=token, expires_in_seconds=expires_in_seconds),
        message=f"Kiosk token issued for {auth_request.kiosk_id}",
    )


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
    kiosk_token: Annotated[str, Header(alias="X-Kiosk-Token")],
):
    _verify_kiosk_token(kiosk_token, scan_request.kiosk_id)

    allowed, retry_after = AccessRateLimiter.allow_request(scan_request.kiosk_id)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Too many scan requests. Retry in {retry_after} seconds."
        )

    result = await AccessService.process_scan(scan_request.qr_token, scan_request.kiosk_id, db)
    return StandardResponse(data=AccessScanResponse(**result))


@router.post("/scan-session", response_model=StandardResponse[AccessScanResponse])
async def scan_from_authenticated_session(
    request: SessionCheckInRequest,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.COACH, Role.EMPLOYEE, Role.CASHIER, Role.RECEPTION, Role.FRONT_DESK, Role.CUSTOMER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    allowed, retry_after = AccessRateLimiter.allow_request(request.kiosk_id)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Too many scan requests. Retry in {retry_after} seconds."
        )

    result = await AccessService.process_session_check_in(current_user.id, request.kiosk_id, db)
    return StandardResponse(data=AccessScanResponse(**result))


@router.post("/check-in", response_model=StandardResponse)
async def check_in(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.COACH, Role.EMPLOYEE, Role.CASHIER, Role.RECEPTION, Role.FRONT_DESK]))],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    await AccessService.process_check_in(current_user.id, db)
    return StandardResponse(message="Clocked In Successfully")


@router.post("/check-out", response_model=StandardResponse)
async def check_out(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.COACH, Role.EMPLOYEE, Role.CASHIER, Role.RECEPTION, Role.FRONT_DESK]))],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    log = await AccessService.process_check_out(current_user.id, db)
    try:
        periods = await PayrollAutomationService.get_current_previous_periods(db)
        await PayrollAutomationService.recalc_user_for_periods(
            db,
            user_id=current_user.id,
            periods=periods,
            dry_run=False,
        )
    except Exception:
        # Best effort only, checkout should not fail on payroll refresh errors.
        pass
    return StandardResponse(message=f"Clocked Out. Hours: {log.hours_worked}")


@router.get("/members", response_model=StandardResponse[dict])
async def sync_members(
    kiosk_id: Annotated[str, Header(alias="X-Kiosk-Id", min_length=3, max_length=64, pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]*$")],
    kiosk_token: Annotated[str, Header(alias="X-Kiosk-Token")],
    _current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.EMPLOYEE, Role.RECEPTION, Role.FRONT_DESK]))],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    _verify_kiosk_token(kiosk_token, kiosk_id)

    members = await AccessService.get_all_members_for_sync(db)
    generated_at = datetime.now(timezone.utc).isoformat()
    checksum = hashlib.sha256(json.dumps(members, sort_keys=True).encode("utf-8")).hexdigest()
    payload = {
        "version": 1,
        "generated_at": generated_at,
        "cache_ttl_seconds": 300,
        "checksum": checksum,
        "members": members,
    }
    return StandardResponse(data=payload)


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
