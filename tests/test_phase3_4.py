from datetime import datetime, timedelta, timezone
from decimal import Decimal
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.auth.security import get_password_hash
from app.database import set_rls_context
from app.models.access import AttendanceLog, RenewalRequestStatus, Subscription, SubscriptionRenewalRequest
from app.models.audit import AuditLog
from app.models.announcement import Announcement
from app.models.coaching import CoachingPackage
from app.models.facility import FacilityAsset
from app.models.chat import ChatMessage, ChatThread
from app.models.enums import Role
from app.models.finance import Transaction, TransactionCategory, TransactionType
from app.models.hr import Contract, ContractType, LeaveRequest, LeaveStatus, LeaveType, Payroll, PayrollStatus
from app.models.inventory import Product
from app.models.support import SupportTicket, TicketCategory, TicketStatus
from app.models.notification import PushDeliveryLog
from app.models.user import User
from app.services.tenancy_service import TenancyService


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

    # GET /admin/approvals is now 200 for COACH
    resp_get = await client.get("/api/v1/mobile/admin/approvals", headers=headers)
    if role == Role.COACH:
        assert resp_get.status_code == 200
    else:
        assert resp_get.status_code == 403

    mutation_checks = [
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

    assert all(response.status_code == 403 for response in mutation_checks)


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


@pytest.mark.asyncio
async def test_mobile_admin_manager_chat_is_read_only(client: AsyncClient, db_session):
    hashed = get_password_hash("password")
    admin = User(email="phase4-chat-admin@test.com", hashed_password=hashed, full_name="Chat Admin", role=Role.ADMIN, is_active=True)
    manager = User(email="phase4-chat-manager@test.com", hashed_password=hashed, full_name="Chat Manager", role=Role.MANAGER, is_active=True)
    coach = User(email="phase4-chat-coach@test.com", hashed_password=hashed, full_name="Chat Coach", role=Role.COACH, is_active=True)
    customer = User(email="phase4-chat-customer@test.com", hashed_password=hashed, full_name="Chat Customer", role=Role.CUSTOMER, is_active=True)
    db_session.add_all([admin, manager, coach, customer])
    await db_session.flush()

    now = datetime.now(timezone.utc)
    thread = ChatThread(customer_id=customer.id, coach_id=coach.id, created_at=now, updated_at=now, last_message_at=now)
    db_session.add(thread)
    await db_session.flush()
    db_session.add(ChatMessage(thread_id=thread.id, sender_id=coach.id, message_type="TEXT", text_content="Progress looks good", created_at=now))
    await db_session.commit()

    admin_headers = await _login(client, admin.email)
    manager_headers = await _login(client, manager.email)
    coach_headers = await _login(client, coach.email)

    for headers in (admin_headers, manager_headers):
        threads = await client.get("/api/v1/mobile/chat/threads", headers=headers)
        assert threads.status_code == 200
        assert threads.json()["data"][0]["id"] == str(thread.id)

        messages = await client.get(f"/api/v1/mobile/chat/threads/{thread.id}/messages", headers=headers)
        assert messages.status_code == 200
        assert messages.json()["data"][0]["text_content"] == "Progress looks good"

        contacts = await client.get("/api/v1/mobile/chat/contacts", headers=headers)
        assert contacts.status_code == 403

        create_thread = await client.post("/api/v1/mobile/chat/threads", headers=headers, json={"customer_id": str(customer.id)})
        assert create_thread.status_code == 403

        send = await client.post(
            f"/api/v1/mobile/chat/threads/{thread.id}/messages",
            headers=headers,
            json={"text_content": "Admin reply"},
        )
        assert send.status_code == 403

        mark_read = await client.post(f"/api/v1/mobile/chat/threads/{thread.id}/read", headers=headers)
        assert mark_read.status_code == 403

    coach_send = await client.post(
        f"/api/v1/mobile/chat/threads/{thread.id}/messages",
        headers=coach_headers,
        json={"text_content": "Coach can still reply"},
    )
    assert coach_send.status_code == 200


@pytest.mark.asyncio
async def test_mobile_admin_staff_operations_for_admin_manager_only(client: AsyncClient, db_session):
    hashed = get_password_hash("password")
    _, branch = await TenancyService.ensure_default_gym_and_branch(db_session)
    admin = User(email="phase4-staffops-admin@test.com", hashed_password=hashed, full_name="Staff Ops Admin", role=Role.ADMIN, is_active=True, home_branch_id=branch.id)
    manager = User(email="phase4-staffops-manager@test.com", hashed_password=hashed, full_name="Staff Ops Manager", role=Role.MANAGER, is_active=True, home_branch_id=branch.id)
    employee = User(email="phase4-staffops-employee@test.com", hashed_password=hashed, full_name="Staff Ops Employee", role=Role.EMPLOYEE, is_active=True, home_branch_id=branch.id)
    customer = User(email="phase4-staffops-customer@test.com", hashed_password=hashed, full_name="Staff Ops Customer", role=Role.CUSTOMER, is_active=True, home_branch_id=branch.id)
    db_session.add_all([admin, manager, employee, customer])
    await db_session.flush()

    now = datetime.now(timezone.utc).replace(hour=12, minute=0, second=0, microsecond=0)
    db_session.add_all(
        [
            Contract(
                user_id=employee.id,
                contract_type=ContractType.FULL_TIME,
                base_salary=500,
                commission_rate=0,
                start_date=now.date(),
                standard_hours=160,
            ),
                AttendanceLog(
                    user_id=employee.id,
                    check_in_time=now - timedelta(minutes=30),
                    check_out_time=None,
                    hours_worked=0,
                    branch_id=branch.id,
                ),
            LeaveRequest(
                user_id=employee.id,
                start_date=now.date(),
                end_date=(now + timedelta(days=1)).date(),
                leave_type=LeaveType.SICK,
                status=LeaveStatus.PENDING,
                reason="Medical",
            ),
            Payroll(
                user_id=employee.id,
                month=now.month,
                year=now.year,
                base_pay=500,
                overtime_pay=25,
                deductions=5,
                total_pay=520,
                status=PayrollStatus.DRAFT,
            ),
        ]
    )
    await db_session.commit()

    admin_headers = await _login(client, admin.email)
    manager_headers = await _login(client, manager.email)
    customer_headers = await _login(client, customer.email)

    for headers in (admin_headers, manager_headers):
        listing = await client.get("/api/v1/mobile/admin/staff?q=Staff%20Ops", headers=headers)
        assert listing.status_code == 200
        items = listing.json()["data"]["items"]
        assert any(item["id"] == str(employee.id) for item in items)

        detail = await client.get(f"/api/v1/mobile/admin/staff/{employee.id}", headers=headers)
        assert detail.status_code == 200
        payload = detail.json()["data"]
        assert payload["staff"]["role"] == "EMPLOYEE"
        assert payload["contract"]["type"] == "FULL_TIME"
        assert payload["attendance_summary"]["clocked_in"] is True
        assert payload["leave_summary"]["pending"] == 1
        assert payload["payroll_summary"]["status"] == "DRAFT"

    forbidden_list = await client.get("/api/v1/mobile/admin/staff", headers=customer_headers)
    assert forbidden_list.status_code == 403

    forbidden_detail = await client.get(f"/api/v1/mobile/admin/staff/{employee.id}", headers=customer_headers)
    assert forbidden_detail.status_code == 403


@pytest.mark.asyncio
async def test_private_coaching_packages_create_use_and_adjust_flow(client: AsyncClient, db_session):
    admin = User(
        email="phase4-coach-admin@test.com",
        hashed_password=get_password_hash("password"),
        full_name="Phase 4 Coach Admin",
        role=Role.ADMIN,
        is_active=True,
    )
    coach = User(
        email="phase4-coach-user@test.com",
        hashed_password=get_password_hash("password"),
        full_name="Phase 4 Coach",
        role=Role.COACH,
        is_active=True,
    )
    customer = User(
        email="phase4-package-customer@test.com",
        hashed_password=get_password_hash("password"),
        full_name="Phase 4 Package Customer",
        role=Role.CUSTOMER,
        is_active=True,
    )
    db_session.add_all([admin, coach, customer])
    await db_session.commit()

    admin_headers = await _login(client, admin.email)
    coach_headers = await _login(client, coach.email)
    customer_headers = await _login(client, customer.email)

    create_res = await client.post(
        "/api/v1/coaching/packages",
        headers=admin_headers,
        json={
            "user_id": str(customer.id),
            "coach_id": str(coach.id),
            "package_label": "Private PT 8",
            "total_sessions": 8,
            "note": "Phase 4 coaching pack",
        },
    )
    assert create_res.status_code == 200
    created_package = create_res.json()["data"]
    assert created_package["package_key"].startswith("PT-")
    assert len(created_package["package_key"]) > 3
    package_id = created_package["id"]

    coach_list_res = await client.get(
        "/api/v1/coaching/packages",
        headers=coach_headers,
        params={"coach_id": str(coach.id)},
    )
    assert coach_list_res.status_code == 200
    coach_data = coach_list_res.json()["data"]
    assert coach_data["summary"]["total_packages"] == 1
    assert coach_data["packages"][0]["remaining_sessions"] == 8

    customer_list_res = await client.get(
        "/api/v1/coaching/packages",
        headers=customer_headers,
    )
    assert customer_list_res.status_code == 200
    customer_data = customer_list_res.json()["data"]
    assert customer_data["summary"]["total_packages"] == 1
    assert customer_data["packages"][0]["coach_id"] == str(coach.id)

    use_res = await client.post(
        f"/api/v1/coaching/packages/{package_id}/use",
        headers=customer_headers,
        json={"used_sessions": 1, "note": "Completed one private session"},
    )
    assert use_res.status_code == 200
    assert use_res.json()["data"]["remaining_sessions"] == 7

    ledger_res = await client.get(
        f"/api/v1/coaching/packages/{package_id}/ledger",
        headers=customer_headers,
    )
    assert ledger_res.status_code == 200
    ledger = ledger_res.json()["data"]
    assert ledger["entries"][0]["session_delta"] == -1

    adjust_res = await client.patch(
        f"/api/v1/coaching/packages/{package_id}",
        headers=admin_headers,
        json={"total_sessions": 10},
    )
    assert adjust_res.status_code == 200
    assert adjust_res.json()["data"]["remaining_sessions"] == 9

    stored = await db_session.get(CoachingPackage, uuid.UUID(package_id))
    assert stored is not None
    assert stored.total_sessions == 10


@pytest.mark.asyncio
async def test_private_coaching_manager_can_create_and_edit(client: AsyncClient, db_session):
    manager = User(
        email="phase4-coach-manager@test.com",
        hashed_password=get_password_hash("password"),
        full_name="Phase 4 Coach Manager",
        role=Role.MANAGER,
        is_active=True,
    )
    coach = User(
        email="phase4-coach-manager-coach@test.com",
        hashed_password=get_password_hash("password"),
        full_name="Phase 4 Manager Coach",
        role=Role.COACH,
        is_active=True,
    )
    customer = User(
        email="phase4-coach-manager-customer@test.com",
        hashed_password=get_password_hash("password"),
        full_name="Phase 4 Manager Customer",
        role=Role.CUSTOMER,
        is_active=True,
    )
    db_session.add_all([manager, coach, customer])
    await db_session.commit()

    manager_headers = await _login(client, manager.email)

    create_res = await client.post(
        "/api/v1/coaching/packages",
        headers=manager_headers,
        json={
            "user_id": str(customer.id),
            "coach_id": str(coach.id),
            "package_label": "Manager PT",
            "total_sessions": 6,
        },
    )
    assert create_res.status_code == 200
    package = create_res.json()["data"]
    assert package["package_key"].startswith("PT-")

    update_res = await client.patch(
        f"/api/v1/coaching/packages/{package['id']}",
        headers=manager_headers,
        json={"package_label": "Manager PT Updated", "total_sessions": 7},
    )
    assert update_res.status_code == 200
    updated = update_res.json()["data"]
    assert updated["package_label"] == "Manager PT Updated"
    assert updated["total_sessions"] == 7


@pytest.mark.asyncio
async def test_announcements_publish_and_show_in_customer_feed(client: AsyncClient, db_session):
    admin = User(
        email="phase5-ann-admin@test.com",
        hashed_password=get_password_hash("password"),
        full_name="Phase 5 Ann Admin",
        role=Role.ADMIN,
        is_active=True,
    )
    customer = User(
        email="phase5-ann-customer@test.com",
        hashed_password=get_password_hash("password"),
        full_name="Phase 5 Ann Customer",
        role=Role.CUSTOMER,
        is_active=True,
    )
    db_session.add_all([admin, customer])
    await db_session.commit()

    admin_headers = await _login(client, admin.email)
    customer_headers = await _login(client, customer.email)

    create_res = await client.post(
        "/api/v1/admin/announcements",
        headers=admin_headers,
        json={
            "title": "Holiday Hours",
            "body": "We will close early tomorrow at 8 PM.",
            "audience": "ALL",
            "push_enabled": True,
        },
    )
    assert create_res.status_code == 200
    announcement_id = create_res.json()["data"]["id"]

    announcement = await db_session.get(Announcement, uuid.UUID(announcement_id))
    assert announcement is not None
    assert announcement.is_published is True

    list_res = await client.get("/api/v1/announcements", headers=customer_headers)
    assert list_res.status_code == 200
    feed = list_res.json()["data"]
    assert any(item["id"] == announcement_id for item in feed)

    notifications_res = await client.get("/api/v1/mobile/customer/notifications", headers=customer_headers)
    assert notifications_res.status_code == 200
    notifications = notifications_res.json()["data"]["items"]
    assert any(item["id"] == announcement_id for item in notifications)

    push_log = (
        await db_session.execute(
            select(PushDeliveryLog).where(PushDeliveryLog.event_type == "ANNOUNCEMENT_PUBLISHED")
        )
    ).scalars().first()
    assert push_log is not None


@pytest.mark.asyncio
async def test_facility_assets_are_branch_scoped_and_post_expenses(client: AsyncClient, db_session):
    admin_headers = await _auth_headers_for_role(client, db_session, Role.ADMIN, "phase6-facility-admin@test.com")
    _, branch = await TenancyService.ensure_default_gym_and_branch(db_session)

    asset_res = await client.post(
        "/api/v1/facility/assets",
        headers=admin_headers,
        params={"branch_id": str(branch.id)},
        json={
            "name": "Treadmill A1",
            "asset_type": "MACHINE",
            "status": "NEED_MAINTENANCE",
            "fix_expense_amount": 125.50,
            "note": "Replaced the running belt and safety clip.",
            "is_active": True,
        },
    )
    assert asset_res.status_code == 200
    asset_id = asset_res.json()["data"]["id"]

    list_res = await client.get(
        "/api/v1/facility/assets",
        headers=admin_headers,
        params={"branch_id": str(branch.id)},
    )
    assert list_res.status_code == 200
    assert list_res.json()["data"][0]["id"] == asset_id

    stored_asset = await db_session.get(FacilityAsset, uuid.UUID(asset_id))
    assert stored_asset is not None and stored_asset.branch_id == branch.id

    expense_res = await db_session.execute(
        select(Transaction).where(
            Transaction.description == "Maintenance fix expense - Treadmill A1",
            Transaction.branch_id == branch.id,
            Transaction.type == TransactionType.EXPENSE,
            Transaction.category == TransactionCategory.MAINTENANCE,
        )
    )
    expense = expense_res.scalars().first()
    assert expense is not None
    assert float(expense.amount) == 125.50

    update_res = await client.patch(
        f"/api/v1/facility/assets/{asset_id}",
        headers=admin_headers,
        json={
            "name": "Treadmill A1",
            "asset_type": "MACHINE",
            "status": "GOOD",
            "fix_expense_amount": 180.00,
            "note": "Repaired and tested.",
            "is_active": True,
        },
    )
    assert update_res.status_code == 200

    updated_expense_res = await db_session.execute(
        select(Transaction).where(
            Transaction.description == "Maintenance fix expense - Treadmill A1",
            Transaction.branch_id == branch.id,
            Transaction.type == TransactionType.EXPENSE,
            Transaction.category == TransactionCategory.MAINTENANCE,
        )
    )
    updated_expense = updated_expense_res.scalars().first()
    assert updated_expense is not None
    assert float(updated_expense.amount) == 180.00


async def _login(client: AsyncClient, email: str) -> dict[str, str]:
    response = await client.post("/api/v1/auth/login", json={"email": email, "password": "password"})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['data']['access_token']}"}
