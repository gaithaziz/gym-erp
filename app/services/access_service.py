from datetime import datetime, timedelta, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from jose import jwt, JWTError
from fastapi import HTTPException
import uuid

from app.config import settings
from app.models.user import User
from app.models.access import AccessLog, AttendanceLog, Subscription, SubscriptionStatus

class AccessService:
    @staticmethod
    def generate_qr_token(user_id: uuid.UUID) -> tuple[str, int]:
        """Generates a short-lived JWT for QR code access."""
        expires_in = 30 # seconds
        expire = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
        to_encode = {"exp": expire, "sub": str(user_id), "type": "qr_access"}
        encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
        return encoded_jwt, expires_in

    @staticmethod
    async def process_scan(token: str, kiosk_id: str, db: AsyncSession) -> dict:
        """Validates QR token and user subscription status."""
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
            user_id: str = payload.get("sub")
            token_type: str = payload.get("type")
            if user_id is None or token_type != "qr_access":
                raise HTTPException(status_code=400, detail="Invalid QR Token")
        except JWTError:
            # Token expired or invalid signature
            return {"status": "DENIED", "reason": "QR_EXPIRED", "user_name": "Unknown"}

        # Fetch User and Subscription
        stmt = select(User).where(User.id == uuid.UUID(user_id))
        result = await db.execute(stmt)
        user = result.scalar_one_or_none()

        if not user:
            return {"status": "DENIED", "reason": "USER_NOT_FOUND", "user_name": "Unknown"}

        # Duplicate scan protection: check if user scanned within the last 60 seconds
        now = datetime.now(timezone.utc)
        cooldown = now - timedelta(seconds=60)
        stmt_recent = select(AccessLog).where(
            AccessLog.user_id == user.id,
            AccessLog.scan_time >= cooldown,
            AccessLog.status == "GRANTED"
        )
        result_recent = await db.execute(stmt_recent)
        recent_scan = result_recent.scalar_one_or_none()
        if recent_scan:
            return {"status": "ALREADY_SCANNED", "user_name": user.full_name, "reason": "Scanned within the last 60 seconds"}

        # Fetch active subscription
        # Logic: Must be ACTIVE and end_date >= now
        stmt_sub = select(Subscription).where(
            Subscription.user_id == user.id,
            Subscription.status == SubscriptionStatus.ACTIVE,
            Subscription.end_date >= now
        )
        result_sub = await db.execute(stmt_sub)
        subscription = result_sub.scalar_one_or_none()

        status_decision = "GRANTED"
        reason = None

        if not subscription:
            # Check if frozen or expired exists for better reason
            # For simplicity, if no active valid sub -> DENIED
            status_decision = "DENIED"
            reason = "NO_ACTIVE_SUBSCRIPTION"
            
            # Check specifically for expired to match requirements
            # "POST /access/scan returns DENIED with reason EXPIRED if date > end_date"
            stmt_expired = select(Subscription).where(
                Subscription.user_id == user.id,
                Subscription.status == SubscriptionStatus.ACTIVE,
                Subscription.end_date < now
            )
            result_expired = await db.execute(stmt_expired)
            expired_sub = result_expired.scalar_one_or_none()
            if expired_sub:
                reason = "SUBSCRIPTION_EXPIRED"
            else:
                 # Check frozen
                stmt_frozen = select(Subscription).where(
                    Subscription.user_id == user.id,
                    Subscription.status == SubscriptionStatus.FROZEN
                )
                result_frozen = await db.execute(stmt_frozen)
                if result_frozen.scalar_one_or_none():
                    reason = "SUBSCRIPTION_FROZEN"

        # Log Access
        access_log = AccessLog(
            user_id=user.id,
            status=status_decision,
            reason=reason,
            scan_time=now
        )
        db.add(access_log)
        await db.commit()

        return {
            "status": status_decision,
            "user_name": user.full_name,
            "reason": reason
        }

    @staticmethod
    async def process_check_in(user_id: uuid.UUID, db: AsyncSession):
        """Staff Check-in."""
        now = datetime.now(timezone.utc)
        # Check if already checked in without check out? 
        # Requirement: "POST /access/check-in creates an attendance_log entry"
        log = AttendanceLog(
            user_id=user_id,
            check_in_time=now
        )
        db.add(log)
        await db.commit()
        return log

    @staticmethod
    async def process_check_out(user_id: uuid.UUID, db: AsyncSession):
        """Staff Check-out."""
        # Find latest open check-in
        stmt = select(AttendanceLog).where(
            AttendanceLog.user_id == user_id,
            AttendanceLog.check_out_time.is_(None)
        ).order_by(AttendanceLog.check_in_time.desc()).limit(1)
        
        result = await db.execute(stmt)
        log = result.scalar_one_or_none()
        
        if not log:
            raise HTTPException(status_code=400, detail="No active check-in found")
        
        now = datetime.now(timezone.utc)
        log.check_out_time = now
        
        # Ensure log.check_in_time is aware
        check_in_time = log.check_in_time
        if check_in_time.tzinfo is None:
            check_in_time = check_in_time.replace(tzinfo=timezone.utc)

        # Calculate hours
        duration = now - check_in_time
        hours = duration.total_seconds() / 3600.0
        log.hours_worked = round(hours, 2)
        
        await db.commit()
        return log
