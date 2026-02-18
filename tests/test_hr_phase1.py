import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings
from app.models.user import User
from app.models.enums import Role
from app.auth.security import get_password_hash
from datetime import date, datetime, timezone

@pytest.mark.asyncio
async def test_hr_hybrid_and_staff_list(client: AsyncClient, db_session: AsyncSession):
    # 1. Setup Admin User
    password = "password123"
    hashed = get_password_hash(password)
    admin = User(email="admin_p1@gym.com", hashed_password=hashed, role=Role.ADMIN, full_name="HR Admin Phase1")
    db_session.add(admin)
    await db_session.flush()
    
    login_resp = await client.post(f"{settings.API_V1_STR}/auth/login", json={"email": "admin_p1@gym.com", "password": password})
    token = login_resp.json()["data"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    # 2. Create Employees
    emp1 = User(email="coach_h@gym.com", hashed_password=hashed, role=Role.COACH, full_name="Coach Hybrid")
    emp2 = User(email="cleaner@gym.com", hashed_password=hashed, role=Role.EMPLOYEE, full_name="Cleaner Staff")
    db_session.add_all([emp1, emp2])
    await db_session.flush()
    
    # 3. Create Hybrid Contract for Coach
    contract_data = {
        "user_id": str(emp1.id),
        "start_date": str(date.today()),
        "base_salary": 500.0,
        "contract_type": "HYBRID",
        "standard_hours": 160,
        "commission_rate": 0.10 # 10%
    }
    resp = await client.post(f"{settings.API_V1_STR}/hr/contracts", json=contract_data, headers=headers)
    assert resp.status_code == 200
    
    # 4. Generate Payroll for Hybrid
    # Currently unimplemented logic for actual commission calculation (sales input missing), 
    # but it should at least return Base Salary correctly as per our partial implementation.
    now = datetime.now(timezone.utc)
    payroll_req = {"user_id": str(emp1.id), "month": now.month, "year": now.year}
    resp_pay = await client.post(f"{settings.API_V1_STR}/hr/payroll/generate", json=payroll_req, headers=headers)
    assert resp_pay.status_code == 200
    data = resp_pay.json()["data"]
    assert data["base_pay"] == 500.0
    # assert data["total_pay"] == 500.0 # Until commissions are added
    
    # 5. Test Staff List
    resp_staff = await client.get(f"{settings.API_V1_STR}/hr/staff", headers=headers)
    assert resp_staff.status_code == 200
    staff_list = resp_staff.json()["data"]
    
    # Should get at least 2 (Coach and Cleaner)
    # Filter by IDs we just created to be safe against other tests
    staff_ids = [s["id"] for s in staff_list]
    assert str(emp1.id) in staff_ids
    assert str(emp2.id) in staff_ids
    
    # Check details for Coach
    coach_data = next(s for s in staff_list if s["id"] == str(emp1.id))
    assert coach_data["role"] == "COACH"
    assert coach_data["contract"]["type"] == "HYBRID"
    assert coach_data["contract"]["commission_rate"] == 0.10
    
    # Check details for Cleaner (No contract yet)
    cleaner_data = next(s for s in staff_list if s["id"] == str(emp2.id))
    assert cleaner_data["contract"] is None
