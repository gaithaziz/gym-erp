import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings
from app.models.user import User
from app.models.access import Subscription, SubscriptionStatus, AttendanceLog
from app.models.hr import Payroll
from app.auth.security import get_password_hash
from datetime import datetime, timedelta, timezone

@pytest.mark.asyncio
async def test_analytics_dashboard(client: AsyncClient, db_session: AsyncSession):
    # 1. Setup Admin
    password = "password123"
    hashed = get_password_hash(password)
    admin = User(email="admin_analytics@gym.com", hashed_password=hashed, role="ADMIN", full_name="Admin")
    db_session.add(admin)
    await db_session.flush()
    
    token = await client.post(f"{settings.API_V1_STR}/auth/login", json={"email": "admin_analytics@gym.com", "password": password})
    headers = {"Authorization": f"Bearer {token.json()['data']['access_token']}"}
    
    # 2. Setup Data
    # Active User
    u1 = User(email="u1@gym.com", hashed_password=hashed, role="CUSTOMER", full_name="U1")
    db_session.add(u1)
    await db_session.flush()
    
    s1 = Subscription(
        user_id=u1.id,
        plan_name="Standard",
        start_date=datetime.now(timezone.utc),
        end_date=datetime.now(timezone.utc) + timedelta(days=30),
        status=SubscriptionStatus.ACTIVE
    )
    db_session.add(s1)
    
    # Payroll Expense
    p1 = Payroll(user_id=admin.id, month=1, year=2026, total_pay=1000.0)
    db_session.add(p1)
    
    await db_session.commit()
    
    # 3. Test Dashboard
    resp = await client.get(f"{settings.API_V1_STR}/analytics/dashboard", headers=headers)
    assert resp.status_code == 200
    data = resp.json()["data"]
    
    # Active members = 1
    assert data["active_members"] == 1
    # Rev = 1 * 50 = 50.0
    assert data["estimated_monthly_revenue"] == 50.0
    # Exp = 1000.0
    assert data["total_expenses_to_date"] == 1000.0

@pytest.mark.asyncio
async def test_attendance_trends(client: AsyncClient, db_session: AsyncSession):
    # Setup Admin header...
    password = "password123"
    hashed = get_password_hash(password)
    admin = User(email="admin_trends@gym.com", hashed_password=hashed, role="ADMIN", full_name="Admin")
    db_session.add(admin)
    await db_session.flush()
    token = await client.post(f"{settings.API_V1_STR}/auth/login", json={"email": "admin_trends@gym.com", "password": password})
    headers = {"Authorization": f"Bearer {token.json()['data']['access_token']}"}
    
    # Add Logs
    now = datetime.now(timezone.utc)
    # Today
    l1 = AttendanceLog(user_id=admin.id, check_in_time=now, check_out_time=now+timedelta(hours=1), hours_worked=1.0)
    l2 = AttendanceLog(user_id=admin.id, check_in_time=now, check_out_time=now+timedelta(hours=1), hours_worked=1.0)
    # Yesterday
    l3 = AttendanceLog(user_id=admin.id, check_in_time=now - timedelta(days=1), check_out_time=now-timedelta(days=1)+timedelta(hours=1), hours_worked=1.0)
    
    db_session.add_all([l1, l2, l3])
    await db_session.commit()
    
    resp = await client.get(f"{settings.API_V1_STR}/analytics/attendance?days=7", headers=headers)
    assert resp.status_code == 200
    trends = resp.json()["data"]
    
    # Should have 2 entries
    assert len(trends) >= 2
    
    # Verify counts
    today_str = now.strftime("%Y-%m-%d")
    yesterday_str = (now - timedelta(days=1)).strftime("%Y-%m-%d")
    
    today_stat = next((t for t in trends if t["date"] == today_str), None)
    yesterday_stat = next((t for t in trends if t["date"] == yesterday_str), None)
    
    assert today_stat["count"] == 2
    assert yesterday_stat["count"] == 1
