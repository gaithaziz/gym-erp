from __future__ import annotations

from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import security
from app.config import settings
from app.models.auth import PasswordResetToken
from app.models.enums import Role
from app.models.user import User
from app.services.email_service import EmailSendResult, EmailService


def _reset_token_from_url(reset_url: str) -> str:
    query = parse_qs(urlparse(reset_url).query)
    return query["token"][0]


@pytest.mark.asyncio
async def test_password_reset_request_reports_found_and_missing_accounts(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
):
    captured: list[str] = []

    async def fake_send_password_reset_link(
        *,
        to_email: str,
        reset_url: str,
        mobile_reset_url: str | None = None,
        full_name: str | None = None,
    ):
        del to_email, full_name
        captured.append(reset_url)
        if mobile_reset_url:
            captured.append(mobile_reset_url)
        return EmailSendResult(status="SENT")

    monkeypatch.setattr(EmailService, "send_password_reset_link", fake_send_password_reset_link)

    user = User(email="reset-existing@example.com", hashed_password=security.get_password_hash("password123"), role=Role.CUSTOMER)
    db_session.add(user)
    await db_session.commit()

    existing_response = await client.post(
        f"{settings.API_V1_STR}/auth/password-reset/request",
        json={"email": user.email},
    )
    missing_response = await client.post(
        f"{settings.API_V1_STR}/auth/password-reset/request",
        json={"email": "missing@example.com"},
    )

    assert existing_response.status_code == 200
    assert missing_response.status_code == 200
    assert existing_response.json()["data"]["account_found"] is True
    assert missing_response.json()["data"]["account_found"] is False
    assert "found" in existing_response.json()["message"].lower()
    assert "no account" in missing_response.json()["message"].lower()
    assert captured, "expected a reset link to be generated for the existing user"


@pytest.mark.asyncio
async def test_password_reset_confirm_updates_password_and_revokes_sessions(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
):
    reset_links: list[str] = []

    async def fake_send_password_reset_link(
        *,
        to_email: str,
        reset_url: str,
        mobile_reset_url: str | None = None,
        full_name: str | None = None,
    ):
        del to_email, full_name, mobile_reset_url
        reset_links.append(reset_url)
        return EmailSendResult(status="SENT")

    monkeypatch.setattr(EmailService, "send_password_reset_link", fake_send_password_reset_link)

    email = "reset-flow@example.com"
    old_password = "password123"
    new_password = "new-password-456"
    user = User(email=email, hashed_password=security.get_password_hash(old_password), role=Role.MANAGER)
    db_session.add(user)
    await db_session.commit()

    login_response = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": email, "password": old_password},
    )
    assert login_response.status_code == 200
    access_token = login_response.json()["data"]["access_token"]
    refresh_token = login_response.json()["data"]["refresh_token"]

    request_response = await client.post(
        f"{settings.API_V1_STR}/auth/password-reset/request",
        json={"email": email},
    )
    assert request_response.status_code == 200
    assert reset_links
    reset_token = _reset_token_from_url(reset_links[-1])

    confirm_response = await client.post(
        f"{settings.API_V1_STR}/auth/password-reset/confirm",
        json={"token": reset_token, "new_password": new_password},
    )
    assert confirm_response.status_code == 200

    reuse_response = await client.post(
        f"{settings.API_V1_STR}/auth/password-reset/confirm",
        json={"token": reset_token, "new_password": "another-password"},
    )
    assert reuse_response.status_code == 400

    tampered_response = await client.post(
        f"{settings.API_V1_STR}/auth/password-reset/confirm",
        json={"token": f"{reset_token}x", "new_password": "another-password"},
    )
    assert tampered_response.status_code == 400

    expired_token = "expired-reset-token"
    db_session.add(
        PasswordResetToken(
            gym_id=user.gym_id,
            user_id=user.id,
            token_hash=security.hash_token(expired_token),
            expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),
        )
    )
    await db_session.commit()

    expired_response = await client.post(
        f"{settings.API_V1_STR}/auth/password-reset/confirm",
        json={"token": expired_token, "new_password": "another-password"},
    )
    assert expired_response.status_code == 400

    old_login_response = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": email, "password": old_password},
    )
    assert old_login_response.status_code == 401

    new_login_response = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": email, "password": new_password},
    )
    assert new_login_response.status_code == 200

    old_me_response = await client.get(
        f"{settings.API_V1_STR}/auth/me",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert old_me_response.status_code == 401

    old_refresh_response = await client.post(
        f"{settings.API_V1_STR}/auth/refresh",
        headers={"Authorization": f"Bearer {refresh_token}"},
    )
    assert old_refresh_response.status_code == 401


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "role",
    [
        Role.CUSTOMER,
        Role.COACH,
        Role.CASHIER,
        Role.RECEPTION,
        Role.MANAGER,
        Role.ADMIN,
    ],
)
async def test_password_reset_flow_allows_login_for_representative_roles(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    role: Role,
):
    reset_links: list[str] = []

    async def fake_send_password_reset_link(
        *,
        to_email: str,
        reset_url: str,
        mobile_reset_url: str | None = None,
        full_name: str | None = None,
    ):
        del to_email, full_name, mobile_reset_url
        reset_links.append(reset_url)
        return EmailSendResult(status="SENT")

    monkeypatch.setattr(EmailService, "send_password_reset_link", fake_send_password_reset_link)

    email = f"reset-{role.value.lower()}@example.com"
    old_password = "password123"
    new_password = "new-password-456"
    user = User(email=email, hashed_password=security.get_password_hash(old_password), role=role)
    db_session.add(user)
    await db_session.commit()

    request_response = await client.post(
        f"{settings.API_V1_STR}/auth/password-reset/request",
        json={"email": email},
    )
    assert request_response.status_code == 200
    assert reset_links

    reset_token = _reset_token_from_url(reset_links[-1])
    confirm_response = await client.post(
        f"{settings.API_V1_STR}/auth/password-reset/confirm",
        json={"token": reset_token, "new_password": new_password},
    )
    assert confirm_response.status_code == 200

    login_response = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": email, "password": new_password},
    )
    assert login_response.status_code == 200


@pytest.mark.asyncio
async def test_password_reset_email_includes_mobile_deep_link(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
):
    captured: dict[str, str | None] = {"reset_url": None, "mobile_reset_url": None}

    async def fake_send_password_reset_link(
        *,
        to_email: str,
        reset_url: str,
        mobile_reset_url: str | None = None,
        full_name: str | None = None,
    ):
        del to_email, full_name
        captured["reset_url"] = reset_url
        captured["mobile_reset_url"] = mobile_reset_url
        return EmailSendResult(status="SENT")

    monkeypatch.setattr(EmailService, "send_password_reset_link", fake_send_password_reset_link)

    email = "reset-mobile-link@example.com"
    user = User(email=email, hashed_password=security.get_password_hash("password123"), role=Role.CUSTOMER)
    db_session.add(user)
    await db_session.commit()

    response = await client.post(
        f"{settings.API_V1_STR}/auth/password-reset/request",
        json={"email": email},
    )
    assert response.status_code == 200
    assert captured["reset_url"] is not None
    assert captured["mobile_reset_url"] is not None
    assert captured["reset_url"].startswith(settings.FRONTEND_BASE_URL.rstrip("/"))
    assert captured["mobile_reset_url"].startswith(f"{settings.MOBILE_DEEPLINK_SCHEME}://")
