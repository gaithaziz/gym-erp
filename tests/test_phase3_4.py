from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.auth.security import get_password_hash
from app.database import set_rls_context
from app.models.access import RenewalRequestStatus, Subscription, SubscriptionRenewalRequest
from app.models.audit import AuditLog
from app.models.enums import Role
from app.models.finance import Transaction, TransactionCategory, TransactionType
from app.models.hr import LeaveRequest, LeaveStatus, LeaveType
from app.models.inventory import Product
from app.models.support import SupportTicket, TicketCategory, TicketStatus
from app.models.user import User


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


@pytest.mark.asyncio
async def test_mobile_admin_approvals_workflow_allows_admin_and_manager(client: AsyncClient, db_session):
    hashed = get_password_hash("password")
    admin = User(email="phase4-approval-admin@test.com", hashed_password=hashed, full_name="Approval Admin", role=Role.ADMIN, is_active=True)
    manager = User(email="phase4-approval-manager@test.com", hashed_password=hashed, full_name="Approval Manager", role=Role.MANAGER, is_active=True)
    cashier = User(email="phase4-approval-cashier@test.com", hashed_password=hashed, full_name="Approval Cashier", role=Role.CASHIER, is_active=True)
    member = User(email="phase4-approval-member@test.com", hashed_password=hashed, full_name="Approval Member", role=Role.CUSTOMER, is_active=True)
    staff = User(email="phase4-approval-staff@test.com", hashed_password=hashed, full_name="Approval Staff", role=Role.EMPLOYEE, is_active=True)
    db_session.add_all([admin, manager, cashier, member, staff])
    await db_session.flush()

    renewal = SubscriptionRenewalRequest(
        user_id=member.id,
        offer_code="mobile-monthly",
        plan_name="Mobile Monthly",
        duration_days=30,
        customer_note="Paid at front desk",
        status=RenewalRequestStatus.PENDING,
    )
    rejected_renewal = SubscriptionRenewalRequest(
        user_id=member.id,
        offer_code="mobile-quarterly",
        plan_name="Mobile Quarterly",
        duration_days=90,
        status=RenewalRequestStatus.PENDING,
    )
    leave = LeaveRequest(
        user_id=staff.id,
        start_date=(datetime.now(timezone.utc) + timedelta(days=3)).date(),
        end_date=(datetime.now(timezone.utc) + timedelta(days=4)).date(),
        leave_type=LeaveType.SICK,
        status=LeaveStatus.PENDING,
        reason="Mobile approval test",
    )
    db_session.add_all([renewal, rejected_renewal, leave])
    await db_session.commit()

    admin_headers = await _login(client, admin.email)
    manager_headers = await _login(client, manager.email)
    cashier_headers = await _login(client, cashier.email)

    admin_list = await client.get("/api/v1/mobile/admin/approvals", headers=admin_headers)
    assert admin_list.status_code == 200
    assert any(item["id"] == str(renewal.id) for item in admin_list.json()["data"]["renewals"])
    assert any(item["id"] == str(leave.id) for item in admin_list.json()["data"]["leaves"])

    manager_list = await client.get("/api/v1/mobile/admin/approvals", headers=manager_headers)
    assert manager_list.status_code == 200

    forbidden = await client.get("/api/v1/mobile/admin/approvals", headers=cashier_headers)
    assert forbidden.status_code == 403

    approve = await client.post(
        f"/api/v1/mobile/admin/approvals/renewals/{renewal.id}/approve",
        headers=manager_headers,
        json={"amount_paid": 88.5, "payment_method": "CASH", "reviewer_note": "Confirmed at desk"},
    )
    assert approve.status_code == 200
    approve_data = approve.json()["data"]
    assert approve_data["status"] == "APPROVED"
    assert approve_data["subscription_id"] is not None
    assert approve_data["transaction_id"] is not None

    await db_session.refresh(renewal)
    assert renewal.status == RenewalRequestStatus.APPROVED
    assert renewal.reviewed_by_user_id == manager.id
    assert renewal.reviewer_note == "Confirmed at desk"

    subscription = (await db_session.execute(select(Subscription).where(Subscription.user_id == member.id))).scalar_one_or_none()
    assert subscription is not None
    assert subscription.plan_name == "Mobile Monthly"

    transaction = (await db_session.execute(select(Transaction).where(Transaction.user_id == member.id))).scalar_one_or_none()
    assert transaction is not None
    assert float(transaction.amount) == 88.5
    assert transaction.type == TransactionType.INCOME
    assert transaction.category == TransactionCategory.SUBSCRIPTION

    await set_rls_context(db_session, role=Role.ADMIN.value)
    approve_audit = (
        await db_session.execute(select(AuditLog).where(AuditLog.action == "MOBILE_RENEWAL_APPROVED", AuditLog.target_id == str(renewal.id)))
    ).scalar_one_or_none()
    assert approve_audit is not None

    reject = await client.post(
        f"/api/v1/mobile/admin/approvals/renewals/{rejected_renewal.id}/reject",
        headers=admin_headers,
        json={"reviewer_note": "Payment not found"},
    )
    assert reject.status_code == 200
    await db_session.refresh(rejected_renewal)
    assert rejected_renewal.status == RenewalRequestStatus.REJECTED
    assert rejected_renewal.reviewed_by_user_id == admin.id

    reject_transaction = (
        await db_session.execute(
            select(Transaction).where(
                Transaction.user_id == member.id,
                Transaction.description.ilike("%Mobile Quarterly%"),
            )
        )
    ).scalar_one_or_none()
    assert reject_transaction is None

    leave_update = await client.put(
        f"/api/v1/mobile/admin/approvals/leaves/{leave.id}",
        headers=manager_headers,
        json={"status": "APPROVED"},
    )
    assert leave_update.status_code == 200
    await db_session.refresh(leave)
    assert leave.status == LeaveStatus.APPROVED


