import pytest
import asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings
from app.models.user import User
from app.models.access import Subscription, SubscriptionStatus
from app.auth.security import get_password_hash
from app.services.access_service import AccessService
from datetime import datetime, timedelta, timezone

# Shared Fixture for populating test data?
# or just setup within test function since database is shared for session/test

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
    
    # 3. Scan QR (Active)
    scan_resp = await client.post(f"{settings.API_V1_STR}/access/scan", json={"qr_token": qr_token, "kiosk_id": "kiosk_1"})
    assert scan_resp.status_code == 200
    scan_data = scan_resp.json()["data"]
    assert scan_data["status"] == "GRANTED"
    
    # 4. Generate QR for Expired User
    login_resp_exp = await client.post(f"{settings.API_V1_STR}/auth/login", json={"email": "test_expired@gym.com", "password": password})
    token_exp = login_resp_exp.json()["data"]["access_token"]
    
    qr_resp_exp = await client.get(f"{settings.API_V1_STR}/access/qr", headers={"Authorization": f"Bearer {token_exp}"})
    qr_token_exp = qr_resp_exp.json()["data"]["qr_token"]
    
    # 5. Scan QR (Expired)
    scan_resp_exp = await client.post(f"{settings.API_V1_STR}/access/scan", json={"qr_token": qr_token_exp, "kiosk_id": "kiosk_1"})
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
