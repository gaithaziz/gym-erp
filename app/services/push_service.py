import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.notification import MobileDevice, MobileNotificationPreference, PushDeliveryLog
from app.models.tenancy import UserBranchAccess
from app.models.user import User


@dataclass
class PushSendResult:
    status: str
    provider_message_id: str | None = None
    error_message: str | None = None


class ExpoPushProvider:
    async def send(self, *, token: str, title: str, body: str, data: dict[str, Any]) -> PushSendResult:
        if not settings.PUSH_ENABLED:
            return PushSendResult(status="SKIPPED", error_message="Push disabled")
        if settings.PUSH_DRY_RUN:
            return PushSendResult(status="SENT", provider_message_id="dry-run")

        payload = {"to": token, "title": title, "body": body, "data": data, "sound": "default"}
        try:
            async with httpx.AsyncClient(timeout=settings.PUSH_TIMEOUT_SECONDS) as client:
                response = await client.post(settings.PUSH_API_URL, json=payload)
            if response.status_code >= 400:
                return PushSendResult(status="FAILED", error_message=f"HTTP {response.status_code}")
            response_data = response.json() if response.content else {}
            ticket = response_data.get("data", {})
            if isinstance(ticket, dict) and ticket.get("status") == "error":
                return PushSendResult(status="FAILED", error_message=str(ticket.get("message") or ticket.get("details") or "Expo error"))
            provider_id = ticket.get("id") if isinstance(ticket, dict) else None
            return PushSendResult(status="SENT", provider_message_id=str(provider_id or "expo-provider"))
        except Exception as exc:  # pragma: no cover - defensive provider path
            return PushSendResult(status="FAILED", error_message=str(exc))


def _event_preference_field(event_type: str) -> str | None:
    if event_type.startswith("CHAT_") or event_type.startswith("CHAT."):
        return "chat_enabled"
    if event_type.startswith("SUPPORT_"):
        return "support_enabled"
    if event_type.startswith("LOST_FOUND_"):
        return "support_enabled"
    if event_type.startswith("SUBSCRIPTION_") or event_type.startswith("PAYMENT_") or event_type.startswith("RECEIPT_"):
        return "billing_enabled"
    if event_type.startswith("ANNOUNCEMENT_"):
        return "announcements_enabled"
    return None


def _default_title(event_type: str) -> str:
    return event_type.replace("_", " ").replace(".", " ").title()


def _default_body(template_key: str, params: dict[str, Any]) -> str:
    if "message" in params and params["message"]:
        return str(params["message"])
    if "plan_name" in params and params["plan_name"]:
        return f"{template_key.replace('_', ' ').title()}: {params['plan_name']}"
    return template_key.replace("_", " ").title()


