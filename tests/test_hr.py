import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings
from app.models.user import User
from app.auth.security import get_password_hash
from datetime import date, datetime, timedelta, timezone
from app.models.access import AttendanceLog

@pytest.mark.asyncio
async def test_hr_flow(client: AsyncClient, db_session: AsyncSession):
    # 1. Setup Admin User
    password = "password123"
    hashed = get_password_hash(password)
    admin = User(email="admin_hr@gym.com", hashed_password=hashed, role="ADMIN", full_name="HR Admin")
    db_session.add(admin)
    await db_session.flush()
    
    login_resp = await client.post(f"{settings.API_V1_STR}/auth/login", json={"email": "admin_hr@gym.com", "password": password})
    token = login_resp.json()["data"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    # 2. Create User for Contract
    user = User(email="employee@gym.com", hashed_password=hashed, role="EMPLOYEE", full_name="Employee John")
    db_session.add(user)
    await db_session.flush()
    
    # 3. Create Contract (POST /hr/contracts)
    contract_data = {
        "user_id": str(user.id),
        "start_date": str(date.today()),
        "base_salary": 3200.0,
        "contract_type": "FULL_TIME",
        "standard_hours": 160
    }
    resp = await client.post(f"{settings.API_V1_STR}/hr/contracts", json=contract_data, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["message"] == "Contract Created"
    
    # Verify in DB
    await db_session.commit() # ensure visible
    # (Actually test isolation might mean we need to check via API or session queries)
    
    # 4. Generate Payroll (Zero Hours)
    now = datetime.now(timezone.utc)
    payroll_req = {"user_id": str(user.id), "month": now.month, "year": now.year}
    resp_pay = await client.post(f"{settings.API_V1_STR}/hr/payroll/generate", json=payroll_req, headers=headers)
    assert resp_pay.status_code == 200
    data = resp_pay.json()["data"]
    assert data["base_pay"] == 3200.0
    assert data["overtime_pay"] == 0.0
    
    # 5. Add Attendance Logs (Overtime)
    # 170 Hours
    log = AttendanceLog(
        user_id=user.id,
        check_in_time=now - timedelta(days=5),
        check_out_time=now - timedelta(days=5) + timedelta(hours=170),
        hours_worked=170.0
    )
    db_session.add(log)
    await db_session.commit()
    
    # Regenerate Payroll
    resp_pay_2 = await client.post(f"{settings.API_V1_STR}/hr/payroll/generate", json=payroll_req, headers=headers)
    assert resp_pay_2.status_code == 200
    data_2 = resp_pay_2.json()["data"]
    
    # Exp: Base 3200. OT = 10 * (3200/160 * 1.5) = 10 * 30 = 300. Total 3500.
    assert data_2["base_pay"] == 3200.0
    assert data_2["overtime_pay"] == 300.0
    assert data_2["total_pay"] == 3500.0