@pytest.mark.asyncio
@pytest.mark.parametrize("role", [Role.CUSTOMER, Role.COACH, Role.CASHIER, Role.EMPLOYEE])
async def test_mobile_admin_approval_mutations_reject_non_admin_control_roles(client: AsyncClient, db_session, role: Role):
    headers = await _auth_headers_for_role(client, db_session, role, f"phase4-approval-denied-{role.value.lower()}@test.com")
    request_id = "11111111-1111-4111-8111-111111111111"
    leave_id = "22222222-2222-4222-8222-222222222222"

    checks = [
        await client.get("/api/v1/mobile/admin/approvals", headers=headers),
        await client.post(
            f"/api/v1/mobile/admin/approvals/renewals/{request_id}/approve",
            headers=headers,
            json={"amount_paid": 20.0, "payment_method": "CASH"},
        ),
        await client.post(
            f"/api/v1/mobile/admin/approvals/renewals/{request_id}/reject",
            headers=headers,
            json={"reviewer_note": "No"},
        ),
        await client.put(
            f"/api/v1/mobile/admin/approvals/leaves/{leave_id}",
            headers=headers,
            json={"status": "APPROVED"},
        ),
    ]

    assert all(response.status_code == 403 for response in checks)


@pytest.mark.asyncio
async def test_mobile_admin_inventory_product_management(client: AsyncClient, db_session):
    hashed = get_password_hash("password")
    manager = User(email="phase4-inventory-manager@test.com", hashed_password=hashed, full_name="Inventory Manager", role=Role.MANAGER, is_active=True)
    employee = User(email="phase4-inventory-employee@test.com", hashed_password=hashed, full_name="Inventory Employee", role=Role.EMPLOYEE, is_active=True)
    db_session.add_all([manager, employee])
    await db_session.commit()

    manager_headers = await _login(client, manager.email)
    employee_headers = await _login(client, employee.email)

    denied_create = await client.post(
        "/api/v1/mobile/admin/inventory/products",
        headers=employee_headers,
        json={"name": "Denied Product", "sku": "MOB-DENIED", "category": "OTHER", "price": 1.0},
    )
    assert denied_create.status_code == 403

    create = await client.post(
        "/api/v1/mobile/admin/inventory/products",
        headers=manager_headers,
        json={
            "name": "Mobile Whey",
            "sku": "MOB-WHEY",
            "category": "SUPPLEMENT",
            "price": 45.0,
            "cost_price": 25.0,
            "stock_quantity": 2,
            "low_stock_threshold": 5,
            "low_stock_restock_target": 12,
            "image_url": "https://example.com/whey.png",
        },
    )
    assert create.status_code == 200
    product_id = create.json()["data"]["id"]

    list_response = await client.get("/api/v1/mobile/admin/inventory/products?search=whey&category=SUPPLEMENT&status_filter=active", headers=manager_headers)
    assert list_response.status_code == 200
    assert [item["id"] for item in list_response.json()["data"]["items"]] == [product_id]

    detail = await client.get(f"/api/v1/mobile/admin/inventory/products/{product_id}", headers=manager_headers)
    assert detail.status_code == 200
    assert detail.json()["data"]["sku"] == "MOB-WHEY"

    update = await client.put(
        f"/api/v1/mobile/admin/inventory/products/{product_id}",
        headers=manager_headers,
        json={"name": "Mobile Whey Plus", "stock_quantity": 6, "low_stock_threshold": 3, "is_active": True},
    )
    assert update.status_code == 200
    assert update.json()["data"]["stock_quantity"] == 6

    summary_after_stock_fix = await client.get("/api/v1/mobile/admin/inventory/summary", headers=manager_headers)
    assert summary_after_stock_fix.status_code == 200
    assert all(item["id"] != product_id for item in summary_after_stock_fix.json()["data"]["low_stock_products"])

    threshold_update = await client.put(
        f"/api/v1/mobile/admin/inventory/products/{product_id}",
        headers=manager_headers,
        json={"low_stock_threshold": 10},
    )
    assert threshold_update.status_code == 200

    summary_after_threshold_raise = await client.get("/api/v1/mobile/admin/inventory/summary", headers=manager_headers)
    assert summary_after_threshold_raise.status_code == 200
    assert any(item["id"] == product_id for item in summary_after_threshold_raise.json()["data"]["low_stock_products"])

    ack = await client.post(f"/api/v1/mobile/admin/inventory/products/{product_id}/low-stock/ack", headers=manager_headers)
    assert ack.status_code == 200
    assert ack.json()["data"]["low_stock_acknowledged_at"] is not None

    snooze = await client.post(
        f"/api/v1/mobile/admin/inventory/products/{product_id}/low-stock/snooze",
        headers=manager_headers,
        json={"hours": 4},
    )
    assert snooze.status_code == 200
    assert snooze.json()["data"]["low_stock_snoozed_until"] is not None

    target = await client.put(
        f"/api/v1/mobile/admin/inventory/products/{product_id}/low-stock-target",
        headers=manager_headers,
        json={"target_quantity": 20},
    )
    assert target.status_code == 200
    assert target.json()["data"]["low_stock_restock_target"] == 20

    deactivate = await client.delete(f"/api/v1/mobile/admin/inventory/products/{product_id}", headers=manager_headers)
    assert deactivate.status_code == 200
    assert deactivate.json()["data"]["is_active"] is False

    inactive_list = await client.get("/api/v1/mobile/admin/inventory/products?status_filter=inactive", headers=manager_headers)
    assert inactive_list.status_code == 200
    assert any(item["id"] == product_id for item in inactive_list.json()["data"]["items"])

    default_list = await client.get("/api/v1/mobile/admin/inventory/products", headers=manager_headers)
    assert default_list.status_code == 200
    assert any(item["id"] == product_id for item in default_list.json()["data"]["items"])

    stored_product = await db_session.get(Product, product_id)
    assert stored_product is not None
    assert stored_product.is_active is False