class PushNotificationService:
    @staticmethod
    async def _is_user_branch_eligible(
        *,
        db: AsyncSession,
        user: User,
        scope_branch_id: str | None,
    ) -> bool:
        if not scope_branch_id:
            return True
        if user.home_branch_id and str(user.home_branch_id) == str(scope_branch_id):
            return True
        assignment = (
            await db.execute(
                select(UserBranchAccess.id).where(
                    UserBranchAccess.user_id == user.id,
                    UserBranchAccess.branch_id == scope_branch_id,
                )
            )
        ).scalar_one_or_none()
        return assignment is not None

    @staticmethod
    async def queue_and_send(
        *,
        db: AsyncSession,
        user: User | None,
        title: str | None,
        body: str | None,
        template_key: str,
        event_type: str,
        event_ref: str | None,
        params: dict[str, Any],
        idempotency_key: str,
        scope: str = "GLOBAL",
        scope_branch_id: str | None = None,
    ) -> list[PushDeliveryLog]:
        resolved_title = title or _default_title(event_type)
        resolved_body = body or _default_body(template_key, params)
        data = {"event_type": event_type, "event_ref": event_ref, **params}
        data_json = json.dumps(data, ensure_ascii=True)
        logs: list[PushDeliveryLog] = []

        if not user:
            log = await PushNotificationService._create_once(
                db=db,
                user=None,
                device=None,
                title=resolved_title,
                body=resolved_body,
                data_json=data_json,
                event_type=event_type,
                event_ref=event_ref,
                idempotency_key=f"{idempotency_key}:no-user",
            )
            log.status = "SKIPPED"
            log.error_message = "No user"
            log.failed_at = datetime.now(timezone.utc)
            await db.commit()
            return [log]

        if scope == "BRANCH":
            is_eligible = await PushNotificationService._is_user_branch_eligible(
                db=db,
                user=user,
                scope_branch_id=scope_branch_id,
            )
            if not is_eligible:
                return [
                    await PushNotificationService._skip(
                        db,
                        user,
                        resolved_title,
                        resolved_body,
                        data_json,
                        event_type,
                        event_ref,
                        f"{idempotency_key}:branch-mismatch",
                        "Recipient is not eligible for branch-scoped notification",
                    )
                ]

        pref = await db.get(MobileNotificationPreference, user.id)
        if pref and not pref.push_enabled:
            return [await PushNotificationService._skip(db, user, resolved_title, resolved_body, data_json, event_type, event_ref, f"{idempotency_key}:push-disabled", "Push preference disabled")]

        pref_field = _event_preference_field(event_type)
        if pref and pref_field and not bool(getattr(pref, pref_field)):
            return [await PushNotificationService._skip(db, user, resolved_title, resolved_body, data_json, event_type, event_ref, f"{idempotency_key}:{pref_field}-disabled", f"{pref_field} disabled")]

        devices = (
            await db.execute(
                select(MobileDevice)
                .where(MobileDevice.user_id == user.id, MobileDevice.is_active.is_(True))
                .order_by(MobileDevice.last_seen_at.desc())
            )
        ).scalars().all()
        if not devices:
            return [await PushNotificationService._skip(db, user, resolved_title, resolved_body, data_json, event_type, event_ref, f"{idempotency_key}:no-device", "No active device")]

        provider = ExpoPushProvider()
        for device in devices:
            log = await PushNotificationService._create_once(
                db=db,
                user=user,
                device=device,
                title=resolved_title,
                body=resolved_body,
                data_json=data_json,
                event_type=event_type,
                event_ref=event_ref,
                idempotency_key=f"{idempotency_key}:{device.id}",
            )
            if log.status != "QUEUED":
                logs.append(log)
                continue
            result = await provider.send(token=device.device_token, title=resolved_title, body=resolved_body, data=data)
            now = datetime.now(timezone.utc)
            if result.status == "SENT":
                log.status = "SENT"
                log.provider_message_id = result.provider_message_id
                log.sent_at = now
            elif result.status == "SKIPPED":
                log.status = "SKIPPED"
                log.error_message = result.error_message
                log.failed_at = now
            else:
                log.status = "FAILED"
                log.error_message = result.error_message
                log.failed_at = now
            logs.append(log)
        await db.commit()
        return logs

    @staticmethod
    async def _skip(
        db: AsyncSession,
        user: User,
        title: str,
        body: str,
        data_json: str,
        event_type: str,
        event_ref: str | None,
        idempotency_key: str,
        reason: str,
    ) -> PushDeliveryLog:
        log = await PushNotificationService._create_once(
            db=db,
            user=user,
            device=None,
            title=title,
            body=body,
            data_json=data_json,
            event_type=event_type,
            event_ref=event_ref,
            idempotency_key=idempotency_key,
        )
        log.status = "SKIPPED"
        log.error_message = reason
        log.failed_at = datetime.now(timezone.utc)
        await db.commit()
        return log

    @staticmethod
    async def _create_once(
        *,
        db: AsyncSession,
        user: User | None,
        device: MobileDevice | None,
        title: str,
        body: str,
        data_json: str,
        event_type: str,
        event_ref: str | None,
        idempotency_key: str,
    ) -> PushDeliveryLog:
        existing = (
            await db.execute(select(PushDeliveryLog).where(PushDeliveryLog.idempotency_key == idempotency_key))
        ).scalar_one_or_none()
        if existing:
            return existing
        log = PushDeliveryLog(
            user_id=user.id if user else None,
            device_id=device.id if device else None,
            device_token=device.device_token if device else None,
            title=title,
            body=body,
            data_json=data_json,
            event_type=event_type,
            event_ref=event_ref,
            idempotency_key=idempotency_key,
            status="QUEUED",
        )
        db.add(log)
        await db.flush()
        return log
