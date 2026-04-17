from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from httpx import AsyncClient
from app.models.enums import Role


async def _auth_headers_for_role(client: AsyncClient, db_session, role: Role, email: str) -> dict[str, str]:
    from app.auth.security import get_password_hash
    from app.models.user import User

    user = User(
        email=email,
        hashed_password=get_password_hash("password"),
        full_name=f"{role.value.title()} User",
        role=role,
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()

    response = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "password"},
    )
    assert response.status_code == 200
    token = response.json()["data"]["access_token"]
    return {"Authorization": f"Bearer {token}"}


async def _seed_mobile_admin_summary_data(db_session):
    from app.auth.security import get_password_hash
    from app.models.access import AccessLog
    from app.models.audit import AuditLog
    from app.models.finance import PaymentMethod, Transaction, TransactionCategory, TransactionType
    from app.models.hr import LeaveRequest, LeaveStatus, LeaveType
    from app.models.inventory import Product, ProductCategory
    from app.models.support import SupportTicket, TicketCategory, TicketStatus
    from app.models.user import User

    customer = User(
        email="phase4-summary-customer@test.com",
        hashed_password=get_password_hash("password"),
        full_name="Phase 4 Summary Customer",
        role=Role.CUSTOMER,
        is_active=True,
    )
    staff = User(
        email="phase4-summary-staff@test.com",
        hashed_password=get_password_hash("password"),
        full_name="Phase 4 Summary Staff",
        role=Role.RECEPTION,
        is_active=True,
    )
    db_session.add_all([customer, staff])
    await db_session.flush()

    now = datetime.now(timezone.utc)
    db_session.add_all(
        [
            SupportTicket(
                customer_id=customer.id,
                subject="Phase 4 support ticket",
                category=TicketCategory.GENERAL,
                status=TicketStatus.OPEN,
                created_at=now,
                updated_at=now,
            ),
            AuditLog(
                user_id=staff.id,
                action="PHASE4_TEST_ACTION",
                target_id=str(customer.id),
                timestamp=now,
                details="Phase 4 seeded audit event",
            ),
            Product(
                name="Phase 4 Low Stock",
                sku="PHASE4-LOW",
                category=ProductCategory.SNACK,
                price=3.5,
                cost_price=1.0,
                stock_quantity=1,
                low_stock_threshold=5,
                is_active=True,
            ),
            Transaction(
                amount=Decimal("120.00"),
                type=TransactionType.INCOME,
                category=TransactionCategory.POS_SALE,
                description="Phase 4 income",
                date=now,
                payment_method=PaymentMethod.CASH,
                user_id=customer.id,
            ),
            Transaction(
                amount=Decimal("45.00"),
                type=TransactionType.EXPENSE,
                category=TransactionCategory.UTILITIES,
                description="Phase 4 expense",
                date=now,
                payment_method=PaymentMethod.TRANSFER,
            ),
            AccessLog(
                user_id=customer.id,
                scan_time=now,
                kiosk_id="phase4-kiosk",
                status="GRANTED",
                reason=None,
            ),
            LeaveRequest(
                user_id=staff.id,
                start_date=(now + timedelta(days=1)).date(),
                end_date=(now + timedelta(days=2)).date(),
                leave_type=LeaveType.VACATION,
                status=LeaveStatus.PENDING,
                reason="Phase 4 leave",
            ),
        ]
    )
    await db_session.commit()

@pytest.mark.asyncio
async def test_create_diet_plan(client: AsyncClient, admin_token_headers):
    # 1. Create a diet plan
    response = await client.post(
        "/api/v1/fitness/diets",
        headers=admin_token_headers,
        json={
            "name": "Keto Blast",
            "description": "High fat, low carb",
            "content": "Eat bacon.",
            "member_id": None 
        },
    )
    assert response.status_code == 200
    data = response.json()
    # Create returns only ID
    assert "id" in data["data"]
    plan_id = data["data"]["id"]

    # 2. Get the diet plan
    response = await client.get(
        f"/api/v1/fitness/diets/{plan_id}",
        headers=admin_token_headers,
    )
    assert response.status_code == 200
    assert response.json()["data"]["content"] == "Eat bacon."

