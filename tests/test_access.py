import pytest
import asyncio
import uuid
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings
from app.models.user import User
from app.models.access import Subscription, SubscriptionStatus
from app.auth.security import get_password_hash
from app.services.access_service import AccessRateLimiter
from datetime import datetime, timedelta, timezone

# Shared Fixture for populating test data?
# or just setup within test function since database is shared for session/test


async def _issue_kiosk_headers_for_token(client: AsyncClient, token: str, kiosk_id: str) -> dict[str, str]:
    auth_resp = await client.post(
        f"{settings.API_V1_STR}/access/kiosk/auth",
        json={"kiosk_id": kiosk_id},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert auth_resp.status_code == 200
    kiosk_token = auth_resp.json()["data"]["kiosk_token"]
    return {
        "X-Kiosk-Id": kiosk_id,
        "X-Kiosk-Token": kiosk_token,
    }


async def _issue_kiosk_headers(client: AsyncClient, db_session: AsyncSession, kiosk_id: str) -> dict[str, str]:
    password = "password123"
    hashed = get_password_hash(password)
    operator_email = f"kiosk_{kiosk_id}_{uuid.uuid4().hex[:8]}@gym.com".replace("-", "_")
    operator = User(
        email=operator_email,
        hashed_password=hashed,
        role="EMPLOYEE",
        full_name="Kiosk Operator",
    )
    db_session.add(operator)
    await db_session.commit()

    login_resp = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": operator_email, "password": password},
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["data"]["access_token"]
    return await _issue_kiosk_headers_for_token(client, token, kiosk_id)

@pytest.mark.asyncio
async def test_access_flow(client: AsyncClient, db_session: AsyncSession):
    # 1. Setup Data
    # Active User
    password = "password123"
    hashed = get_password_hash(password)
    user_active = User(email="test_active@gym.com", hashed_password=hashed, role="CUSTOMER", full_name="Active User")
    db_session.add(user_active)
    await db_session.flush() # get ID
    
    now = datetime.now(timezone.utc)
    sub_active = Subscription(
        user_id=user_active.id,
        plan_name="Gold",
        start_date=now - timedelta(days=1),
        end_date=now + timedelta(days=30),
        status=SubscriptionStatus.ACTIVE
    )
    db_session.add(sub_active)

    # Expired User
    user_expired = User(email="test_expired@gym.com", hashed_password=hashed, role="CUSTOMER", full_name="Expired User")
    db_session.add(user_expired)
    await db_session.flush()
    
    sub_expired = Subscription(
        user_id=user_expired.id,
        plan_name="Bronze",
        start_date=now - timedelta(days=60),
        end_date=now - timedelta(days=1),
        status=SubscriptionStatus.EXPIRED # Date implies expired too
    )
    db_session.add(sub_expired)
    
    await db_session.commit()
    
    # 2. Generate QR for Active User
    # Login first
    login_resp = await client.post(f"{settings.API_V1_STR}/auth/login", json={"email": "test_active@gym.com", "password": password})
    assert login_resp.status_code == 200
    token = login_resp.json()["data"]["access_token"]
    
    qr_resp = await client.get(f"{settings.API_V1_STR}/access/qr", headers={"Authorization": f"Bearer {token}"})
    assert qr_resp.status_code == 200
    qr_token = qr_resp.json()["data"]["qr_token"]
    kiosk_headers = await _issue_kiosk_headers(client, db_session, "kiosk_1")
    
    # 3. Scan QR (Active)
    scan_resp = await client.post(
        f"{settings.API_V1_STR}/access/scan",
        json={"qr_token": qr_token, "kiosk_id": "kiosk_1"},
        headers=kiosk_headers,
    )
    assert scan_resp.status_code == 200
    scan_data = scan_resp.json()["data"]
    assert scan_data["status"] == "GRANTED"
    
    # 4. Generate QR for Expired User
    login_resp_exp = await client.post(f"{settings.API_V1_STR}/auth/login", json={"email": "test_expired@gym.com", "password": password})
    token_exp = login_resp_exp.json()["data"]["access_token"]
    
    qr_resp_exp = await client.get(f"{settings.API_V1_STR}/access/qr", headers={"Authorization": f"Bearer {token_exp}"})
    qr_token_exp = qr_resp_exp.json()["data"]["qr_token"]
    
    # 5. Scan QR (Expired)
    scan_resp_exp = await client.post(
        f"{settings.API_V1_STR}/access/scan",
        json={"qr_token": qr_token_exp, "kiosk_id": "kiosk_1"},
        headers=kiosk_headers,
    )
    scan_data_exp = scan_resp_exp.json()["data"]
    assert scan_data_exp["status"] == "DENIED"
    # Reason could be SUBSCRIPTION_EXPIRED or NO_ACTIVE_SUBSCRIPTION. Logic says checks expired date.
    assert "EXPIRED" in scan_data_exp["reason"] or scan_data_exp["reason"] == "NO_ACTIVE_SUBSCRIPTION"
    
    # 6. Test Staff Check-in
    user_staff = User(email="staff@gym.com", hashed_password=hashed, role="EMPLOYEE", full_name="Staff John")
    db_session.add(user_staff)
    await db_session.commit()
    
    login_staff = await client.post(f"{settings.API_V1_STR}/auth/login", json={"email": "staff@gym.com", "password": password})
    token_staff = login_staff.json()["data"]["access_token"]
    
    checkin_resp = await client.post(f"{settings.API_V1_STR}/access/check-in", headers={"Authorization": f"Bearer {token_staff}"})
    assert checkin_resp.status_code == 200
    
    # Check-out
    await asyncio.sleep(0.1) # small delay
    checkout_resp = await client.post(f"{settings.API_V1_STR}/access/check-out", headers={"Authorization": f"Bearer {token_staff}"})
    assert checkout_resp.status_code == 200
    assert "Hours:" in checkout_resp.json()["message"]


@pytest.mark.asyncio
async def test_access_scan_rate_limited(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    user = User(email="ratelimit@gym.com", hashed_password=hashed, role="CUSTOMER", full_name="Rate Limited User")
    db_session.add(user)
    await db_session.flush()

    now = datetime.now(timezone.utc)
    db_session.add(Subscription(
        user_id=user.id,
        plan_name="Basic",
        start_date=now - timedelta(days=1),
        end_date=now + timedelta(days=30),
        status=SubscriptionStatus.ACTIVE
    ))
    await db_session.commit()

    login_resp = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": "ratelimit@gym.com", "password": password}
    )
    token = login_resp.json()["data"]["access_token"]
    qr_resp = await client.get(f"{settings.API_V1_STR}/access/qr", headers={"Authorization": f"Bearer {token}"})
    qr_token = qr_resp.json()["data"]["qr_token"]
    kiosk_headers = await _issue_kiosk_headers(client, db_session, "rate-limit-kiosk")

    original_max = AccessRateLimiter.MAX_REQUESTS
    original_window = AccessRateLimiter.WINDOW_SECONDS
    AccessRateLimiter.MAX_REQUESTS = 1
    AccessRateLimiter.WINDOW_SECONDS = 60
    AccessRateLimiter._requests.clear()

    try:
        first = await client.post(
            f"{settings.API_V1_STR}/access/scan",
            json={"qr_token": qr_token, "kiosk_id": "rate-limit-kiosk"},
            headers=kiosk_headers,
        )
        assert first.status_code == 200

        second = await client.post(
            f"{settings.API_V1_STR}/access/scan",
            json={"qr_token": qr_token, "kiosk_id": "rate-limit-kiosk"},
            headers=kiosk_headers,
        )
        assert second.status_code == 429
    finally:
        AccessRateLimiter.MAX_REQUESTS = original_max
        AccessRateLimiter.WINDOW_SECONDS = original_window
        AccessRateLimiter._requests.clear()


@pytest.mark.asyncio
async def test_prevent_duplicate_open_check_in(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    staff = User(email="duplicate_checkin@gym.com", hashed_password=hashed, role="EMPLOYEE", full_name="Duplicate Staff")
    db_session.add(staff)
    await db_session.commit()

    login_resp = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": "duplicate_checkin@gym.com", "password": password}
    )
    token = login_resp.json()["data"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    first_checkin = await client.post(f"{settings.API_V1_STR}/access/check-in", headers=headers)
    assert first_checkin.status_code == 200

    second_checkin = await client.post(f"{settings.API_V1_STR}/access/check-in", headers=headers)
    assert second_checkin.status_code == 400


@pytest.mark.asyncio
async def test_duplicate_scan_returns_already_scanned(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    user = User(email="duplicate_scan@gym.com", hashed_password=hashed, role="CUSTOMER", full_name="Duplicate Scanner")
    db_session.add(user)
    await db_session.flush()

    now = datetime.now(timezone.utc)
    db_session.add(Subscription(
        user_id=user.id,
        plan_name="Gold",
        start_date=now - timedelta(days=1),
        end_date=now + timedelta(days=30),
        status=SubscriptionStatus.ACTIVE,
    ))
    await db_session.commit()

    login_resp = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": "duplicate_scan@gym.com", "password": password}
    )
    token = login_resp.json()["data"]["access_token"]
    qr_resp = await client.get(f"{settings.API_V1_STR}/access/qr", headers={"Authorization": f"Bearer {token}"})
    qr_token = qr_resp.json()["data"]["qr_token"]
    kiosk_headers = await _issue_kiosk_headers(client, db_session, "dup-scan-kiosk")

    first_scan = await client.post(
        f"{settings.API_V1_STR}/access/scan",
        json={"qr_token": qr_token, "kiosk_id": "dup-scan-kiosk"},
        headers=kiosk_headers,
    )
    assert first_scan.status_code == 200
    assert first_scan.json()["data"]["status"] == "GRANTED"

    second_scan = await client.post(
        f"{settings.API_V1_STR}/access/scan",
        json={"qr_token": qr_token, "kiosk_id": "dup-scan-kiosk"},
        headers=kiosk_headers,
    )
    assert second_scan.status_code == 200
    assert second_scan.json()["data"]["status"] == "ALREADY_SCANNED"


@pytest.mark.asyncio
async def test_access_members_sync_contract_includes_metadata(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    admin = User(email="admin_members_sync@gym.com", hashed_password=hashed, role="ADMIN", full_name="Members Sync Admin")
    db_session.add(admin)
    await db_session.commit()

    login_resp = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": "admin_members_sync@gym.com", "password": password}
    )
    access_token = login_resp.json()["data"]["access_token"]
    headers = {"Authorization": f"Bearer {access_token}"}
    kiosk_headers = await _issue_kiosk_headers_for_token(client, access_token, "members-sync-kiosk")

    sync_resp = await client.get(
        f"{settings.API_V1_STR}/access/members",
        headers={**headers, **kiosk_headers},
    )
    assert sync_resp.status_code == 200
    data = sync_resp.json()["data"]

    assert "version" in data
    assert "generated_at" in data
    assert "cache_ttl_seconds" in data
    assert "checksum" in data
    assert "members" in data


@pytest.mark.asyncio
async def test_authenticated_session_scan_flow(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    now = datetime.now(timezone.utc)

    customer = User(
        email="session_scan_customer@gym.com",
        hashed_password=hashed,
        role="CUSTOMER",
        full_name="Session Scanner Customer",
    )
    db_session.add(customer)
    await db_session.flush()

    db_session.add(Subscription(
        user_id=customer.id,
        plan_name="Gold",
        start_date=now - timedelta(days=1),
        end_date=now + timedelta(days=30),
        status=SubscriptionStatus.ACTIVE,
    ))
    await db_session.commit()

    login_resp = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": "session_scan_customer@gym.com", "password": password},
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["data"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    first = await client.post(
        f"{settings.API_V1_STR}/access/scan-session",
        json={"kiosk_id": "front-door-01"},
        headers=headers,
    )
    assert first.status_code == 200
    assert first.json()["data"]["status"] == "GRANTED"

    second = await client.post(
        f"{settings.API_V1_STR}/access/scan-session",
        json={"kiosk_id": "front-door-01"},
        headers=headers,
    )
    assert second.status_code == 200
    assert second.json()["data"]["status"] == "ALREADY_SCANNED"
