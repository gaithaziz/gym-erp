from __future__ import annotations

import asyncio
import logging
import smtplib
from dataclasses import dataclass
from email.message import EmailMessage
from typing import Protocol
from urllib.parse import quote

from app.config import settings

logger = logging.getLogger(__name__)


@dataclass
class EmailSendResult:
    status: str
    error_message: str | None = None


class EmailProvider(Protocol):
    async def send(
        self,
        *,
        to_email: str,
        subject: str,
        text_body: str,
        html_body: str | None = None,
    ) -> EmailSendResult: ...


class ConsoleEmailProvider:
    async def send(
        self,
        *,
        to_email: str,
        subject: str,
        text_body: str,
        html_body: str | None = None,
    ) -> EmailSendResult:
        del html_body
        logger.info("Password reset email to %s | %s | %s", to_email, subject, text_body)
        return EmailSendResult(status="SENT")


class SMTPEmailProvider:
    async def send(
        self,
        *,
        to_email: str,
        subject: str,
        text_body: str,
        html_body: str | None = None,
    ) -> EmailSendResult:
        if not settings.EMAIL_SMTP_HOST:
            return EmailSendResult(status="SKIPPED", error_message="SMTP host is not configured")

        def _deliver() -> None:
            message = EmailMessage()
            message["From"] = f"{settings.EMAIL_FROM_NAME} <{settings.EMAIL_FROM_ADDRESS}>"
            message["To"] = to_email
            message["Subject"] = subject
            message.set_content(text_body)
            if html_body:
                message.add_alternative(html_body, subtype="html")

            with smtplib.SMTP(settings.EMAIL_SMTP_HOST, settings.EMAIL_SMTP_PORT, timeout=settings.EMAIL_TIMEOUT_SECONDS) as client:
                if settings.EMAIL_SMTP_USE_TLS:
                    client.starttls()
                if settings.EMAIL_SMTP_USERNAME:
                    client.login(settings.EMAIL_SMTP_USERNAME, settings.EMAIL_SMTP_PASSWORD or "")
                client.send_message(message)

        try:
            await asyncio.to_thread(_deliver)
            return EmailSendResult(status="SENT")
        except Exception as exc:  # pragma: no cover - provider-specific failure path
            return EmailSendResult(status="FAILED", error_message=str(exc))


def _build_html_reset_email(*, reset_url: str, mobile_reset_url: str | None = None) -> str:
    mobile_block = (
        f'<p style="margin-top: 0.75rem;"><a href="{mobile_reset_url}">Open in the mobile app</a></p>'
        if mobile_reset_url
        else ""
    )
    return f"""
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111;">
      <h2>Password reset request</h2>
      <p>We received a request to reset your password.</p>
      <p><a href="{reset_url}">Reset your password</a></p>
      {mobile_block}
      <p>If you did not request this, you can ignore this email.</p>
    </div>
    """


class EmailService:
    @staticmethod
    def _provider() -> EmailProvider:
        provider = settings.EMAIL_PROVIDER.strip().lower()
        if provider == "smtp":
            return SMTPEmailProvider()
        return ConsoleEmailProvider()

    @staticmethod
    def build_password_reset_url(token: str) -> str:
        return f"{settings.FRONTEND_BASE_URL.rstrip('/')}/reset-password?token={quote(token)}"

    @staticmethod
    def build_mobile_password_reset_url(token: str) -> str:
        scheme = settings.MOBILE_DEEPLINK_SCHEME.strip().rstrip(":/") if settings.MOBILE_DEEPLINK_SCHEME else "gymerp"
        return f"{scheme or 'gymerp'}://reset-password?token={quote(token)}"

    @staticmethod
    async def send_password_reset_link(
        *,
        to_email: str,
        reset_url: str,
        mobile_reset_url: str | None = None,
        full_name: str | None = None,
    ) -> EmailSendResult:
        subject = f"{settings.EMAIL_FROM_NAME} password reset"
        greeting = f"Hi {full_name}," if full_name else "Hello,"
        mobile_line = f"Open in the mobile app: {mobile_reset_url}" if mobile_reset_url else None
        text_body = "\n".join(
            line
            for line in [
                greeting,
                "",
                "We received a request to reset your password.",
                f"Use this link to continue: {reset_url}",
                mobile_line,
                "",
                "If you did not request this, you can ignore this email.",
            ]
            if line is not None
        )
        provider = EmailService._provider()
        return await provider.send(
            to_email=to_email,
            subject=subject,
            text_body=text_body,
            html_body=_build_html_reset_email(reset_url=reset_url, mobile_reset_url=mobile_reset_url),
        )
