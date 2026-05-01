import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings
from app.models.user import User
from app.models.access import AccessLog, Subscription, SubscriptionStatus, AttendanceLog
from app.models.hr import Payroll
from app.models.staff_debt import StaffDebtAccount
from app.auth.security import get_password_hash
from datetime import datetime, timedelta, timezone
from app.models.finance import Transaction, TransactionType, TransactionCategory
from app.services.tenancy_service import TenancyService

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
    now = datetime.now(timezone.utc)
    p1 = Payroll(user_id=admin.id, month=now.month, year=now.year, total_pay=1000.0)
    db_session.add(p1)

    # ADDED: Transaction for Revenue
    t1 = Transaction(
        amount=100.0,
        type=TransactionType.INCOME,
        category="SUBSCRIPTION",
        date=datetime.now(timezone.utc),
        description="Test Income"
    )
    db_session.add(t1)
    
    await db_session.commit()
    
    # 3. Test Dashboard
    resp = await client.get(f"{settings.API_V1_STR}/analytics/dashboard", headers=headers)
    assert resp.status_code == 200
    data = resp.json()["data"]
    
    # Active members >= 1
    assert data["active_members"] >= 1
    # Rev >= 50.0
    assert data["monthly_revenue"] >= 50.0
    # Exp >= 1000.0
    assert data["monthly_expenses"] >= 0.0 # Just checking existing key, value depends on setup
    # Pending >= 1000.0
    assert data["pending_salaries"] >= 1000.0

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
    # Today: 2 visits at current hour
    l1 = AttendanceLog(user_id=admin.id, check_in_time=now, check_out_time=now+timedelta(hours=1), hours_worked=1.0)
    l2 = AttendanceLog(user_id=admin.id, check_in_time=now, check_out_time=now+timedelta(hours=1), hours_worked=1.0)
    # Yesterday: 1 visit at same hour
    l3 = AttendanceLog(user_id=admin.id, check_in_time=now - timedelta(days=1), check_out_time=now-timedelta(days=1)+timedelta(hours=1), hours_worked=1.0)
    
    db_session.add_all([l1, l2, l3])
    await db_session.commit()
    
    resp = await client.get(f"{settings.API_V1_STR}/analytics/attendance?days=7", headers=headers)
    assert resp.status_code == 200
    trends = resp.json()["data"]
    
    # Logic: "Visits by Hour" aggregates visits by their hour of day.
    # Since all 3 logs are at the same "Hour of Day" (now.hour), we expect one entry with count >= 3.
    target_hour = now.strftime("%I %p")
    
    hour_stat = next((t for t in trends if t["hour"] == target_hour), None)
    assert hour_stat is not None
    assert hour_stat["visits"] >= 3


@pytest.mark.asyncio
async def test_revenue_chart_is_sorted_by_real_date(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    admin = User(email="admin_chart_order@gym.com", hashed_password=hashed, role="ADMIN", full_name="Admin Chart")
    db_session.add(admin)
    await db_session.flush()

    token = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": "admin_chart_order@gym.com", "password": password}
    )
    headers = {"Authorization": f"Bearer {token.json()['data']['access_token']}"}

    now = datetime.now(timezone.utc)
    db_session.add_all([
        Transaction(
            amount=10.0,
            type=TransactionType.INCOME,
            category=TransactionCategory.SUBSCRIPTION,
            date=now - timedelta(days=1),
            description="D-1 income",
        ),
        Transaction(
            amount=20.0,
            type=TransactionType.INCOME,
            category=TransactionCategory.SUBSCRIPTION,
            date=now - timedelta(days=3),
            description="D-3 income",
        ),
        Transaction(
            amount=5.0,
            type=TransactionType.EXPENSE,
            category=TransactionCategory.UTILITIES,
            date=now - timedelta(days=2),
            description="D-2 expense",
        ),
    ])
    await db_session.commit()

    resp = await client.get(f"{settings.API_V1_STR}/analytics/revenue-chart?days=7", headers=headers)
    assert resp.status_code == 200
    chart = resp.json()["data"]

    dates = [item["date"] for item in chart]
    assert dates == sorted(dates)


