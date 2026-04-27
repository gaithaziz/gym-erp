from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import security
from app.config import settings
from app.models.auth import PasswordResetToken, RefreshToken
from app.models.user import User
from app.services.email_service import EmailService

logger = logging.getLogger(__name__)


class PasswordResetService:
    @staticmethod
    async def revoke_user_sessions(db: AsyncSession, *, user: User) -> None:
        now = datetime.now(timezone.utc)
        stmt = (
            update(RefreshToken)
            .where(
                RefreshToken.user_id == user.id,
                RefreshToken.gym_id == user.gym_id,
                RefreshToken.revoked_at.is_(None),
            )
            .values(revoked_at=now)
        )
        await db.execute(stmt)
        user.session_version = int(user.session_version or 0) + 1
        db.add(user)

    @staticmethod
    async def issue_reset_token(db: AsyncSession, *, user: User) -> str:
        raw_token = secrets.token_urlsafe(32)
        now = datetime.now(timezone.utc)
        record = PasswordResetToken(
            gym_id=user.gym_id,
            user_id=user.id,
            token_hash=security.hash_token(raw_token),
            expires_at=now + timedelta(minutes=settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES),
        )
        db.add(record)
        await db.commit()
        return raw_token

    @staticmethod
    async def send_reset_link(*, user: User, raw_token: str) -> None:
        reset_url = EmailService.build_password_reset_url(raw_token)
        mobile_reset_url = EmailService.build_mobile_password_reset_url(raw_token)
        result = await EmailService.send_password_reset_link(
            to_email=user.email,
            reset_url=reset_url,
            mobile_reset_url=mobile_reset_url,
            full_name=user.full_name,
        )
        if result.status == "FAILED":
            logger.error("Failed to send password reset email for %s: %s", user.email, result.error_message)

    @staticmethod
    async def confirm_password_reset(db: AsyncSession, *, token: str, new_password: str) -> User:
        now = datetime.now(timezone.utc)
        token_hash = security.hash_token(token)
        stmt = select(PasswordResetToken).where(
            PasswordResetToken.token_hash == token_hash,
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.expires_at > now,
        )
        record = (await db.execute(stmt)).scalar_one_or_none()
        if record is None:
            raise ValueError("invalid_reset_token")

        user = await db.get(User, record.user_id)
        if user is None:
            raise ValueError("invalid_reset_token")

        await PasswordResetService.revoke_user_sessions(db, user=user)
        user.hashed_password = security.get_password_hash(new_password)
        record.used_at = now
        db.add_all([user, record])
        await db.commit()
        await db.refresh(user)
        return user
