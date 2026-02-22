import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.notification import WhatsAppDeliveryLog
from app.models.user import User


@dataclass
class SendResult:
    status: str
    provider_message_id: str | None = None
    error_message: str | None = None


class WhatsAppProvider:
    async def send_template_message(self, to: str, template_key: str, params: dict[str, Any]) -> SendResult:
        raise NotImplementedError


class MockWhatsAppProvider(WhatsAppProvider):
    async def send_template_message(self, to: str, template_key: str, params: dict[str, Any]) -> SendResult:
        if not settings.WHATSAPP_ENABLED:
            return SendResult(status="SKIPPED", error_message="WhatsApp disabled")
        if settings.WHATSAPP_DRY_RUN:
            return SendResult(status="SENT", provider_message_id="dry-run")
        return SendResult(status="SENT", provider_message_id="mock-provider")


class HttpWhatsAppProvider(WhatsAppProvider):
    async def send_template_message(self, to: str, template_key: str, params: dict[str, Any]) -> SendResult:
        if not settings.WHATSAPP_API_URL or not settings.WHATSAPP_API_TOKEN:
            return SendResult(status="FAILED", error_message="Missing WhatsApp API configuration")

        payload = {"to": to, "template_key": template_key, "params": params}
        headers = {"Authorization": f"Bearer {settings.WHATSAPP_API_TOKEN}"}
        try:
            async with httpx.AsyncClient(timeout=settings.WHATSAPP_TIMEOUT_SECONDS) as client:
                response = await client.post(settings.WHATSAPP_API_URL, json=payload, headers=headers)
            if response.status_code >= 400:
                return SendResult(status="FAILED", error_message=f"HTTP {response.status_code}")

            response_data = response.json() if response.content else {}
            provider_message_id = str(response_data.get("message_id", "http-provider"))
            return SendResult(status="SENT", provider_message_id=provider_message_id)
        except Exception as exc:  # pragma: no cover - defensive path
            return SendResult(status="FAILED", error_message=str(exc))


def _get_provider() -> WhatsAppProvider:
    if settings.WHATSAPP_PROVIDER.lower() == "http":
        return HttpWhatsAppProvider()
    return MockWhatsAppProvider()


class WhatsAppNotificationService:
    @staticmethod
    async def queue_and_send(
        *,
        db: AsyncSession,
        user: User | None,
        phone_number: str | None,
        template_key: str,
        event_type: str,
        event_ref: str | None,
        params: dict[str, Any],
        idempotency_key: str,
    ) -> WhatsAppDeliveryLog:
        existing = await db.execute(
            select(WhatsAppDeliveryLog).where(WhatsAppDeliveryLog.idempotency_key == idempotency_key)
        )
        existing_log = existing.scalar_one_or_none()
        if existing_log:
            return existing_log

        log = WhatsAppDeliveryLog(
            user_id=user.id if user else None,
            phone_number=phone_number,
            template_key=template_key,
            payload_json=json.dumps(params, ensure_ascii=True),
            event_type=event_type,
            event_ref=event_ref,
            idempotency_key=idempotency_key,
            status="QUEUED",
        )
        db.add(log)
        await db.flush()

        if not phone_number:
            log.status = "SKIPPED"
            log.error_message = "No phone number"
            log.failed_at = datetime.now(timezone.utc)
            await db.commit()
            return log

        provider = _get_provider()
        result = await provider.send_template_message(phone_number, template_key, params)
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

        await db.commit()
        return log