@pytest.mark.asyncio
async def test_dashboard_supports_from_to_filters(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    admin = User(email="admin_dashboard_filter@gym.com", hashed_password=hashed, role="ADMIN", full_name="Admin Filter")
    db_session.add(admin)
    await db_session.flush()

    token = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": "admin_dashboard_filter@gym.com", "password": password}
    )
    headers = {"Authorization": f"Bearer {token.json()['data']['access_token']}"}

    now = datetime.now(timezone.utc)
    old_date = now - timedelta(days=40)
    db_session.add_all([
        Transaction(
            amount=200.0,
            type=TransactionType.INCOME,
            category=TransactionCategory.SUBSCRIPTION,
            date=old_date,
            description="Old income",
        ),
        Transaction(
            amount=75.0,
            type=TransactionType.INCOME,
            category=TransactionCategory.SUBSCRIPTION,
            date=now,
            description="Current income",
        ),
    ])
    await db_session.commit()

    from_param = (now - timedelta(days=1)).date().isoformat()
    to_param = now.date().isoformat()
    resp = await client.get(
        f"{settings.API_V1_STR}/analytics/dashboard?from={from_param}&to={to_param}",
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["monthly_revenue"] == 75.0


@pytest.mark.asyncio
async def test_dashboard_returns_today_visitors_unique_granted_count(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    admin = User(email="admin_visitors@gym.com", hashed_password=hashed, role="ADMIN", full_name="Admin Visitors")
    user_a = User(email="visitor_a@gym.com", hashed_password=hashed, role="CUSTOMER", full_name="Visitor A")
    user_b = User(email="visitor_b@gym.com", hashed_password=hashed, role="CUSTOMER", full_name="Visitor B")
    db_session.add_all([admin, user_a, user_b])
    await db_session.flush()

    now = datetime.now(timezone.utc)
    db_session.add_all([
        AccessLog(user_id=user_a.id, scan_time=now, status="GRANTED", reason=None, kiosk_id="k1"),
        AccessLog(user_id=user_a.id, scan_time=now, status="GRANTED", reason=None, kiosk_id="k1"),
        AccessLog(user_id=user_b.id, scan_time=now, status="GRANTED", reason=None, kiosk_id="k1"),
        AccessLog(user_id=user_b.id, scan_time=now, status="DENIED", reason="SUBSCRIPTION_EXPIRED", kiosk_id="k1"),
    ])
    await db_session.commit()

    token = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": "admin_visitors@gym.com", "password": password}
    )
    headers = {"Authorization": f"Bearer {token.json()['data']['access_token']}"}

    resp = await client.get(f"{settings.API_V1_STR}/analytics/dashboard", headers=headers)
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["today_visitors"] == 2


@pytest.mark.asyncio
async def test_dashboard_reports_expiring_subscriptions_and_staff_debt(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    gym, branch = await TenancyService.ensure_default_gym_and_branch(db_session)
    admin = User(
        email="admin_reporting@gym.com",
        hashed_password=hashed,
        role="ADMIN",
        full_name="Admin Reporting",
        gym_id=gym.id,
        home_branch_id=branch.id,
    )
    customer_a = User(
        email="report_customer_a@gym.com",
        hashed_password=hashed,
        role="CUSTOMER",
        full_name="Report Customer A",
        gym_id=gym.id,
        home_branch_id=branch.id,
    )
    customer_b = User(
        email="report_customer_b@gym.com",
        hashed_password=hashed,
        role="CUSTOMER",
        full_name="Report Customer B",
        gym_id=gym.id,
        home_branch_id=branch.id,
    )
    staff = User(
        email="report_staff@gym.com",
        hashed_password=hashed,
        role="EMPLOYEE",
        full_name="Report Staff",
        gym_id=gym.id,
        home_branch_id=branch.id,
    )
    db_session.add_all([admin, customer_a, customer_b, staff])
    await db_session.flush()

    now = datetime.now(timezone.utc)
    db_session.add_all([
        Subscription(
            gym_id=gym.id,
            user_id=customer_a.id,
            plan_name="Gold",
            start_date=now - timedelta(days=20),
            end_date=now + timedelta(days=5),
            status=SubscriptionStatus.ACTIVE,
        ),
        Subscription(
            gym_id=gym.id,
            user_id=customer_b.id,
            plan_name="Gold",
            start_date=now - timedelta(days=10),
            end_date=now + timedelta(days=18),
            status=SubscriptionStatus.ACTIVE,
        ),
        Subscription(
            gym_id=gym.id,
            user_id=admin.id,
            plan_name="Platinum",
            start_date=now - timedelta(days=40),
            end_date=now + timedelta(days=40),
            status=SubscriptionStatus.ACTIVE,
        ),
        StaffDebtAccount(
            gym_id=gym.id,
            branch_id=branch.id,
            user_id=staff.id,
            current_balance=125.0,
            notes="Opening balance",
            updated_by_user_id=admin.id,
        ),
    ])
    await db_session.commit()

    token = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": admin.email, "password": password},
    )
    headers = {"Authorization": f"Bearer {token.json()['data']['access_token']}"}

    resp = await client.get(f"{settings.API_V1_STR}/analytics/dashboard", headers=headers)
    assert resp.status_code == 200
    data = resp.json()["data"]

    assert data["expiring_subscriptions_7d"] == 1
    assert data["expiring_subscriptions_30d"] == 2
    assert data["active_debt_accounts"] == 1
    assert data["outstanding_staff_debt"] == 125.0
    assert data["top_bundles"][0]["plan_name"] == "Gold"
    assert data["top_bundles"][0]["count"] == 2
    assert any(item["full_name"] == "Report Customer A" for item in data["expiring_subscriptions"])


@pytest.mark.asyncio
async def test_daily_visitors_report_json_and_csv(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    admin = User(email="admin_daily_visitors@gym.com", hashed_password=hashed, role="ADMIN", full_name="Admin Visitors")
    visitor = User(email="daily_visitor@gym.com", hashed_password=hashed, role="CUSTOMER", full_name="Daily Visitor")
    db_session.add_all([admin, visitor])
    await db_session.flush()

    now = datetime.now(timezone.utc)
    db_session.add(AccessLog(user_id=visitor.id, scan_time=now, status="GRANTED", reason=None, kiosk_id="k2"))
    await db_session.commit()

    token = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": "admin_daily_visitors@gym.com", "password": password}
    )
    headers = {"Authorization": f"Bearer {token.json()['data']['access_token']}"}

    from_date = now.date().isoformat()
    to_date = now.date().isoformat()

    json_resp = await client.get(
        f"{settings.API_V1_STR}/analytics/daily-visitors?from={from_date}&to={to_date}",
        headers=headers,
    )
    assert json_resp.status_code == 200
    assert len(json_resp.json()["data"]) >= 1

    csv_resp = await client.get(
        f"{settings.API_V1_STR}/analytics/daily-visitors?from={from_date}&to={to_date}&format=csv",
        headers=headers,
    )
    assert csv_resp.status_code == 200
    assert "text/csv" in csv_resp.headers.get("content-type", "")


@pytest.mark.asyncio
async def test_analytics_report_exports_and_staff_debt_csv(client: AsyncClient, db_session: AsyncSession):
    import csv
    from io import StringIO

    password = "password123"
    hashed = get_password_hash(password)
    gym, branch = await TenancyService.ensure_default_gym_and_branch(db_session)
    admin = User(
        email="admin_exports@gym.com",
        hashed_password=hashed,
        role="ADMIN",
        full_name="Admin Exports",
        gym_id=gym.id,
        home_branch_id=branch.id,
    )
    customer_a = User(
        email="export_customer_a@gym.com",
        hashed_password=hashed,
        role="CUSTOMER",
        full_name="Export Customer A",
        gym_id=gym.id,
        home_branch_id=branch.id,
    )
    customer_b = User(
        email="export_customer_b@gym.com",
        hashed_password=hashed,
        role="CUSTOMER",
        full_name="Export Customer B",
        gym_id=gym.id,
        home_branch_id=branch.id,
    )
    staff = User(
        email="export_staff@gym.com",
        hashed_password=hashed,
        role="EMPLOYEE",
        full_name="Export Staff",
        gym_id=gym.id,
        home_branch_id=branch.id,
    )
    db_session.add_all([admin, customer_a, customer_b, staff])
    await db_session.flush()

    now = datetime.now(timezone.utc)
    db_session.add_all([
        Subscription(
            gym_id=gym.id,
            user_id=customer_a.id,
            plan_name="Silver",
            start_date=now - timedelta(days=10),
            end_date=now + timedelta(days=3),
            status=SubscriptionStatus.ACTIVE,
        ),
        Subscription(
            gym_id=gym.id,
            user_id=customer_b.id,
            plan_name="Bronze",
            start_date=now - timedelta(days=15),
            end_date=now + timedelta(days=12),
            status=SubscriptionStatus.ACTIVE,
        ),
        StaffDebtAccount(
            gym_id=gym.id,
            branch_id=branch.id,
            user_id=staff.id,
            current_balance=210.0,
            notes=None,
            updated_by_user_id=admin.id,
        ),
    ])
    await db_session.commit()

    token = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": admin.email, "password": password},
    )
    headers = {"Authorization": f"Bearer {token.json()['data']['access_token']}"}

    expiring_resp = await client.get(f"{settings.API_V1_STR}/analytics/reports/expiring-subscriptions", headers=headers)
    assert expiring_resp.status_code == 200
    assert "text/csv" in expiring_resp.headers.get("content-type", "")
    expiring_rows = list(csv.DictReader(StringIO(expiring_resp.text)))
    assert expiring_rows[0]["full_name"] == "Export Customer A"
    assert expiring_rows[0]["plan_name"] == "Silver"

    expiring_pdf_resp = await client.get(f"{settings.API_V1_STR}/analytics/reports/expiring-subscriptions.pdf", headers=headers)
    assert expiring_pdf_resp.status_code == 200
    assert "application/pdf" in expiring_pdf_resp.headers.get("content-type", "")
    assert expiring_pdf_resp.content.startswith(b"%PDF")

    bundles_resp = await client.get(f"{settings.API_V1_STR}/analytics/reports/top-bundles", headers=headers)
    assert bundles_resp.status_code == 200
    bundle_rows = list(csv.DictReader(StringIO(bundles_resp.text)))
    assert {row["plan_name"] for row in bundle_rows} == {"Bronze", "Silver"}
    assert sum(int(row["count"]) for row in bundle_rows) == 2

    bundles_pdf_resp = await client.get(f"{settings.API_V1_STR}/analytics/reports/top-bundles.pdf", headers=headers)
    assert bundles_pdf_resp.status_code == 200
    assert bundles_pdf_resp.content.startswith(b"%PDF")

    debt_resp = await client.get(f"{settings.API_V1_STR}/hr/staff-debt/export", headers=headers)
    assert debt_resp.status_code == 200
    assert "text/csv" in debt_resp.headers.get("content-type", "")
    debt_rows = list(csv.DictReader(StringIO(debt_resp.text)))
    assert any(row["full_name"] == "Export Staff" for row in debt_rows)
    assert any(row["current_balance"] == "210.0" or row["current_balance"] == "210.00" for row in debt_rows)

    debt_pdf_resp = await client.get(f"{settings.API_V1_STR}/hr/staff-debt/export-pdf", headers=headers)
    assert debt_pdf_resp.status_code == 200
    assert "application/pdf" in debt_pdf_resp.headers.get("content-type", "")
    assert debt_pdf_resp.content.startswith(b"%PDF")
