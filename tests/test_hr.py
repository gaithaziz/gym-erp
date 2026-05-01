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
from app.models.hr import Contract, ContractType
from app.models.staff_debt import StaffDebtAccount, StaffDebtMonthlyBalance
from app.models.fitness import WorkoutPlan, DietPlan
from app.models.finance import Transaction, TransactionType, TransactionCategory
from app.models.access import Subscription
from app.models.tenancy import Branch, UserBranchAccess
from app.services.tenancy_service import TenancyService
from sqlalchemy import select, func

@pytest.mark.asyncio
async def test_hr_flow(client: AsyncClient, db_session: AsyncSession):
    # 1. Setup Admin User
    password = "password123"
    hashed = get_password_hash(password)
    _, branch = await TenancyService.ensure_default_gym_and_branch(db_session)
    admin = User(email="admin_hr@gym.com", hashed_password=hashed, role="ADMIN", full_name="HR Admin", home_branch_id=branch.id)
    db_session.add(admin)
    await db_session.flush()
    
    login_resp = await client.post(f"{settings.API_V1_STR}/auth/login", json={"email": "admin_hr@gym.com", "password": password})
    token = login_resp.json()["data"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    # 2. Create User for Contract
    user = User(email="employee@gym.com", hashed_password=hashed, role="EMPLOYEE", full_name="Employee John", home_branch_id=branch.id)
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
        check_in_time=now - timedelta(hours=1),
        check_out_time=now,
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
    _, branch = await TenancyService.ensure_default_gym_and_branch(db_session)
    admin = User(email="admin_hr_validation@gym.com", hashed_password=hashed, role="ADMIN", full_name="HR Validator", home_branch_id=branch.id)
    employee = User(email="employee_validation@gym.com", hashed_password=hashed, role="EMPLOYEE", full_name="Employee Validator", home_branch_id=branch.id)
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
    _, branch = await TenancyService.ensure_default_gym_and_branch(db_session)
    admin = User(email="admin_leave_deduction@gym.com", hashed_password=hashed, role="ADMIN", full_name="HR Leave Admin", home_branch_id=branch.id)
    employee = User(email="employee_leave_deduction@gym.com", hashed_password=hashed, role="EMPLOYEE", full_name="Leave Employee", home_branch_id=branch.id)
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

    payroll_req = {"user_id": str(employee.id), "month": today.month, "year": today.year, "manual_deductions": 50.0}
    payroll_resp = await client.post(f"{settings.API_V1_STR}/hr/payroll/generate", json=payroll_req, headers=headers)
    assert payroll_resp.status_code == 200
    data = payroll_resp.json()["data"]

    # 2 approved leave days on a 3000 monthly salary -> auto deductions = 2 * (3000 / 30) = 200.
    assert data["base_pay"] == 3000.0
    assert data["leave_deductions"] == 200.0
    assert data["manual_deductions"] == 50.0
    assert data["deductions"] == 250.0
    assert data["total_pay"] == 2750.0


@pytest.mark.asyncio
async def test_non_full_time_payroll_is_rejected(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    _, branch = await TenancyService.ensure_default_gym_and_branch(db_session)
    admin = User(email="admin_non_full_time@gym.com", hashed_password=hashed, role="ADMIN", full_name="Payroll Admin", home_branch_id=branch.id)
    employee = User(email="employee_non_full_time@gym.com", hashed_password=hashed, role="EMPLOYEE", full_name="Non Full Time Employee", home_branch_id=branch.id)
    db_session.add_all([admin, employee])
    await db_session.flush()

    login_resp = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": admin.email, "password": password},
    )
    headers = {"Authorization": f"Bearer {login_resp.json()['data']['access_token']}"}

    create_contract_resp = await client.post(
        f"{settings.API_V1_STR}/hr/contracts",
        json={
            "user_id": str(employee.id),
            "start_date": str(date.today()),
            "base_salary": 30.0,
            "contract_type": "PART_TIME",
            "standard_hours": 160,
        },
        headers=headers,
    )
    assert create_contract_resp.status_code == 200

    now = datetime.now(timezone.utc)
    payroll_resp = await client.post(
        f"{settings.API_V1_STR}/hr/payroll/generate",
        json={"user_id": str(employee.id), "month": now.month, "year": now.year},
        headers=headers,
    )
    assert payroll_resp.status_code == 400
    assert "full-time" in (payroll_resp.json().get("detail") or "").lower()


@pytest.mark.asyncio
async def test_non_admin_cannot_view_other_user_payroll(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    _, branch = await TenancyService.ensure_default_gym_and_branch(db_session)
    admin = User(email="admin_payroll_access@gym.com", hashed_password=hashed, role="ADMIN", full_name="Payroll Admin", home_branch_id=branch.id)
    employee_target = User(email="employee_target@gym.com", hashed_password=hashed, role="EMPLOYEE", full_name="Target Employee", home_branch_id=branch.id)
    employee_other = User(email="employee_other@gym.com", hashed_password=hashed, role="EMPLOYEE", full_name="Other Employee", home_branch_id=branch.id)
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
async def test_customer_accounts_cannot_enter_payroll_flow(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    _, branch = await TenancyService.ensure_default_gym_and_branch(db_session)
    admin = User(email="admin_customer_payroll@gym.com", hashed_password=hashed, role="ADMIN", full_name="Customer Payroll Admin", home_branch_id=branch.id)
    customer = User(email="customer_payroll@gym.com", hashed_password=hashed, role="CUSTOMER", full_name="Customer Account", home_branch_id=branch.id)
    db_session.add_all([admin, customer])
    await db_session.flush()

    login_resp = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": admin.email, "password": password},
    )
    headers = {"Authorization": f"Bearer {login_resp.json()['data']['access_token']}"}

    contract_resp = await client.post(
        f"{settings.API_V1_STR}/hr/contracts",
        json={
            "user_id": str(customer.id),
            "start_date": str(date.today()),
            "base_salary": 5000.0,
            "contract_type": "FULL_TIME",
            "standard_hours": 160,
        },
        headers=headers,
    )
    assert contract_resp.status_code == 400
    assert "customer" in (contract_resp.json().get("detail") or "").lower()

    payroll_resp = await client.post(
        f"{settings.API_V1_STR}/hr/payroll/generate",
        json={"user_id": str(customer.id), "month": datetime.now(timezone.utc).month, "year": datetime.now(timezone.utc).year},
        headers=headers,
    )
    assert payroll_resp.status_code == 400
    assert "staff" in (payroll_resp.json().get("detail") or "").lower()


@pytest.mark.asyncio
async def test_catchup_payroll_is_prorated_for_short_period(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    gym, branch = await TenancyService.ensure_default_gym_and_branch(db_session)
    admin = User(email="admin_catchup_prorate@gym.com", hashed_password=hashed, role="ADMIN", full_name="Catch-up Admin", home_branch_id=branch.id)
    employee = User(email="employee_catchup_prorate@gym.com", hashed_password=hashed, role="EMPLOYEE", full_name="Catch-up Employee", home_branch_id=branch.id)
    db_session.add_all([admin, employee])
    await db_session.flush()

    login_resp = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": admin.email, "password": password},
    )
    headers = {"Authorization": f"Bearer {login_resp.json()['data']['access_token']}"}

    db_session.add(
        Contract(
            gym_id=gym.id,
            user_id=employee.id,
            start_date=date.today() - timedelta(days=10),
            base_salary=5000.0,
            contract_type=ContractType.FULL_TIME,
            standard_hours=160,
        )
    )
    await db_session.commit()

    now = datetime.now(timezone.utc)
    previous_period_end = now - timedelta(days=7)
    previous_payroll_month = now.month - 1 if now.month > 1 else 12
    previous_payroll_year = now.year if now.month > 1 else now.year - 1
    current_previous_payroll = Payroll(
        gym_id=gym.id,
        user_id=employee.id,
        month=previous_payroll_month,
        year=previous_payroll_year,
        period_start=previous_period_end - timedelta(days=24),
        period_end=previous_period_end,
        base_pay=5000.0,
        overtime_hours=0.0,
        overtime_pay=0.0,
        commission_pay=0.0,
        bonus_pay=0.0,
        manual_deductions=0.0,
        deductions=0.0,
        total_pay=5000.0,
        status=PayrollStatus.PAID,
        paid_at=previous_period_end,
        paid_by_user_id=admin.id,
    )
    db_session.add(current_previous_payroll)
    for offset in range(6):
        db_session.add(
            AttendanceLog(
                user_id=employee.id,
                check_in_time=(previous_period_end + timedelta(days=offset + 1)).replace(tzinfo=timezone.utc),
                check_out_time=(previous_period_end + timedelta(days=offset + 1)).replace(tzinfo=timezone.utc) + timedelta(hours=8),
                hours_worked=8.0,
            )
        )
    await db_session.commit()

    generate_resp = await client.post(
        f"{settings.API_V1_STR}/hr/payroll/generate",
        json={
            "user_id": str(employee.id),
            "month": now.month,
            "year": now.year,
            "from_last_paid": True,
            "calculation_mode": "DAYS_WORKED",
        },
        headers=headers,
    )
    assert generate_resp.status_code == 200
    data = generate_resp.json()["data"]
    assert data["period_start"] is not None
    assert data["period_end"] is not None
    assert data["base_pay"] == 1000.0
    assert data["total_pay"] == 1000.0


@pytest.mark.asyncio
async def test_manager_cannot_generate_payroll_outside_branch(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    gym, branch_a = await TenancyService.ensure_default_gym_and_branch(db_session)
    branch_b = Branch(
        gym_id=gym.id,
        slug="branch-b",
        code="BRB",
        name="Branch B",
        display_name="Branch B",
        timezone="UTC",
    )
    manager = User(email="manager_branch_scope@gym.com", hashed_password=hashed, role="MANAGER", full_name="Branch Manager", home_branch_id=None)
    db_session.add_all([branch_b, manager])
    await db_session.flush()

    employee = User(email="employee_branch_scope@gym.com", hashed_password=hashed, role="EMPLOYEE", full_name="Branch Employee", home_branch_id=branch_b.id)
    db_session.add(employee)
    await db_session.flush()

    db_session.add(UserBranchAccess(user_id=manager.id, gym_id=gym.id, branch_id=branch_a.id))
    db_session.add(UserBranchAccess(user_id=employee.id, gym_id=gym.id, branch_id=branch_b.id))
    await db_session.commit()

    admin = User(email="admin_branch_scope@gym.com", hashed_password=hashed, role="ADMIN", full_name="Branch Admin", home_branch_id=branch_a.id)
    db_session.add(admin)
    await db_session.flush()
    await db_session.commit()

    admin_login = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": admin.email, "password": password},
    )
    admin_headers = {"Authorization": f"Bearer {admin_login.json()['data']['access_token']}"}
    contract_resp = await client.post(
        f"{settings.API_V1_STR}/hr/contracts",
        json={
            "user_id": str(employee.id),
            "start_date": str(date.today()),
            "base_salary": 1800.0,
            "contract_type": "FULL_TIME",
            "standard_hours": 160,
        },
        headers=admin_headers,
    )
    assert contract_resp.status_code == 200

    manager_login = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": manager.email, "password": password},
    )
    manager_headers = {"Authorization": f"Bearer {manager_login.json()['data']['access_token']}"}

    payroll_resp = await client.post(
        f"{settings.API_V1_STR}/hr/payroll/generate",
        json={"user_id": str(employee.id), "month": datetime.now(timezone.utc).month, "year": datetime.now(timezone.utc).year},
        headers=manager_headers,
    )
    assert payroll_resp.status_code == 403


@pytest.mark.asyncio
async def test_manager_sees_branch_workout_and_diet_plans(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    gym, main_branch = await TenancyService.ensure_default_gym_and_branch(db_session)
    other_branch = Branch(
        gym_id=gym.id,
        slug="branch-b-plans",
        code="BPL",
        name="Branch B Plans",
        display_name="Branch B Plans",
        timezone="UTC",
    )
    manager = User(
        email="manager_branch_plans@gym.com",
        hashed_password=hashed,
        role="MANAGER",
        full_name="Branch Plans Manager",
        home_branch_id=None,
    )
    coach_main = User(
        email="coach_main_plans@gym.com",
        hashed_password=hashed,
        role="COACH",
        full_name="Main Branch Coach",
        home_branch_id=main_branch.id,
    )
    coach_other = User(
        email="coach_other_plans@gym.com",
        hashed_password=hashed,
        role="COACH",
        full_name="Other Branch Coach",
        home_branch_id=other_branch.id,
    )
    db_session.add_all([other_branch, manager, coach_main, coach_other])
    await db_session.flush()
    coach_other.home_branch_id = other_branch.id
    await db_session.flush()

    db_session.add_all([
        WorkoutPlan(
            gym_id=gym.id,
            name="Main Branch Workout",
            description="Visible to the main branch manager",
            is_template=True,
            status="DRAFT",
            version=1,
            expected_sessions_per_30d=12,
            creator_id=coach_main.id,
            member_id=None,
        ),
        WorkoutPlan(
            gym_id=gym.id,
            name="Other Branch Workout",
            description="Should not leak across branches",
            is_template=True,
            status="DRAFT",
            version=1,
            expected_sessions_per_30d=12,
            creator_id=coach_other.id,
            member_id=None,
        ),
        DietPlan(
            gym_id=gym.id,
            name="Main Branch Diet",
            description="Visible to the main branch manager",
            content="Main branch meal plan",
            is_template=True,
            status="DRAFT",
            version=1,
            creator_id=coach_main.id,
            member_id=None,
        ),
        DietPlan(
            gym_id=gym.id,
            name="Other Branch Diet",
            description="Should not leak across branches",
            content="Other branch meal plan",
            is_template=True,
            status="DRAFT",
            version=1,
            creator_id=coach_other.id,
            member_id=None,
        ),
    ])
    await db_session.commit()

    login_resp = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": manager.email, "password": password},
    )
    assert login_resp.status_code == 200
    headers = {"Authorization": f"Bearer {login_resp.json()['data']['access_token']}"}

    plans_resp = await client.get(
        f"{settings.API_V1_STR}/fitness/plans",
        params={"include_all_creators": True, "branch_id": str(main_branch.id)},
        headers=headers,
    )
    assert plans_resp.status_code == 200
    plan_names = {item["name"] for item in plans_resp.json()["data"]}
    assert "Main Branch Workout" in plan_names
    assert "Other Branch Workout" not in plan_names

    diets_resp = await client.get(
        f"{settings.API_V1_STR}/fitness/diets",
        params={"include_all_creators": True, "branch_id": str(main_branch.id)},
        headers=headers,
    )
    assert diets_resp.status_code == 200
    diet_names = {item["name"] for item in diets_resp.json()["data"]}
    assert "Main Branch Diet" in diet_names
    assert "Other Branch Diet" not in diet_names


@pytest.mark.asyncio
async def test_manager_without_branch_assignment_falls_back_to_main_branch(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    gym, main_branch = await TenancyService.ensure_default_gym_and_branch(db_session)
    extra_branch = Branch(
        gym_id=gym.id,
        slug="branch-b",
        code="BRB",
        name="Branch B",
        display_name="Branch B",
        timezone="UTC",
    )
    manager = User(
        email="manager_fallback_branch@gym.com",
        hashed_password=hashed,
        role="MANAGER",
        full_name="Fallback Manager",
        home_branch_id=None,
    )
    db_session.add_all([extra_branch, manager])
    await db_session.commit()

    login_resp = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": manager.email, "password": password},
    )
    assert login_resp.status_code == 200
    headers = {"Authorization": f"Bearer {login_resp.json()['data']['access_token']}"}

    branches_resp = await client.get(f"{settings.API_V1_STR}/hr/branches", headers=headers)
    assert branches_resp.status_code == 200
    branches = branches_resp.json()["data"]
    assert len(branches) >= 1
    assert branches[0]["id"] == str(main_branch.id)
    assert any(branch["id"] == str(main_branch.id) for branch in branches)

    dashboard_resp = await client.get(
        f"{settings.API_V1_STR}/analytics/dashboard",
        params={"branch_id": str(main_branch.id)},
        headers=headers,
    )
    assert dashboard_resp.status_code == 200
    assert "today_visitors" in dashboard_resp.json()["data"]


@pytest.mark.asyncio
async def test_attendance_date_range_filter(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    _, branch = await TenancyService.ensure_default_gym_and_branch(db_session)
    admin = User(email="admin_attendance_filter@gym.com", hashed_password=hashed, role="ADMIN", full_name="Attendance Admin", home_branch_id=branch.id)
    employee = User(email="employee_attendance_filter@gym.com", hashed_password=hashed, role="EMPLOYEE", full_name="Attendance Employee", home_branch_id=branch.id)
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
    _, branch = await TenancyService.ensure_default_gym_and_branch(db_session)
    cashier = User(email="cashier_payroll@gym.com", hashed_password=hashed, role="CASHIER", full_name="Cashier Payroll", home_branch_id=branch.id)
    reception = User(email="reception_payroll@gym.com", hashed_password=hashed, role="RECEPTION", full_name="Reception Payroll", home_branch_id=branch.id)
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
    _, branch = await TenancyService.ensure_default_gym_and_branch(db_session)
    admin = User(email="admin_leave_filters@gym.com", hashed_password=hashed, role="ADMIN", full_name="Leave Filter Admin", home_branch_id=branch.id)
    employee_a = User(email="leave_filter_a@gym.com", hashed_password=hashed, role="EMPLOYEE", full_name="Alice Filter", home_branch_id=branch.id)
    employee_b = User(email="leave_filter_b@gym.com", hashed_password=hashed, role="EMPLOYEE", full_name="Bob Filter", home_branch_id=branch.id)
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
    _, branch = await TenancyService.ensure_default_gym_and_branch(db_session)
    admin = User(email="admin_payroll_partial@gym.com", hashed_password=hashed, role="ADMIN", full_name="Payroll Partial Admin", home_branch_id=branch.id)
    employee = User(email="employee_payroll_partial@gym.com", hashed_password=hashed, role="EMPLOYEE", full_name="Payroll Partial Employee", home_branch_id=branch.id)
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

    approve_resp = await client.patch(
        f"{settings.API_V1_STR}/hr/payrolls/{payroll_id}/status",
        json={"status": "APPROVED"},
        headers=headers,
    )
    assert approve_resp.status_code == 200
    assert approve_resp.json()["data"]["status"] == "APPROVED"

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
    assert settle_payload["status"] == "PAID"
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
    _, branch = await TenancyService.ensure_default_gym_and_branch(db_session)
    admin = User(
        email="admin_sub_payment@gym.com",
        hashed_password=hashed,
        role="ADMIN",
        full_name="Subscription Admin",
        home_branch_id=branch.id,
    )
    member = User(
        email="member_sub_payment@gym.com",
        hashed_password=hashed,
        role="CUSTOMER",
        full_name="Subscription Member",
        home_branch_id=branch.id,
    )
    db_session.add_all([admin, member])
    await db_session.flush()
    await TenancyService.ensure_user_branch_access(db_session, user_id=admin.id, gym_id=admin.gym_id, branch_id=branch.id)
    await TenancyService.ensure_user_branch_access(db_session, user_id=member.id, gym_id=member.gym_id, branch_id=branch.id)
    await db_session.commit()

    login_resp = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": admin.email, "password": password},
    )
    headers = {"Authorization": f"Bearer {login_resp.json()['data']['access_token']}"}

    start_date = date.today()
    end_date = start_date + timedelta(days=30)
    sub_resp = await client.post(
        f"{settings.API_V1_STR}/hr/subscriptions",
        json={
            "user_id": str(member.id),
            "plan_name": "Monthly",
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "amount_paid": 75.0,
            "payment_method": "CASH",
        },
        headers=headers,
    )
    assert sub_resp.status_code == 200

    extend_resp = await client.post(
        f"{settings.API_V1_STR}/hr/subscriptions",
        json={
            "user_id": str(member.id),
            "plan_name": "Monthly",
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "extend_days": 15,
            "amount_paid": 25.0,
            "payment_method": "CASH",
        },
        headers=headers,
    )
    assert extend_resp.status_code == 200

    sub = (await db_session.execute(select(Subscription).where(Subscription.user_id == member.id))).scalar_one()
    assert sub.start_date.date() == start_date
    assert sub.end_date.date() == end_date + timedelta(days=15)

    tx_stmt = select(Transaction).where(
        Transaction.user_id == member.id,
        Transaction.type == TransactionType.INCOME,
        Transaction.category == TransactionCategory.SUBSCRIPTION,
    )
    tx_res = await db_session.execute(tx_stmt)
    txs = tx_res.scalars().all()
    assert len(txs) == 2
    assert sorted(float(tx.amount) for tx in txs) == [25.0, 75.0]


@pytest.mark.asyncio
async def test_pending_payroll_status_workflow_and_idempotency(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    _, branch = await TenancyService.ensure_default_gym_and_branch(db_session)
    admin = User(email="admin_payroll_flow@gym.com", hashed_password=hashed, role="ADMIN", full_name="Payroll Flow Admin", home_branch_id=branch.id)
    employee = User(email="payroll_flow_emp@gym.com", hashed_password=hashed, role="EMPLOYEE", full_name="Payroll Employee", home_branch_id=branch.id)
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

    approve_resp = await client.patch(
        f"{settings.API_V1_STR}/hr/payrolls/{payroll_id}/status",
        json={"status": "APPROVED"},
        headers=headers,
    )
    assert approve_resp.status_code == 200

    payment_resp = await client.post(
        f"{settings.API_V1_STR}/hr/payrolls/{payroll_id}/payments",
        json={"amount": 2000.0, "payment_method": "CASH"},
        headers=headers,
    )
    assert payment_resp.status_code == 200
    assert payment_resp.json()["data"]["status"] == "PAID"
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
async def test_rejected_payroll_requires_reopen_before_payment(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    _, branch = await TenancyService.ensure_default_gym_and_branch(db_session)
    admin = User(email="admin_payroll_reject@gym.com", hashed_password=hashed, role="ADMIN", full_name="Payroll Reject Admin", home_branch_id=branch.id)
    employee = User(email="employee_payroll_reject@gym.com", hashed_password=hashed, role="EMPLOYEE", full_name="Payroll Reject Employee", home_branch_id=branch.id)
    db_session.add_all([admin, employee])
    await db_session.flush()

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
            "base_salary": 1800.0,
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

    reject_resp = await client.patch(
        f"{settings.API_V1_STR}/hr/payrolls/{payroll_id}/status",
        json={"status": "REJECTED"},
        headers=headers,
    )
    assert reject_resp.status_code == 200
    assert reject_resp.json()["data"]["status"] == "REJECTED"

    payment_resp = await client.post(
        f"{settings.API_V1_STR}/hr/payrolls/{payroll_id}/payments",
        json={"amount": 100.0, "payment_method": "CASH"},
        headers=headers,
    )
    assert payment_resp.status_code == 400

    reopen_resp = await client.patch(
        f"{settings.API_V1_STR}/hr/payrolls/{payroll_id}/status",
        json={"status": "DRAFT"},
        headers=headers,
    )
    assert reopen_resp.status_code == 200
    assert reopen_resp.json()["data"]["status"] == "DRAFT"


@pytest.mark.asyncio
async def test_staff_summary_range_and_non_admin_forbidden(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    _, branch = await TenancyService.ensure_default_gym_and_branch(db_session)
    admin = User(email="admin_staff_summary@gym.com", hashed_password=hashed, role="ADMIN", full_name="Summary Admin", home_branch_id=branch.id)
    employee = User(email="staff_summary_emp@gym.com", hashed_password=hashed, role="EMPLOYEE", full_name="Summary Employee", home_branch_id=branch.id)
    other = User(email="staff_summary_other@gym.com", hashed_password=hashed, role="EMPLOYEE", full_name="Summary Other", home_branch_id=branch.id)
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
    _, branch = await TenancyService.ensure_default_gym_and_branch(db_session)
    admin = User(email="admin_paid_lock@gym.com", hashed_password=hashed, role="ADMIN", full_name="Paid Lock Admin", home_branch_id=branch.id)
    employee = User(email="employee_paid_lock@gym.com", hashed_password=hashed, role="EMPLOYEE", full_name="Paid Lock Employee", home_branch_id=branch.id)
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

    approve_resp = await client.patch(
        f"{settings.API_V1_STR}/hr/payrolls/{payroll_id}/status",
        json={"status": "APPROVED"},
        headers=headers,
    )
    assert approve_resp.status_code == 200

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
    _, branch = await TenancyService.ensure_default_gym_and_branch(db_session)
    admin = User(email="admin_contract_auto@gym.com", hashed_password=hashed, role="ADMIN", full_name="Contract Auto Admin", home_branch_id=branch.id)
    employee = User(email="employee_contract_auto@gym.com", hashed_password=hashed, role="EMPLOYEE", full_name="Contract Auto Employee", home_branch_id=branch.id)
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
    _, branch = await TenancyService.ensure_default_gym_and_branch(db_session)
    admin = User(email="admin_payroll_auto_endpoints@gym.com", hashed_password=hashed, role="ADMIN", full_name="Auto Endpoint Admin", home_branch_id=branch.id)
    employee = User(email="employee_payroll_auto_endpoints@gym.com", hashed_password=hashed, role="EMPLOYEE", full_name="Auto Endpoint Employee", home_branch_id=branch.id)
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


@pytest.mark.asyncio
async def test_staff_debt_ledger_records_entries_and_monthly_balances(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    _, branch = await TenancyService.ensure_default_gym_and_branch(db_session)
    admin = User(email="admin_staff_debt@gym.com", hashed_password=hashed, role="ADMIN", full_name="Debt Admin", home_branch_id=branch.id)
    employee = User(email="employee_staff_debt@gym.com", hashed_password=hashed, role="EMPLOYEE", full_name="Debt Employee", home_branch_id=branch.id)
    db_session.add_all([admin, employee])
    await db_session.flush()
    await db_session.commit()

    login_resp = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": admin.email, "password": password},
    )
    assert login_resp.status_code == 200
    headers = {"Authorization": f"Bearer {login_resp.json()['data']['access_token']}"}

    now = datetime.now(timezone.utc)
    advance_resp = await client.post(
        f"{settings.API_V1_STR}/hr/staff-debt/staff/{employee.id}/entries",
        json={
            "entry_type": "ADVANCE",
            "amount": 250.0,
            "month": now.month,
            "year": now.year,
            "notes": "Opening advance",
            "branch_id": str(branch.id),
        },
        headers=headers,
    )
    assert advance_resp.status_code == 200
    advance_data = advance_resp.json()["data"]
    assert advance_data["account"]["current_balance"] == 250.0
    assert len(advance_data["entries"]) == 1
    assert len(advance_data["monthly_balances"]) == 1
    assert advance_data["monthly_balances"][0]["closing_balance"] == 250.0

    repayment_resp = await client.post(
        f"{settings.API_V1_STR}/hr/staff-debt/staff/{employee.id}/entries",
        json={
            "entry_type": "REPAYMENT",
            "amount": 75.0,
            "month": now.month,
            "year": now.year,
            "notes": "Partial repayment",
            "branch_id": str(branch.id),
        },
        headers=headers,
    )
    assert repayment_resp.status_code == 200
    repayment_data = repayment_resp.json()["data"]
    assert repayment_data["account"]["current_balance"] == 175.0
    assert len(repayment_data["entries"]) == 2
    assert repayment_data["monthly_balances"][0]["entry_count"] == 2
    assert repayment_data["monthly_balances"][0]["repayments_total"] == 75.0

    list_resp = await client.get(
        f"{settings.API_V1_STR}/hr/staff-debt",
        params={"branch_id": str(branch.id)},
        headers=headers,
    )
    assert list_resp.status_code == 200
    list_data = list_resp.json()["data"]
    assert list_data["summary"]["staff_count"] >= 1
    assert any(item["user_id"] == str(employee.id) and item["current_balance"] == 175.0 for item in list_data["items"])

    account_stmt = select(StaffDebtAccount).where(StaffDebtAccount.user_id == employee.id)
    account_result = await db_session.execute(account_stmt)
    account = account_result.scalar_one()
    assert float(account.current_balance) == 175.0

    monthly_stmt = select(StaffDebtMonthlyBalance).where(
        StaffDebtMonthlyBalance.account_id == account.id,
        StaffDebtMonthlyBalance.month == now.month,
        StaffDebtMonthlyBalance.year == now.year,
    )
    monthly_result = await db_session.execute(monthly_stmt)
    monthly = monthly_result.scalar_one()
    assert float(monthly.closing_balance) == 175.0
    assert monthly.entry_count == 2