@pytest.mark.asyncio
async def test_hr_members_list(client: AsyncClient, admin_token_headers, db_session):
    # Seed a customer
    from app.models.user import User
    from app.auth.security import get_password_hash
    
    customer = User(
        email="bob@client.com",
        hashed_password=get_password_hash("password"),
        full_name="Bob Customer",
        role=Role.CUSTOMER,
        is_active=True
    )
    db_session.add(customer)
    await db_session.commit()

    # Should return list containing seeded customers
    response = await client.get(
        "/api/v1/hr/members",
        headers=admin_token_headers,
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert len(data) > 0
    # Bob should be there
    assert any(m["email"] == "bob@client.com" for m in data)

@pytest.mark.asyncio
async def test_workout_feedback_flow(client: AsyncClient, admin_token_headers):
    # 1. Create a workout plan
    plan_res = await client.post(
        "/api/v1/fitness/plans",
        headers=admin_token_headers,
        json={
            "name": "Test Plan",
            "description": "For feedback test",
            "exercises": []
        }
    )
    assert plan_res.status_code == 200
    plan_id = plan_res.json()["data"]["id"]

    # 2. Log feedback (as admin acting as member, for simplicity in this test scope)
    # The endpoint relies on current_user, so this log will be attributed to Admin.
    feedback_res = await client.post(
        "/api/v1/fitness/log",
        headers=admin_token_headers,
        json={
            "plan_id": plan_id,
            "completed": True,
            "difficulty_rating": 5,
            "comment": "Admin found this easy."
        }
    )
    assert feedback_res.status_code == 200
    
    # 3. Verify the feedback is listed
    logs_res = await client.get(
        f"/api/v1/fitness/logs/{plan_id}",
        headers=admin_token_headers
    )
    assert logs_res.status_code == 200
    logs = logs_res.json()["data"]
    assert len(logs) > 0
    assert logs[0]["difficulty_rating"] == 5


@pytest.mark.asyncio
async def test_mobile_admin_summary_endpoints_allow_admin_and_manager(client: AsyncClient, db_session):
    manager_allowed_endpoints = [
        "/api/v1/mobile/admin/home",
        "/api/v1/mobile/admin/people/summary",
        "/api/v1/mobile/admin/operations/summary",
        "/api/v1/mobile/admin/finance/summary",
        "/api/v1/mobile/admin/inventory/summary",
    ]
    admin_allowed_endpoints = [*manager_allowed_endpoints, "/api/v1/mobile/admin/audit/summary"]
    admin_headers = await _auth_headers_for_role(client, db_session, Role.ADMIN, "phase4-admin@test.com")
    manager_headers = await _auth_headers_for_role(client, db_session, Role.MANAGER, "phase4-manager@test.com")

    for endpoint in admin_allowed_endpoints:
        response = await client.get(endpoint, headers=admin_headers)
        assert response.status_code == 200, endpoint
        body = response.json()
        assert body["success"] is True
        assert body["data"] is not None

    for endpoint in manager_allowed_endpoints:
        response = await client.get(endpoint, headers=manager_headers)
        assert response.status_code == 200, endpoint
        body = response.json()
        assert body["success"] is True
        assert body["data"] is not None

    response = await client.get("/api/v1/mobile/admin/audit/summary", headers=manager_headers)
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_mobile_admin_summaries_include_seeded_counts(client: AsyncClient, db_session):
    await _seed_mobile_admin_summary_data(db_session)
    admin_headers = await _auth_headers_for_role(client, db_session, Role.ADMIN, "phase4-counts-admin@test.com")

    operations = (await client.get("/api/v1/mobile/admin/operations/summary", headers=admin_headers)).json()["data"]
    assert operations["support"]["open_tickets"] >= 1
    assert operations["approvals"]["pending_leaves"] >= 1
    assert operations["attendance"]["checkins_today"] >= 1

    inventory = (await client.get("/api/v1/mobile/admin/inventory/summary", headers=admin_headers)).json()["data"]
    assert inventory["low_stock_count"] >= 1
    assert any(item["sku"] == "PHASE4-LOW" for item in inventory["low_stock_products"])

    audit = (await client.get("/api/v1/mobile/admin/audit/summary", headers=admin_headers)).json()["data"]
    assert audit["total_events"] >= 1
    assert any(event["action"] == "PHASE4_TEST_ACTION" for event in audit["recent_events"])

    finance = (await client.get("/api/v1/mobile/admin/finance/summary", headers=admin_headers)).json()["data"]
    assert finance["today"]["revenue"] >= 120
    assert finance["today"]["expenses"] >= 45


@pytest.mark.asyncio
async def test_mobile_admin_summary_endpoints_reject_non_admin_control_roles(client: AsyncClient, db_session):
    endpoints = [
        "/api/v1/mobile/admin/home",
        "/api/v1/mobile/admin/people/summary",
        "/api/v1/mobile/admin/operations/summary",
        "/api/v1/mobile/admin/finance/summary",
        "/api/v1/mobile/admin/audit/summary",
        "/api/v1/mobile/admin/inventory/summary",
    ]
    customer_headers = await _auth_headers_for_role(client, db_session, Role.CUSTOMER, "phase4-customer@test.com")

    for endpoint in endpoints:
        response = await client.get(endpoint, headers=customer_headers)
        assert response.status_code == 403, endpoint
