from datetime import datetime, timedelta, timezone
import time
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from jose import jwt, JWTError
from fastapi import HTTPException
import uuid

from app.config import settings
from app.models.user import User
from app.models.access import AccessLog, AttendanceLog, Subscription, SubscriptionStatus
from app.models.roaming import MemberRoamingAccess
from app.services import gamification_service
from app.services.tenancy_service import TenancyService
from app.services.whatsapp_service import WhatsAppNotificationService
from app.database import set_rls_context


class AccessRateLimiter:
    _requests: dict[str, list[float]] = {}
    MAX_REQUESTS = 120
    WINDOW_SECONDS = 60

    @classmethod
    def allow_request(cls, key: str) -> tuple[bool, int]:
        now = time.time()
        cutoff = now - cls.WINDOW_SECONDS

        recent = [timestamp for timestamp in cls._requests.get(key, []) if timestamp >= cutoff]
        if len(recent) >= cls.MAX_REQUESTS:
            cls._requests[key] = recent
            retry_after = max(1, int(cls.WINDOW_SECONDS - (now - recent[0])))
            return False, retry_after

        recent.append(now)
        cls._requests[key] = recent
        return True, 0

class AccessService:
    @staticmethod
    async def _with_super_admin_context(db: AsyncSession):
        prev_user_id = db.info.get("rls_user_id", "")
        prev_role = db.info.get("rls_user_role", "ANONYMOUS")
        prev_gym_id = db.info.get("rls_gym_id", "")
        prev_branch_id = db.info.get("rls_branch_id", "")
        await set_rls_context(db, role="SUPER_ADMIN")
        return prev_user_id, prev_role, prev_gym_id, prev_branch_id

    @staticmethod
    def generate_qr_token(user_id: uuid.UUID) -> tuple[str, int]:
        """Generates a short-lived JWT for QR code access."""
        expires_in = 30 # seconds
        expire = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
        to_encode = {"exp": expire, "sub": str(user_id), "type": "qr_access"}
        encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
        return encoded_jwt, expires_in

    @staticmethod
    async def _get_subscription_denial_reason(user_id: uuid.UUID, now: datetime, db: AsyncSession) -> str | None:
        """Return denial reason when access should be denied, otherwise None."""
        stmt_sub = select(Subscription).where(Subscription.user_id == user_id)
        result_sub = await db.execute(stmt_sub)
        subscription = result_sub.scalar_one_or_none()

        if not subscription:
            return "NO_ACTIVE_SUBSCRIPTION"
        end_date = subscription.end_date
        if end_date.tzinfo is None:
            end_date = end_date.replace(tzinfo=timezone.utc)
        if end_date < now:
            return "SUBSCRIPTION_EXPIRED"
        if subscription.status == SubscriptionStatus.FROZEN:
            return "SUBSCRIPTION_FROZEN"
        if subscription.status != SubscriptionStatus.ACTIVE:
            return "NO_ACTIVE_SUBSCRIPTION"
        return None

    @staticmethod
    async def process_scan(token: str, kiosk_id: str, db: AsyncSession) -> dict:
        """Validates QR token and user subscription status."""
        prev_ctx = await AccessService._with_super_admin_context(db)
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
            user_id = payload.get("sub")
            token_type = payload.get("type")
            if user_id is None or token_type != "qr_access":
                raise HTTPException(status_code=400, detail="Invalid QR Token")
        except JWTError:
            await set_rls_context(
                db,
                user_id=prev_ctx[0],
                role=prev_ctx[1],
                gym_id=prev_ctx[2],
                branch_id=prev_ctx[3],
            )
            # Token expired or invalid signature
            return {
                "status": "DENIED",
                "reason": "QR_EXPIRED",
                "user_name": "Unknown",
                "kiosk_id": kiosk_id,
                "scan_time": datetime.now(timezone.utc).isoformat(),
            }

        # Fetch User and Subscription
        stmt = select(User).where(User.id == uuid.UUID(user_id))
        result = await db.execute(stmt)
        user = result.scalar_one_or_none()

        if not user:
            return {
                "status": "DENIED",
                "reason": "USER_NOT_FOUND",
                "user_name": "Unknown",
                "kiosk_id": kiosk_id,
                "scan_time": datetime.now(timezone.utc).isoformat(),
            }
        await set_rls_context(
            db,
            role="SUPER_ADMIN",
            gym_id=str(user.gym_id),
            branch_id=str(user.home_branch_id) if user.home_branch_id else "",
        )

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
            return {
                "status": "ALREADY_SCANNED",
                "user_name": user.full_name,
                "reason": "Scanned within the last 60 seconds",
                "kiosk_id": kiosk_id,
                "scan_time": now.isoformat(),
            }

        status_decision = "GRANTED"
        reason = None

        denial_reason = await AccessService._get_subscription_denial_reason(user.id, now, db)
        if denial_reason:
            status_decision = "DENIED"
            reason = denial_reason

        # Log Access
        access_log = AccessLog(
            user_id=user.id,
            kiosk_id=kiosk_id,
            status=status_decision,
            reason=reason,
            scan_time=now,
            branch_id=await TenancyService.resolve_user_attribution_branch_id(db, user=user),
            gym_id=user.gym_id,
        )
        db.add(access_log)
        if status_decision == "GRANTED":
            # Flush the granted access log first so milestone queries include this check-in.
            await db.flush()
            await gamification_service.update_streak(user.id, db)
            await gamification_service.check_time_based_badge(user.id, now, db)

        await db.commit()
        if status_decision == "GRANTED":
            try:
                await WhatsAppNotificationService.queue_and_send(
                    db=db,
                    user=user,
                    phone_number=user.phone_number,
                    template_key="activity_check_in",
                    event_type="ACCESS_GRANTED",
                    event_ref=str(access_log.id),
                    params={
                        "member_name": user.full_name,
                        "kiosk_id": kiosk_id,
                        "scan_time": now.isoformat(),
                    },
                    idempotency_key=f"access-granted:{access_log.id}",
                )
            except Exception:
                # Notification side effects are best-effort and must not break access control flow.
                pass

        result = {
            "status": status_decision,
            "user_name": user.full_name,
            "reason": reason,
            "kiosk_id": kiosk_id,
            "scan_time": now.isoformat(),
        }
        await set_rls_context(
            db,
            user_id=prev_ctx[0],
            role=prev_ctx[1],
            gym_id=prev_ctx[2],
            branch_id=prev_ctx[3],
        )
        return result

    @staticmethod
    async def process_session_check_in(
        user_id: uuid.UUID,
        kiosk_id: str,
        db: AsyncSession,
        *,
        host_branch_id: uuid.UUID | None = None,
        granted_by_user_id: uuid.UUID | None = None,
    ) -> dict:
        """Processes an authenticated check-in for a user scanning a static kiosk QR."""
        prev_ctx = await AccessService._with_super_admin_context(db)
        stmt = select(User).where(User.id == user_id)
        result = await db.execute(stmt)
        user = result.scalar_one_or_none()

        if not user:
            await set_rls_context(
                db,
                user_id=prev_ctx[0],
                role=prev_ctx[1],
                gym_id=prev_ctx[2],
                branch_id=prev_ctx[3],
            )
            return {
                "status": "DENIED",
                "reason": "USER_NOT_FOUND",
                "user_name": "Unknown",
                "kiosk_id": kiosk_id,
                "scan_time": datetime.now(timezone.utc).isoformat(),
            }
        await set_rls_context(
            db,
            role="SUPER_ADMIN",
            gym_id=str(user.gym_id),
            branch_id=str(user.home_branch_id) if user.home_branch_id else "",
        )

        now = datetime.now(timezone.utc)

        # Duplicate check-in protection for rapid re-scans.
        cooldown = now - timedelta(seconds=60)
        stmt_recent = select(AccessLog).where(
            AccessLog.user_id == user.id,
            AccessLog.scan_time >= cooldown,
            AccessLog.status == "GRANTED"
        )
        result_recent = await db.execute(stmt_recent)
        recent_scan = result_recent.scalar_one_or_none()
        if recent_scan:
            result = {
                "status": "ALREADY_SCANNED",
                "user_name": user.full_name,
                "reason": "Scanned within the last 60 seconds",
                "kiosk_id": kiosk_id,
                "scan_time": now.isoformat(),
            }
            await set_rls_context(
                db,
                user_id=prev_ctx[0],
                role=prev_ctx[1],
                gym_id=prev_ctx[2],
                branch_id=prev_ctx[3],
            )
            return result

        status_decision = "GRANTED"
        reason = None

        denial_reason = await AccessService._get_subscription_denial_reason(user.id, now, db)
        if denial_reason:
            status_decision = "DENIED"
            reason = denial_reason

        access_log = AccessLog(
            user_id=user.id,
            kiosk_id=kiosk_id,
            status=status_decision,
            reason=reason,
            scan_time=now,
            branch_id=host_branch_id or await TenancyService.resolve_user_attribution_branch_id(db, user=user),
            gym_id=user.gym_id,
        )
        db.add(access_log)
        if status_decision == "GRANTED":
            # Flush the granted access log first so milestone queries include this check-in.
            await db.flush()
            if (
                host_branch_id is not None
                and user.home_branch_id is not None
                and host_branch_id != user.home_branch_id
                and granted_by_user_id is not None
            ):
                expires_at = now + timedelta(hours=12)
                roaming = (
                    await db.execute(
                        select(MemberRoamingAccess).where(
                            MemberRoamingAccess.member_id == user.id,
                            MemberRoamingAccess.branch_id == host_branch_id,
                        )
                    )
                ).scalar_one_or_none()
                if roaming is None:
                    roaming = MemberRoamingAccess(
                        gym_id=user.gym_id,
                        branch_id=host_branch_id,
                        member_id=user.id,
                        granted_by_user_id=granted_by_user_id,
                        granted_at=now,
                        expires_at=expires_at,
                        revoked_at=None,
                    )
                    db.add(roaming)
                else:
                    roaming.granted_by_user_id = granted_by_user_id
                    roaming.granted_at = now
                    roaming.expires_at = expires_at
                    roaming.revoked_at = None
            await gamification_service.update_streak(user.id, db)
            await gamification_service.check_time_based_badge(user.id, now, db)

        await db.commit()
        if status_decision == "GRANTED":
            try:
                await WhatsAppNotificationService.queue_and_send(
                    db=db,
                    user=user,
                    phone_number=user.phone_number,
                    template_key="activity_check_in",
                    event_type="ACCESS_GRANTED",
                    event_ref=str(access_log.id),
                    params={
                        "member_name": user.full_name,
                        "kiosk_id": kiosk_id,
                        "scan_time": now.isoformat(),
                    },
                    idempotency_key=f"access-granted:{access_log.id}",
                )
            except Exception:
                # Notification side effects are best-effort and must not break access control flow.
                pass

        result = {
            "status": status_decision,
            "user_name": user.full_name,
            "reason": reason,
            "kiosk_id": kiosk_id,
            "scan_time": now.isoformat(),
        }
        await set_rls_context(
            db,
            user_id=prev_ctx[0],
            role=prev_ctx[1],
            gym_id=prev_ctx[2],
            branch_id=prev_ctx[3],
        )
        return result

    @staticmethod
    async def process_check_in(user_id: uuid.UUID, db: AsyncSession):
        """Staff Check-in."""
        open_log_stmt = select(AttendanceLog).where(
            AttendanceLog.user_id == user_id,
            AttendanceLog.check_out_time.is_(None)
        ).order_by(AttendanceLog.check_in_time.desc()).limit(1)
        open_log_result = await db.execute(open_log_stmt)
        open_log = open_log_result.scalar_one_or_none()
        if open_log:
            raise HTTPException(status_code=400, detail="User already has an active check-in")

        now = datetime.now(timezone.utc)

        # Fetch user to resolve canonical branch attribution.
        user_stmt = select(User).where(User.id == user_id)
        user_result = await db.execute(user_stmt)
        u = user_result.scalar_one_or_none()
        branch_id = await TenancyService.resolve_user_attribution_branch_id(db, user=u) if u else None

        log = AttendanceLog(
            user_id=user_id,
            check_in_time=now,
            branch_id=branch_id
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

    @staticmethod
    async def get_all_members_for_sync(db: AsyncSession) -> list[dict]:
        """Fetches all members and their subscription status for offline sync."""
        # Join User and Subscription. We want ALL users that have roles implies membership? 
        # Or just all users. Let's return all users for now, or maybe filter by Role.CUSTOMER
        # PRD says "Active Members". Let's get all so we can replicate logic.
        
        # We need to be careful about imports inside method if circular, but here it is fine.
        stmt = select(User, Subscription).outerjoin(Subscription, User.id == Subscription.user_id)
        result = await db.execute(stmt)
        
        data = []
        # Result is list of (User, Subscription|None)
        rows = result.all()
        
        for user, sub in rows:
            data.append({
                "id": str(user.id),
                "full_name": user.full_name,
                "subscription": {
                    "status": sub.status.value if sub else "INACTIVE",
                    "end_date": sub.end_date.isoformat() if sub and sub.end_date else None
                } if sub else None
            })
            
        return data
