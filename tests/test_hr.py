import pytest
import uuid
import uuid
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings
from app.models.user import User
from app.auth.security import get_password_hash
from datetime import date, datetime, timedelta, timezone
from app.models.access import AttendanceLog
from app.models.hr import Payroll, PayrollStatus, LeaveRequest, LeaveStatus, LeaveType, PayrollPayment
from app.models.finance import Transaction, TransactionType, TransactionCategory
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


@pytest.mark.asyncio
async def test_cashier_and_reception_can_view_own_payroll_list(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    cashier = User(email="cashier_payroll@gym.com", hashed_password=hashed, role="CASHIER", full_name="Cashier Payroll")
    reception = User(email="reception_payroll@gym.com", hashed_password=hashed, role="RECEPTION", full_name="Reception Payroll")
    db_session.add_all([cashier, reception])
    await db_session.commit()

    for user in [cashier, reception]:
        login_resp = await client.post(
            f"{settings.API_V1_STR}/auth/login",
            json={"email": user.email, "password": password},
        )
        assert login_resp.status_code == 200
        token = login_resp.json()["data"]["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        own_payroll = await client.get(f"{settings.API_V1_STR}/hr/payroll/{user.id}", headers=headers)
        assert own_payroll.status_code == 200


@pytest.mark.asyncio
async def test_admin_leaves_filters(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    admin = User(email="admin_leave_filters@gym.com", hashed_password=hashed, role="ADMIN", full_name="Leave Filter Admin")
    employee_a = User(email="leave_filter_a@gym.com", hashed_password=hashed, role="EMPLOYEE", full_name="Alice Filter")
    employee_b = User(email="leave_filter_b@gym.com", hashed_password=hashed, role="EMPLOYEE", full_name="Bob Filter")
    db_session.add_all([admin, employee_a, employee_b])
    await db_session.flush()

    leave_a = LeaveRequest(
        user_id=employee_a.id,
        start_date=date.today() - timedelta(days=1),
        end_date=date.today() + timedelta(days=1),
        leave_type=LeaveType.SICK,
        status=LeaveStatus.PENDING,
        reason="Alice pending",
    )
    leave_b = LeaveRequest(
        user_id=employee_b.id,
        start_date=date.today() - timedelta(days=8),
        end_date=date.today() - timedelta(days=7),
        leave_type=LeaveType.VACATION,
        status=LeaveStatus.APPROVED,
        reason="Bob approved",
    )
    db_session.add_all([leave_a, leave_b])
    await db_session.commit()

    login_resp = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": admin.email, "password": password},
    )
    headers = {"Authorization": f"Bearer {login_resp.json()['data']['access_token']}"}

    resp = await client.get(
        f"{settings.API_V1_STR}/hr/leaves",
        params={
            "status": "PENDING",
            "leave_type": "SICK",
            "search": "alice",
            "start_date": (date.today() - timedelta(days=2)).isoformat(),
            "end_date": (date.today() + timedelta(days=2)).isoformat(),
            "limit": 20,
            "offset": 0,
        },
        headers=headers,
    )
    assert resp.status_code == 200
    rows = resp.json()["data"]
    assert len(rows) == 1
    assert rows[0]["id"] == str(leave_a.id)


@pytest.mark.asyncio
async def test_payroll_settings_and_partial_payments_flow(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    admin = User(email="admin_payroll_partial@gym.com", hashed_password=hashed, role="ADMIN", full_name="Payroll Partial Admin")
    employee = User(email="employee_payroll_partial@gym.com", hashed_password=hashed, role="EMPLOYEE", full_name="Payroll Partial Employee")
    db_session.add_all([admin, employee])
    await db_session.flush()

    login_resp = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": admin.email, "password": password},
    )
    headers = {"Authorization": f"Bearer {login_resp.json()['data']['access_token']}"}

    settings_resp = await client.patch(
        f"{settings.API_V1_STR}/hr/payrolls/settings",
        json={"salary_cutoff_day": 25},
        headers=headers,
    )
    assert settings_resp.status_code == 200

    settings_get = await client.get(f"{settings.API_V1_STR}/hr/payrolls/settings", headers=headers)
    assert settings_get.status_code == 200
    assert settings_get.json()["data"]["salary_cutoff_day"] == 25

    create_contract = await client.post(
        f"{settings.API_V1_STR}/hr/contracts",
        json={
            "user_id": str(employee.id),
            "start_date": str(date.today()),
            "base_salary": 1000.0,
            "contract_type": "FULL_TIME",
            "standard_hours": 160,
        },
        headers=headers,
    )
    assert create_contract.status_code == 200

    now = datetime.now(timezone.utc)
    generate = await client.post(
        f"{settings.API_V1_STR}/hr/payroll/generate",
        json={"user_id": str(employee.id), "month": now.month, "year": now.year},
        headers=headers,
    )
    assert generate.status_code == 200
    payroll_id = generate.json()["data"]["id"]

    mark_paid_too_early = await client.patch(
        f"{settings.API_V1_STR}/hr/payrolls/{payroll_id}/status",
        json={"status": "PAID"},
        headers=headers,
    )
    assert mark_paid_too_early.status_code == 400

    partial_payment = await client.post(
        f"{settings.API_V1_STR}/hr/payrolls/{payroll_id}/payments",
        json={"amount": 400.0, "payment_method": "CASH"},
        headers=headers,
    )
    assert partial_payment.status_code == 200
    payload = partial_payment.json()["data"]
    assert payload["status"] == "PARTIAL"
    assert payload["paid_amount"] == 400.0
    assert payload["pending_amount"] == 600.0

    full_settlement = await client.post(
        f"{settings.API_V1_STR}/hr/payrolls/{payroll_id}/payments",
        json={"amount": 600.0, "payment_method": "CARD"},
        headers=headers,
    )
    assert full_settlement.status_code == 200
    settle_payload = full_settlement.json()["data"]
    assert settle_payload["status"] == "PARTIAL"
    assert settle_payload["pending_amount"] == 0.0

    mark_paid = await client.patch(
        f"{settings.API_V1_STR}/hr/payrolls/{payroll_id}/status",
        json={"status": "PAID"},
        headers=headers,
    )
    assert mark_paid.status_code == 200
    assert mark_paid.json()["data"]["status"] == "PAID"

    reopen = await client.patch(
        f"{settings.API_V1_STR}/hr/payrolls/{payroll_id}/status",
        json={"status": "DRAFT"},
        headers=headers,
    )
    assert reopen.status_code == 200
    reopened = reopen.json()["data"]
    assert reopened["status"] == "DRAFT"
    assert reopened["paid_amount"] == 0.0
    assert reopened["pending_amount"] == 1000.0

    payment_count_stmt = select(func.count(PayrollPayment.id)).where(PayrollPayment.payroll_id == uuid.UUID(payroll_id))
    payment_count_res = await db_session.execute(payment_count_stmt)
    assert payment_count_res.scalar_one() == 0


@pytest.mark.asyncio
async def test_subscription_renewal_posts_finance_transaction(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    admin = User(email="admin_sub_payment@gym.com", hashed_password=hashed, role="ADMIN", full_name="Subscription Admin")
    member = User(email="member_sub_payment@gym.com", hashed_password=hashed, role="CUSTOMER", full_name="Subscription Member")
    db_session.add_all([admin, member])
    await db_session.flush()

    login_resp = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": admin.email, "password": password},
    )
    headers = {"Authorization": f"Bearer {login_resp.json()['data']['access_token']}"}

    sub_resp = await client.post(
        f"{settings.API_V1_STR}/hr/subscriptions",
        json={
            "user_id": str(member.id),
            "plan_name": "Monthly",
            "duration_days": 30,
            "amount_paid": 75.0,
            "payment_method": "CASH",
        },
        headers=headers,
    )
    assert sub_resp.status_code == 200

    tx_stmt = select(Transaction).where(
        Transaction.user_id == member.id,
        Transaction.type == TransactionType.INCOME,
        Transaction.category == TransactionCategory.SUBSCRIPTION,
    )
    tx_res = await db_session.execute(tx_stmt)
    tx = tx_res.scalar_one_or_none()
    assert tx is not None
    assert float(tx.amount) == 75.0


@pytest.mark.asyncio
async def test_pending_payroll_status_workflow_and_idempotency(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    admin = User(email="admin_payroll_flow@gym.com", hashed_password=hashed, role="ADMIN", full_name="Payroll Flow Admin")
    employee = User(email="payroll_flow_emp@gym.com", hashed_password=hashed, role="EMPLOYEE", full_name="Payroll Employee")
    db_session.add_all([admin, employee])
    await db_session.flush()

    db_session.add(
        LeaveRequest(
            user_id=employee.id,
            start_date=date.today(),
            end_date=date.today(),
            leave_type=LeaveType.OTHER,
            status=LeaveStatus.DENIED,
            reason="ignored",
        )
    )
    await db_session.commit()

    admin_login = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": admin.email, "password": password},
    )
    headers = {"Authorization": f"Bearer {admin_login.json()['data']['access_token']}"}

    create_contract = await client.post(
        f"{settings.API_V1_STR}/hr/contracts",
        json={
            "user_id": str(employee.id),
            "start_date": str(date.today()),
            "base_salary": 2000.0,
            "contract_type": "FULL_TIME",
            "standard_hours": 160,
        },
        headers=headers,
    )
    assert create_contract.status_code == 200

    now = datetime.now(timezone.utc)
    generate_resp = await client.post(
        f"{settings.API_V1_STR}/hr/payroll/generate",
        json={"user_id": str(employee.id), "month": now.month, "year": now.year},
        headers=headers,
    )
    assert generate_resp.status_code == 200
    payroll_id = generate_resp.json()["data"]["id"]

    pending_resp = await client.get(
        f"{settings.API_V1_STR}/hr/payrolls/pending",
        params={"status": "DRAFT", "search": "payroll employee"},
        headers=headers,
    )
    assert pending_resp.status_code == 200
    pending_rows = pending_resp.json()["data"]
    assert any(row["id"] == payroll_id for row in pending_rows)

    paid_resp = await client.patch(
        f"{settings.API_V1_STR}/hr/payrolls/{payroll_id}/status",
        json={"status": "PAID"},
        headers=headers,
    )
    assert paid_resp.status_code == 400

    payment_resp = await client.post(
        f"{settings.API_V1_STR}/hr/payrolls/{payroll_id}/payments",
        json={"amount": 2000.0, "payment_method": "CASH"},
        headers=headers,
    )
    assert payment_resp.status_code == 200
    assert payment_resp.json()["data"]["status"] == "PARTIAL"
    assert payment_resp.json()["data"]["pending_amount"] == 0.0

    paid_resp = await client.patch(
        f"{settings.API_V1_STR}/hr/payrolls/{payroll_id}/status",
        json={"status": "PAID"},
        headers=headers,
    )
    assert paid_resp.status_code == 200

    no_dup_resp = await client.patch(
        f"{settings.API_V1_STR}/hr/payrolls/{payroll_id}/status",
        json={"status": "PAID"},
        headers=headers,
    )
    assert no_dup_resp.status_code == 200
    assert no_dup_resp.json()["message"] == "Payroll status unchanged"

    payroll_stmt = select(Payroll).where(Payroll.id == uuid.UUID(payroll_id))
    payroll_result = await db_session.execute(payroll_stmt)
    payroll = payroll_result.scalar_one()
    assert payroll.status == PayrollStatus.PAID
    assert payroll.paid_transaction_id is not None

    salary_tx_stmt = select(func.count(Transaction.id)).where(
        Transaction.user_id == employee.id,
        Transaction.type == TransactionType.EXPENSE,
        Transaction.category == TransactionCategory.SALARY,
    )
    salary_tx_count = (await db_session.execute(salary_tx_stmt)).scalar_one()
    assert salary_tx_count == 1

    reopen_resp = await client.patch(
        f"{settings.API_V1_STR}/hr/payrolls/{payroll_id}/status",
        json={"status": "DRAFT"},
        headers=headers,
    )
    assert reopen_resp.status_code == 200

    reversal_stmt = select(func.count(Transaction.id)).where(
        Transaction.user_id == employee.id,
        Transaction.type == TransactionType.INCOME,
        Transaction.category == TransactionCategory.OTHER_INCOME,
    )
    reversal_count = (await db_session.execute(reversal_stmt)).scalar_one()
    assert reversal_count == 1


@pytest.mark.asyncio
async def test_staff_summary_range_and_non_admin_forbidden(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    admin = User(email="admin_staff_summary@gym.com", hashed_password=hashed, role="ADMIN", full_name="Summary Admin")
    employee = User(email="staff_summary_emp@gym.com", hashed_password=hashed, role="EMPLOYEE", full_name="Summary Employee")
    other = User(email="staff_summary_other@gym.com", hashed_password=hashed, role="EMPLOYEE", full_name="Summary Other")
    db_session.add_all([admin, employee, other])
    await db_session.flush()

    now = datetime.now(timezone.utc)
    in_range_log = AttendanceLog(
        user_id=employee.id,
        check_in_time=now - timedelta(days=1, hours=2),
        check_out_time=now - timedelta(days=1),
        hours_worked=2.0,
    )
    out_of_range_log = AttendanceLog(
        user_id=employee.id,
        check_in_time=now - timedelta(days=10, hours=2),
        check_out_time=now - timedelta(days=10),
        hours_worked=2.0,
    )
    leave = LeaveRequest(
        user_id=employee.id,
        start_date=(date.today() - timedelta(days=1)),
        end_date=(date.today() - timedelta(days=1)),
        leave_type=LeaveType.SICK,
        status=LeaveStatus.APPROVED,
        reason="Summary leave",
    )
    db_session.add_all([in_range_log, out_of_range_log, leave])
    await db_session.commit()

    admin_login = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": admin.email, "password": password},
    )
    admin_headers = {"Authorization": f"Bearer {admin_login.json()['data']['access_token']}"}

    start_date = (date.today() - timedelta(days=2)).isoformat()
    end_date = date.today().isoformat()
    summary_resp = await client.get(
        f"{settings.API_V1_STR}/hr/staff/{employee.id}/summary",
        params={"start_date": start_date, "end_date": end_date},
        headers=admin_headers,
    )
    assert summary_resp.status_code == 200
    data = summary_resp.json()["data"]
    assert data["attendance_summary"]["days_present"] == 1
    assert data["attendance_summary"]["total_hours"] == 2.0
    assert data["leave_summary"]["approved_days"] == 1

    print_resp = await client.get(
        f"{settings.API_V1_STR}/hr/staff/{employee.id}/summary/print",
        params={"start_date": start_date, "end_date": end_date},
        headers=admin_headers,
    )
    assert print_resp.status_code == 200
    assert "text/html" in print_resp.headers["content-type"]

    other_login = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": other.email, "password": password},
    )
    other_headers = {"Authorization": f"Bearer {other_login.json()['data']['access_token']}"}
    forbidden = await client.get(
        f"{settings.API_V1_STR}/hr/staff/{employee.id}/summary",
        headers=other_headers,
    )
    assert forbidden.status_code == 403


@pytest.mark.asyncio
async def test_paid_payroll_is_locked_from_regeneration(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    admin = User(email="admin_paid_lock@gym.com", hashed_password=hashed, role="ADMIN", full_name="Paid Lock Admin")
    employee = User(email="employee_paid_lock@gym.com", hashed_password=hashed, role="EMPLOYEE", full_name="Paid Lock Employee")
    db_session.add_all([admin, employee])
    await db_session.flush()
    await db_session.commit()

    login_resp = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": admin.email, "password": password},
    )
    headers = {"Authorization": f"Bearer {login_resp.json()['data']['access_token']}"}

    contract_resp = await client.post(
        f"{settings.API_V1_STR}/hr/contracts",
        json={
            "user_id": str(employee.id),
            "start_date": str(date.today()),
            "base_salary": 1500.0,
            "contract_type": "FULL_TIME",
            "standard_hours": 160,
        },
        headers=headers,
    )
    assert contract_resp.status_code == 200

    now = datetime.now(timezone.utc)
    generate = await client.post(
        f"{settings.API_V1_STR}/hr/payroll/generate",
        json={"user_id": str(employee.id), "month": now.month, "year": now.year},
        headers=headers,
    )
    assert generate.status_code == 200
    payroll_id = generate.json()["data"]["id"]

    pay_all = await client.post(
        f"{settings.API_V1_STR}/hr/payrolls/{payroll_id}/payments",
        json={"amount": 1500.0, "payment_method": "CASH"},
        headers=headers,
    )
    assert pay_all.status_code == 200
    mark_paid = await client.patch(
        f"{settings.API_V1_STR}/hr/payrolls/{payroll_id}/status",
        json={"status": "PAID"},
        headers=headers,
    )
    assert mark_paid.status_code == 200

    locked_regen = await client.post(
        f"{settings.API_V1_STR}/hr/payroll/generate",
        json={"user_id": str(employee.id), "month": now.month, "year": now.year},
        headers=headers,
    )
    assert locked_regen.status_code == 400
    assert "locked" in (locked_regen.json().get("detail") or "").lower()


@pytest.mark.asyncio
async def test_contract_update_triggers_auto_payroll_refresh(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    admin = User(email="admin_contract_auto@gym.com", hashed_password=hashed, role="ADMIN", full_name="Contract Auto Admin")
    employee = User(email="employee_contract_auto@gym.com", hashed_password=hashed, role="EMPLOYEE", full_name="Contract Auto Employee")
    db_session.add_all([admin, employee])
    await db_session.flush()
    await db_session.commit()

    login_resp = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": admin.email, "password": password},
    )
    headers = {"Authorization": f"Bearer {login_resp.json()['data']['access_token']}"}

    create_contract = await client.post(
        f"{settings.API_V1_STR}/hr/contracts",
        json={
            "user_id": str(employee.id),
            "start_date": str(date.today()),
            "base_salary": 1200.0,
            "contract_type": "FULL_TIME",
            "standard_hours": 160,
        },
        headers=headers,
    )
    assert create_contract.status_code == 200

    now = datetime.now(timezone.utc)
    generate = await client.post(
        f"{settings.API_V1_STR}/hr/payroll/generate",
        json={"user_id": str(employee.id), "month": now.month, "year": now.year},
        headers=headers,
    )
    assert generate.status_code == 200
    assert generate.json()["data"]["base_pay"] == 1200.0

    update_contract = await client.post(
        f"{settings.API_V1_STR}/hr/contracts",
        json={
            "user_id": str(employee.id),
            "start_date": str(date.today()),
            "base_salary": 1700.0,
            "contract_type": "FULL_TIME",
            "standard_hours": 160,
        },
        headers=headers,
    )
    assert update_contract.status_code == 200

    check_payroll = await client.get(
        f"{settings.API_V1_STR}/hr/payrolls/pending",
        params={"user_id": str(employee.id), "month": now.month, "year": now.year, "limit": 1},
        headers=headers,
    )
    assert check_payroll.status_code == 200
    rows = check_payroll.json()["data"]
    assert len(rows) >= 1
    assert rows[0]["base_pay"] == 1700.0


@pytest.mark.asyncio
async def test_payroll_automation_run_and_status_endpoints(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    admin = User(email="admin_payroll_auto_endpoints@gym.com", hashed_password=hashed, role="ADMIN", full_name="Auto Endpoint Admin")
    employee = User(email="employee_payroll_auto_endpoints@gym.com", hashed_password=hashed, role="EMPLOYEE", full_name="Auto Endpoint Employee")
    db_session.add_all([admin, employee])
    await db_session.flush()
    await db_session.commit()

    login_resp = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": admin.email, "password": password},
    )
    headers = {"Authorization": f"Bearer {login_resp.json()['data']['access_token']}"}

    create_contract = await client.post(
        f"{settings.API_V1_STR}/hr/contracts",
        json={
            "user_id": str(employee.id),
            "start_date": str(date.today()),
            "base_salary": 1300.0,
            "contract_type": "FULL_TIME",
            "standard_hours": 160,
        },
        headers=headers,
    )
    assert create_contract.status_code == 200

    now = datetime.now(timezone.utc)
    run_resp = await client.post(
        f"{settings.API_V1_STR}/hr/payrolls/automation/run",
        json={"user_id": str(employee.id), "month": now.month, "year": now.year},
        headers=headers,
    )
    assert run_resp.status_code == 200
    run_data = run_resp.json()["data"]
    assert run_data["users_scanned"] == 1
    assert run_data["periods_scanned"] == 1

    status_resp = await client.get(
        f"{settings.API_V1_STR}/hr/payrolls/automation/status",
        headers=headers,
    )
    assert status_resp.status_code == 200
    status_data = status_resp.json()["data"]
    assert "enabled" in status_data
    assert "schedule" in status_data
    assert "last_summary" in status_data
