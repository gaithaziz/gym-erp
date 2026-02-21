import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings
from app.models.user import User
from app.auth.security import get_password_hash
from datetime import date, datetime, timedelta, timezone
from app.models.access import AttendanceLog
from app.models.hr import Payroll, LeaveRequest, LeaveStatus, LeaveType
from sqlalchemy import select, func

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
    payroll_id = data["id"]
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

    payslip_json = await client.get(f"{settings.API_V1_STR}/hr/payroll/{payroll_id}/payslip", headers=headers)
    assert payslip_json.status_code == 200

    payslip_print = await client.get(f"{settings.API_V1_STR}/hr/payroll/{payroll_id}/payslip/print", headers=headers)
    assert payslip_print.status_code == 200
    assert "text/html" in payslip_print.headers["content-type"]

    payroll_count_stmt = select(func.count(Payroll.id)).where(
        Payroll.user_id == user.id,
        Payroll.month == now.month,
        Payroll.year == now.year,
    )
    payroll_count_result = await db_session.execute(payroll_count_stmt)
    assert payroll_count_result.scalar_one() == 1


@pytest.mark.asyncio
async def test_attendance_correction_validation(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    admin = User(email="admin_hr_validation@gym.com", hashed_password=hashed, role="ADMIN", full_name="HR Validator")
    employee = User(email="employee_validation@gym.com", hashed_password=hashed, role="EMPLOYEE", full_name="Employee Validator")
    db_session.add(admin)
    db_session.add(employee)
    await db_session.flush()

    now = datetime.now(timezone.utc)
    attendance_log = AttendanceLog(
        user_id=employee.id,
        check_in_time=now - timedelta(hours=2),
        check_out_time=now - timedelta(hours=1),
        hours_worked=1.0,
    )
    db_session.add(attendance_log)
    await db_session.commit()

    login_resp = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": "admin_hr_validation@gym.com", "password": password}
    )
    token = login_resp.json()["data"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    invalid_order_resp = await client.put(
        f"{settings.API_V1_STR}/hr/attendance/{attendance_log.id}",
        json={
            "check_in_time": now.isoformat(),
            "check_out_time": (now - timedelta(minutes=30)).isoformat(),
        },
        headers=headers,
    )
    assert invalid_order_resp.status_code == 400

    too_long_resp = await client.put(
        f"{settings.API_V1_STR}/hr/attendance/{attendance_log.id}",
        json={
            "check_in_time": now.isoformat(),
            "check_out_time": (now + timedelta(hours=25)).isoformat(),
        },
        headers=headers,
    )
    assert too_long_resp.status_code == 400


@pytest.mark.asyncio
async def test_payroll_applies_approved_leave_deductions(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    admin = User(email="admin_leave_deduction@gym.com", hashed_password=hashed, role="ADMIN", full_name="HR Leave Admin")
    employee = User(email="employee_leave_deduction@gym.com", hashed_password=hashed, role="EMPLOYEE", full_name="Leave Employee")
    db_session.add(admin)
    db_session.add(employee)
    await db_session.flush()

    contract_data = {
        "user_id": str(employee.id),
        "start_date": str(date.today()),
        "base_salary": 3000.0,
        "contract_type": "FULL_TIME",
        "standard_hours": 160
    }

    login_resp = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": "admin_leave_deduction@gym.com", "password": password}
    )
    token = login_resp.json()["data"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    create_contract_resp = await client.post(f"{settings.API_V1_STR}/hr/contracts", json=contract_data, headers=headers)
    assert create_contract_resp.status_code == 200

    today = date.today()
    leave = LeaveRequest(
        user_id=employee.id,
        start_date=today.replace(day=1),
        end_date=today.replace(day=2),
        leave_type=LeaveType.SICK,
        status=LeaveStatus.APPROVED,
        reason="Medical leave",
    )
    db_session.add(leave)
    await db_session.commit()

    payroll_req = {"user_id": str(employee.id), "month": today.month, "year": today.year}
    payroll_resp = await client.post(f"{settings.API_V1_STR}/hr/payroll/generate", json=payroll_req, headers=headers)
    assert payroll_resp.status_code == 200
    data = payroll_resp.json()["data"]

    # 2 approved leave days on a 3000 monthly salary -> deductions = 2 * (3000 / 30) = 200.
    assert data["base_pay"] == 3000.0
    assert data["total_pay"] == 2800.0


@pytest.mark.asyncio
async def test_non_admin_cannot_view_other_user_payroll(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    admin = User(email="admin_payroll_access@gym.com", hashed_password=hashed, role="ADMIN", full_name="Payroll Admin")
    employee_target = User(email="employee_target@gym.com", hashed_password=hashed, role="EMPLOYEE", full_name="Target Employee")
    employee_other = User(email="employee_other@gym.com", hashed_password=hashed, role="EMPLOYEE", full_name="Other Employee")
    db_session.add_all([admin, employee_target, employee_other])
    await db_session.flush()

    admin_login = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": "admin_payroll_access@gym.com", "password": password}
    )
    admin_headers = {"Authorization": f"Bearer {admin_login.json()['data']['access_token']}"}

    create_contract = await client.post(
        f"{settings.API_V1_STR}/hr/contracts",
        json={
            "user_id": str(employee_target.id),
            "start_date": str(date.today()),
            "base_salary": 2500.0,
            "contract_type": "FULL_TIME",
            "standard_hours": 160,
        },
        headers=admin_headers,
    )
    assert create_contract.status_code == 200

    today = datetime.now(timezone.utc)
    generate = await client.post(
        f"{settings.API_V1_STR}/hr/payroll/generate",
        json={"user_id": str(employee_target.id), "month": today.month, "year": today.year},
        headers=admin_headers,
    )
    assert generate.status_code == 200

    other_login = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": "employee_other@gym.com", "password": password}
    )
    other_headers = {"Authorization": f"Bearer {other_login.json()['data']['access_token']}"}

    forbidden = await client.get(f"{settings.API_V1_STR}/hr/payroll/{employee_target.id}", headers=other_headers)
    assert forbidden.status_code == 403


@pytest.mark.asyncio
async def test_attendance_date_range_filter(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    admin = User(email="admin_attendance_filter@gym.com", hashed_password=hashed, role="ADMIN", full_name="Attendance Admin")
    employee = User(email="employee_attendance_filter@gym.com", hashed_password=hashed, role="EMPLOYEE", full_name="Attendance Employee")
    db_session.add_all([admin, employee])
    await db_session.flush()

    now = datetime.now(timezone.utc)
    recent_log = AttendanceLog(
        user_id=employee.id,
        check_in_time=now - timedelta(days=2, hours=1),
        check_out_time=now - timedelta(days=2),
        hours_worked=1.0,
    )
    old_log = AttendanceLog(
        user_id=employee.id,
        check_in_time=now - timedelta(days=10, hours=1),
        check_out_time=now - timedelta(days=10),
        hours_worked=1.0,
    )
    db_session.add_all([recent_log, old_log])
    await db_session.commit()

    login_resp = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": "admin_attendance_filter@gym.com", "password": password},
    )
    headers = {"Authorization": f"Bearer {login_resp.json()['data']['access_token']}"}

    start_date = (date.today() - timedelta(days=6)).isoformat()
    end_date = date.today().isoformat()
    resp = await client.get(
        f"{settings.API_V1_STR}/hr/attendance",
        params={"start_date": start_date, "end_date": end_date, "limit": 100},
        headers=headers,
    )
    assert resp.status_code == 200

    data = resp.json()["data"]
    returned_ids = {item["id"] for item in data}
    assert str(recent_log.id) in returned_ids
    assert str(old_log.id) not in returned_ids