@pytest.mark.asyncio
async def test_mobile_support_status_wrapper_allows_staff_and_rejects_customer_staff_status(client: AsyncClient, db_session):
    hashed = get_password_hash("password")
    manager = User(email="phase4-support-manager@test.com", hashed_password=hashed, full_name="Support Manager", role=Role.MANAGER, is_active=True)
    customer = User(email="phase4-support-customer@test.com", hashed_password=hashed, full_name="Support Customer", role=Role.CUSTOMER, is_active=True)
    db_session.add_all([manager, customer])
    await db_session.flush()

    ticket = SupportTicket(
        customer_id=customer.id,
        subject="Mobile status wrapper",
        category=TicketCategory.GENERAL,
        status=TicketStatus.OPEN,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db_session.add(ticket)
    await db_session.commit()

    manager_headers = await _login(client, manager.email)
    customer_headers = await _login(client, customer.email)

    customer_staff_status = await client.patch(
        f"/api/v1/mobile/support/tickets/{ticket.id}/status",
        headers=customer_headers,
        json={"status": "IN_PROGRESS"},
    )
    assert customer_staff_status.status_code == 403

    manager_update = await client.patch(
        f"/api/v1/mobile/support/tickets/{ticket.id}/status",
        headers=manager_headers,
        json={"status": "IN_PROGRESS"},
    )
    assert manager_update.status_code == 200
    assert manager_update.json()["data"]["status"] == "IN_PROGRESS"


@pytest.mark.asyncio
async def test_mobile_support_queue_filters_for_staff(client: AsyncClient, db_session):
    hashed = get_password_hash("password")
    manager = User(email="phase4-support-filter-manager@test.com", hashed_password=hashed, full_name="Support Filter Manager", role=Role.MANAGER, is_active=True)
    customer = User(email="phase4-support-filter-customer@test.com", hashed_password=hashed, full_name="Support Filter Customer", role=Role.CUSTOMER, is_active=True)
    db_session.add_all([manager, customer])
    await db_session.flush()

    now = datetime.now(timezone.utc)
    db_session.add_all(
        [
            SupportTicket(
                customer_id=customer.id,
                subject="Active general",
                category=TicketCategory.GENERAL,
                status=TicketStatus.OPEN,
                created_at=now,
                updated_at=now,
            ),
            SupportTicket(
                customer_id=customer.id,
                subject="Resolved billing",
                category=TicketCategory.BILLING,
                status=TicketStatus.RESOLVED,
                created_at=now,
                updated_at=now,
            ),
            SupportTicket(
                customer_id=customer.id,
                subject="Closed subscription",
                category=TicketCategory.SUBSCRIPTION,
                status=TicketStatus.CLOSED,
                created_at=now,
                updated_at=now,
            ),
        ]
    )
    await db_session.commit()

    manager_headers = await _login(client, manager.email)

    active = await client.get("/api/v1/mobile/support/tickets?is_active=true", headers=manager_headers)
    assert active.status_code == 200
    assert [ticket["subject"] for ticket in active.json()["data"]] == ["Active general"]

    resolved_closed = await client.get("/api/v1/mobile/support/tickets?is_active=false", headers=manager_headers)
    assert resolved_closed.status_code == 200
    assert {ticket["subject"] for ticket in resolved_closed.json()["data"]} == {"Resolved billing", "Closed subscription"}

    billing = await client.get("/api/v1/mobile/support/tickets?category=BILLING", headers=manager_headers)
    assert billing.status_code == 200
    assert [ticket["subject"] for ticket in billing.json()["data"]] == ["Resolved billing"]


async def _login(client: AsyncClient, email: str) -> dict[str, str]:
    response = await client.post("/api/v1/auth/login", json={"email": email, "password": "password"})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['data']['access_token']}"}
