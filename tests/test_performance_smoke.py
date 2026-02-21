import time
import pytest
from datetime import datetime, timedelta, timezone
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.user import User
from app.models.enums import Role
from app.auth.security import get_password_hash
from app.models.access import AttendanceLog, AccessLog
from app.models.finance import Transaction, TransactionType, TransactionCategory, PaymentMethod


@pytest.mark.asyncio
async def test_list_endpoints_performance_smoke(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    admin = User(email="admin_perf@gym.com", hashed_password=hashed, role=Role.ADMIN, full_name="Perf Admin")
    db_session.add(admin)
    await db_session.flush()

    now = datetime.now(timezone.utc)
    attendance_rows = [
        AttendanceLog(
            user_id=admin.id,
            check_in_time=now - timedelta(minutes=i + 120),
            check_out_time=now - timedelta(minutes=i),
            hours_worked=2.0,
        )
        for i in range(800)
    ]
    access_rows = [
        AccessLog(
            user_id=admin.id,
            kiosk_id="perf-kiosk",
            scan_time=now - timedelta(minutes=i),
            status="GRANTED",
            reason=None,
        )
        for i in range(300)
    ]
    transaction_rows = [
        Transaction(
            amount=10.0 + (i % 5),
            type=TransactionType.INCOME if i % 2 == 0 else TransactionType.EXPENSE,
            category=TransactionCategory.SUBSCRIPTION if i % 2 == 0 else TransactionCategory.UTILITIES,
            description=f"Perf tx {i}",
            payment_method=PaymentMethod.CASH,
            user_id=admin.id,
            date=now - timedelta(minutes=i),
        )
        for i in range(1200)
    ]
    db_session.add_all(attendance_rows + access_rows + transaction_rows)
    await db_session.commit()

    login = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": "admin_perf@gym.com", "password": password}
    )
    headers = {"Authorization": f"Bearer {login.json()['data']['access_token']}"}

    start = time.perf_counter()
    attendance_resp = await client.get(f"{settings.API_V1_STR}/hr/attendance?limit=100", headers=headers)
    attendance_duration = time.perf_counter() - start
    assert attendance_resp.status_code == 200
    assert attendance_duration < 2.5

    start = time.perf_counter()
    recent_activity_resp = await client.get(f"{settings.API_V1_STR}/analytics/recent-activity", headers=headers)
    recent_activity_duration = time.perf_counter() - start
    assert recent_activity_resp.status_code == 200
    assert recent_activity_duration < 2.5

    start = time.perf_counter()
    tx_list_resp = await client.get(f"{settings.API_V1_STR}/finance/transactions?limit=100", headers=headers)
    tx_list_duration = time.perf_counter() - start
    assert tx_list_resp.status_code == 200
    assert tx_list_duration < 2.5
