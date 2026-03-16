from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.security import get_password_hash
from app.config import settings
from app.models.access import Subscription, SubscriptionStatus
from app.models.enums import Role
from app.models.finance import PaymentMethod, Transaction, TransactionCategory, TransactionType
from app.models.user import User


async def _create_user(
    db_session: AsyncSession,
    *,
    email: str,
    password: str,
    role: Role,
    full_name: str,
) -> User:
    user = User(
        email=email,
        hashed_password=get_password_hash(password),
        role=role,
        full_name=full_name,
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()
    return user


async def _login(client: AsyncClient, *, email: str, password: str) -> dict:
    response = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200
    return response.json()


async def _auth_headers(client: AsyncClient, *, email: str, password: str) -> dict[str, str]:
    login_payload = await _login(client, email=email, password=password)
    return {"Authorization": f"Bearer {login_payload['data']['access_token']}"}


async def _add_active_subscription(db_session: AsyncSession, *, user_id) -> None:
    now = datetime.now(timezone.utc)
    db_session.add(
        Subscription(
            user_id=user_id,
            plan_name="Gold",
            start_date=now - timedelta(days=1),
            end_date=now + timedelta(days=30),
            status=SubscriptionStatus.ACTIVE,
        )
    )
    await db_session.flush()


@pytest.mark.asyncio
async def test_mobile_contract_login_envelope_and_refresh_lifecycle(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    user = await _create_user(
        db_session,
        email="mobile_contract_auth@gym.com",
        password=password,
        role=Role.CUSTOMER,
        full_name="Mobile Contract Auth",
    )
    await _add_active_subscription(db_session, user_id=user.id)
    await db_session.commit()

    login_payload = await _login(client, email=user.email, password=password)
    assert login_payload["success"] is True
    assert login_payload["message"] == "Login Successful"
    assert set(login_payload["data"]) == {"access_token", "refresh_token", "token_type"}
    assert login_payload["data"]["token_type"] == "bearer"
    assert login_payload["data"]["access_token"]
    assert login_payload["data"]["refresh_token"]

    first_refresh_token = login_payload["data"]["refresh_token"]
    refresh_response = await client.post(
        f"{settings.API_V1_STR}/auth/refresh",
        headers={"Authorization": f"Bearer {first_refresh_token}"},
    )
    assert refresh_response.status_code == 200

    refresh_payload = refresh_response.json()
    assert refresh_payload["success"] is True
    assert refresh_payload["message"] == "Token Refreshed"
    assert refresh_payload["data"]["token_type"] == "bearer"
    assert refresh_payload["data"]["access_token"]
    assert refresh_payload["data"]["refresh_token"]
    assert refresh_payload["data"]["refresh_token"] != first_refresh_token

    revoked_refresh = await client.post(
        f"{settings.API_V1_STR}/auth/refresh",
        headers={"Authorization": f"Bearer {first_refresh_token}"},
    )
    assert revoked_refresh.status_code == 401


@pytest.mark.asyncio
async def test_mobile_contract_auth_me_shape(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    user = await _create_user(
        db_session,
        email="mobile_contract_me@gym.com",
        password=password,
        role=Role.CUSTOMER,
        full_name="Mobile Contract Me",
    )
    user.phone_number = "+966500000000"
    user.bio = "Testing mobile auth shape"
    await _add_active_subscription(db_session, user_id=user.id)
    await db_session.commit()

    response = await client.get(
        f"{settings.API_V1_STR}/auth/me",
        headers=await _auth_headers(client, email=user.email, password=password),
    )
    assert response.status_code == 200

    payload = response.json()
    assert payload["success"] is True
    assert payload["data"]["id"] == str(user.id)
    assert payload["data"]["email"] == user.email
    assert payload["data"]["full_name"] == user.full_name
    assert payload["data"]["role"] == "CUSTOMER"
    assert payload["data"]["profile_picture_url"] is None
    assert payload["data"]["phone_number"] == user.phone_number
    assert payload["data"]["subscription_status"] == "ACTIVE"
    assert payload["data"]["subscription_plan_name"] == "Gold"
    assert payload["data"]["is_subscription_blocked"] is False
    assert "block_reason" in payload["data"]


@pytest.mark.asyncio
async def test_mobile_contract_pagination_and_count_headers(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    admin = await _create_user(
        db_session,
        email="mobile_contract_finance@gym.com",
        password=password,
        role=Role.ADMIN,
        full_name="Mobile Contract Finance",
    )
    now = datetime.now(timezone.utc)
    db_session.add_all(
        [
            Transaction(
                user_id=admin.id,
                amount=150,
                type=TransactionType.INCOME,
                category=TransactionCategory.SUBSCRIPTION,
                description="Contract income",
                payment_method=PaymentMethod.CASH,
                date=now,
            ),
            Transaction(
                user_id=admin.id,
                amount=40,
                type=TransactionType.EXPENSE,
                category=TransactionCategory.RENT,
                description="Contract expense",
                payment_method=PaymentMethod.TRANSFER,
                date=now - timedelta(hours=1),
            ),
        ]
    )
    await db_session.commit()

    response = await client.get(
        f"{settings.API_V1_STR}/finance/transactions",
        params={"limit": 1, "offset": 0},
        headers=await _auth_headers(client, email=admin.email, password=password),
    )
    assert response.status_code == 200
    assert response.headers["X-Total-Count"] == "2"

    payload = response.json()
    assert payload["success"] is True
    assert isinstance(payload["data"], list)
    assert len(payload["data"]) == 1
    row = payload["data"][0]
    assert {"id", "amount", "type", "category", "payment_method", "date"}.issubset(row)


@pytest.mark.asyncio
async def test_mobile_contract_upload_and_download_response_shapes(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    user = await _create_user(
        db_session,
        email="mobile_contract_files@gym.com",
        password=password,
        role=Role.ADMIN,
        full_name="Mobile Contract Files",
    )
    transaction = Transaction(
        user_id=user.id,
        amount=99,
        type=TransactionType.INCOME,
        category=TransactionCategory.SUBSCRIPTION,
        description="Contract export row",
        payment_method=PaymentMethod.CARD,
        date=datetime.now(timezone.utc),
    )
    db_session.add(transaction)
    await db_session.commit()

    headers = await _auth_headers(client, email=user.email, password=password)

    upload_response = await client.post(
        f"{settings.API_V1_STR}/auth/me/profile-picture",
        headers=headers,
        files={"file": ("avatar.png", b"\x89PNG\r\n\x1a\ncontract-test", "image/png")},
    )
    assert upload_response.status_code == 200

    upload_payload = upload_response.json()
    assert upload_payload["success"] is True
    assert upload_payload["message"] == "Profile picture updated successfully"
    assert upload_payload["data"]["profile_picture_url"].startswith("/static/profiles/")

    saved_relative_path = upload_payload["data"]["profile_picture_url"].lstrip("/")
    if os.path.exists(saved_relative_path):
        os.remove(saved_relative_path)

    download_response = await client.get(
        f"{settings.API_V1_STR}/finance/transactions/report.csv",
        headers=headers,
    )
    assert download_response.status_code == 200
    assert download_response.headers["content-type"].startswith("text/csv")
    assert download_response.headers["content-disposition"] == "attachment; filename=financial_report.csv"
    assert "date,description,category,type,payment_method,amount" in download_response.text


@pytest.mark.asyncio
async def test_mobile_contract_qr_response_shapes(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    customer = await _create_user(
        db_session,
        email="mobile_contract_qr_customer@gym.com",
        password=password,
        role=Role.CUSTOMER,
        full_name="Mobile Contract QR Customer",
    )
    operator = await _create_user(
        db_session,
        email="mobile_contract_qr_operator@gym.com",
        password=password,
        role=Role.EMPLOYEE,
        full_name="Mobile Contract QR Operator",
    )
    await _add_active_subscription(db_session, user_id=customer.id)
    await db_session.commit()

    customer_headers = await _auth_headers(client, email=customer.email, password=password)
    operator_login = await _login(client, email=operator.email, password=password)
    operator_headers = {"Authorization": f"Bearer {operator_login['data']['access_token']}"}

    qr_response = await client.get(f"{settings.API_V1_STR}/access/qr", headers=customer_headers)
    assert qr_response.status_code == 200
    qr_payload = qr_response.json()
    assert qr_payload["success"] is True
    assert qr_payload["data"]["qr_token"]
    assert isinstance(qr_payload["data"]["expires_in_seconds"], int)
    assert qr_payload["data"]["expires_in_seconds"] > 0

    kiosk_auth_response = await client.post(
        f"{settings.API_V1_STR}/access/kiosk/auth",
        json={"kiosk_id": "mobile-contract-kiosk"},
        headers=operator_headers,
    )
    assert kiosk_auth_response.status_code == 200
    kiosk_token = kiosk_auth_response.json()["data"]["kiosk_token"]

    scan_response = await client.post(
        f"{settings.API_V1_STR}/access/scan",
        json={
            "qr_token": qr_payload["data"]["qr_token"],
            "kiosk_id": "mobile-contract-kiosk",
        },
        headers={"X-Kiosk-Token": kiosk_token},
    )
    assert scan_response.status_code == 200

    scan_payload = scan_response.json()
    assert scan_payload["success"] is True
    assert scan_payload["data"]["status"] in {"GRANTED", "ALREADY_SCANNED"}
    assert scan_payload["data"]["user_name"] == customer.full_name
    assert "reason" in scan_payload["data"]
