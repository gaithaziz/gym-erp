from datetime import datetime, timedelta, timezone
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.security import get_password_hash
from app.config import settings
from app.models.access import Subscription, SubscriptionStatus
from app.models.enums import Role
from app.models.finance import POSTransactionItem, Transaction
from app.models.inventory import Product
from app.models.notification import WhatsAppDeliveryLog
from app.models.notification import WhatsAppAutomationRule
from app.models.user import User


@pytest.mark.asyncio
async def test_reception_can_register_member(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    reception = User(
        email="reception_register@gym.com",
        hashed_password=hashed,
        role=Role.RECEPTION,
        full_name="Reception",
        is_active=True,
    )
    db_session.add(reception)
    await db_session.commit()

    login = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": reception.email, "password": password},
    )
    token = login.json()["data"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    register = await client.post(
        f"{settings.API_V1_STR}/auth/register",
        json={
            "email": "new_member_from_reception@gym.com",
            "password": "password123",
            "full_name": "New Member",
            "role": "CUSTOMER",
        },
        headers=headers,
    )
    assert register.status_code == 200


@pytest.mark.asyncio
async def test_cashier_can_process_pos_sale(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    admin = User(email="admin_cashier_pos@gym.com", hashed_password=hashed, role=Role.ADMIN, full_name="Admin POS")
    cashier = User(email="cashier_pos@gym.com", hashed_password=hashed, role=Role.CASHIER, full_name="Cashier POS")
    db_session.add_all([admin, cashier])
    await db_session.commit()

    admin_login = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": admin.email, "password": password},
    )
    admin_headers = {"Authorization": f"Bearer {admin_login.json()['data']['access_token']}"}
    product_resp = await client.post(
        f"{settings.API_V1_STR}/inventory/products",
        json={"name": "Water", "category": "DRINK", "price": 1.0, "stock_quantity": 5, "low_stock_threshold": 1},
        headers=admin_headers,
    )
    assert product_resp.status_code == 200
    product_id = product_resp.json()["data"]["id"]

    cashier_login = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": cashier.email, "password": password},
    )
    cashier_headers = {"Authorization": f"Bearer {cashier_login.json()['data']['access_token']}"}

    list_products = await client.get(f"{settings.API_V1_STR}/inventory/products", headers=cashier_headers)
    assert list_products.status_code == 200

    sale = await client.post(
        f"{settings.API_V1_STR}/inventory/pos/sell",
        json={"product_id": product_id, "quantity": 1, "payment_method": "CASH"},
        headers=cashier_headers,
    )
    assert sale.status_code == 200


@pytest.mark.asyncio
async def test_cashier_mobile_cart_checkout_receipt_and_bootstrap(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    admin = User(email="admin_mobile_pos@gym.com", hashed_password=hashed, role=Role.ADMIN, full_name="Admin Mobile POS", is_active=True)
    cashier = User(email="cashier_mobile_pos@gym.com", hashed_password=hashed, role=Role.CASHIER, full_name="Cashier Mobile POS", is_active=True)
    employee = User(email="employee_mobile_ops@gym.com", hashed_password=hashed, role=Role.EMPLOYEE, full_name="Employee Ops", is_active=True)
    customer = User(email="member_mobile_pos@gym.com", hashed_password=hashed, role=Role.CUSTOMER, full_name="Member POS", is_active=True)
    db_session.add_all([admin, cashier, employee, customer])
    await db_session.commit()

    admin_login = await client.post(f"{settings.API_V1_STR}/auth/login", json={"email": admin.email, "password": password})
    admin_headers = {"Authorization": f"Bearer {admin_login.json()['data']['access_token']}"}
    water_resp = await client.post(
        f"{settings.API_V1_STR}/inventory/products",
        json={"name": "Water Cart", "category": "DRINK", "price": 1.5, "stock_quantity": 5, "low_stock_threshold": 1},
        headers=admin_headers,
    )
    bar_resp = await client.post(
        f"{settings.API_V1_STR}/inventory/products",
        json={"name": "Protein Bar Cart", "category": "SNACK", "price": 2.0, "stock_quantity": 4, "low_stock_threshold": 1},
        headers=admin_headers,
    )
    water_id = water_resp.json()["data"]["id"]
    bar_id = bar_resp.json()["data"]["id"]

    cashier_login = await client.post(f"{settings.API_V1_STR}/auth/login", json={"email": cashier.email, "password": password})
    cashier_headers = {"Authorization": f"Bearer {cashier_login.json()['data']['access_token']}"}

    bootstrap = await client.get(f"{settings.API_V1_STR}/mobile/bootstrap", headers=cashier_headers)
    assert bootstrap.status_code == 200
    assert "operations" in bootstrap.json()["data"]["enabled_modules"]
    assert "qr" in bootstrap.json()["data"]["enabled_modules"]

    employee_login = await client.post(f"{settings.API_V1_STR}/auth/login", json={"email": employee.email, "password": password})
    employee_headers = {"Authorization": f"Bearer {employee_login.json()['data']['access_token']}"}
    employee_bootstrap = await client.get(f"{settings.API_V1_STR}/mobile/bootstrap", headers=employee_headers)
    assert employee_bootstrap.status_code == 200
    assert "operations" in employee_bootstrap.json()["data"]["enabled_modules"]

    checkout_payload = {
        "items": [{"product_id": water_id, "quantity": 2}, {"product_id": bar_id, "quantity": 1}],
        "payment_method": "CARD",
        "member_id": str(customer.id),
        "idempotency_key": "mobile-cart-test-1",
    }
    checkout = await client.post(f"{settings.API_V1_STR}/mobile/staff/pos/checkout", json=checkout_payload, headers=cashier_headers)
    assert checkout.status_code == 200
    data = checkout.json()["data"]
    assert data["total"] == 5.0
    assert len(data["line_items"]) == 2
    assert data["receipt_export_pdf_url"].endswith("/receipt/export-pdf")

    duplicate = await client.post(f"{settings.API_V1_STR}/mobile/staff/pos/checkout", json=checkout_payload, headers=cashier_headers)
    assert duplicate.status_code == 200
    assert duplicate.json()["data"]["transaction_id"] == data["transaction_id"]

    tx = await db_session.get(Transaction, uuid.UUID(data["transaction_id"]))
    assert tx is not None
    assert float(tx.amount) == 5.0
    item_rows = (
        await db_session.execute(select(POSTransactionItem).where(POSTransactionItem.transaction_id == tx.id))
    ).scalars().all()
    assert len(item_rows) == 2
    water = await db_session.get(Product, uuid.UUID(water_id))
    assert water is not None
    assert water.stock_quantity == 3

    receipt = await client.get(f"{settings.API_V1_STR}/finance/transactions/{tx.id}/receipt", headers=cashier_headers)
    assert receipt.status_code == 200
    assert len(receipt.json()["data"]["line_items"]) == 2

    insufficient = await client.post(
        f"{settings.API_V1_STR}/mobile/staff/pos/checkout",
        json={"items": [{"product_id": water_id, "quantity": 99}], "payment_method": "CASH"},
        headers=cashier_headers,
    )
    assert insufficient.status_code == 400


@pytest.mark.asyncio
async def test_feedback_endpoints_and_whatsapp_log_on_access(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    admin = User(email="admin_feedback@gym.com", hashed_password=hashed, role=Role.ADMIN, full_name="Admin Feedback", is_active=True)
    coach = User(email="coach_feedback@gym.com", hashed_password=hashed, role=Role.COACH, full_name="Coach Feedback", is_active=True)
    customer = User(
        email="member_feedback@gym.com",
        hashed_password=hashed,
        role=Role.CUSTOMER,
        full_name="Member Feedback",
        phone_number="+15550001111",
        is_active=True,
    )
    db_session.add_all([admin, coach, customer])
    await db_session.flush()

    now = datetime.now(timezone.utc)
    db_session.add(Subscription(
        user_id=customer.id,
        plan_name="Gold",
        start_date=now - timedelta(days=1),
        end_date=now + timedelta(days=30),
        status=SubscriptionStatus.ACTIVE,
    ))
    await db_session.commit()

    coach_login = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": coach.email, "password": password},
    )
    coach_headers = {"Authorization": f"Bearer {coach_login.json()['data']['access_token']}"}
    diet = await client.post(
        f"{settings.API_V1_STR}/fitness/diets",
        json={"name": "Lean Diet", "description": "desc", "content": "diet", "member_id": str(customer.id)},
        headers=coach_headers,
    )
    assert diet.status_code == 200
    diet_id = diet.json()["data"]["id"]

    customer_login = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": customer.email, "password": password},
    )
    customer_token = customer_login.json()["data"]["access_token"]
    customer_headers = {"Authorization": f"Bearer {customer_token}"}

    diet_feedback = await client.post(
        f"{settings.API_V1_STR}/fitness/diet-feedback",
        json={"diet_plan_id": diet_id, "rating": 5, "comment": "Great plan"},
        headers=customer_headers,
    )
    assert diet_feedback.status_code == 200

    gym_feedback = await client.post(
        f"{settings.API_V1_STR}/fitness/gym-feedback",
        json={"category": "GENERAL", "rating": 4, "comment": "Nice gym"},
        headers=customer_headers,
    )
    assert gym_feedback.status_code == 200

    diet_list = await client.get(f"{settings.API_V1_STR}/fitness/diet-feedback", headers=coach_headers)
    gym_list = await client.get(f"{settings.API_V1_STR}/fitness/gym-feedback", headers=coach_headers)
    assert diet_list.status_code == 200
    assert gym_list.status_code == 200
    assert len(diet_list.json()["data"]) >= 1
    assert len(gym_list.json()["data"]) >= 1

    admin_login = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": admin.email, "password": password},
    )
    admin_token = admin_login.json()["data"]["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    kiosk_id = f"kiosk-{uuid.uuid4().hex[:6]}"
    kiosk_auth = await client.post(
        f"{settings.API_V1_STR}/access/kiosk/auth",
        json={"kiosk_id": kiosk_id},
        headers=admin_headers,
    )
    assert kiosk_auth.status_code == 200
    kiosk_token = kiosk_auth.json()["data"]["kiosk_token"]

    qr = await client.get(f"{settings.API_V1_STR}/access/qr", headers=customer_headers)
    assert qr.status_code == 200
    qr_token = qr.json()["data"]["qr_token"]

    scan = await client.post(
        f"{settings.API_V1_STR}/access/scan",
        json={"qr_token": qr_token, "kiosk_id": kiosk_id},
        headers={"X-Kiosk-Token": kiosk_token},
    )
    assert scan.status_code == 200
    assert scan.json()["data"]["status"] == "GRANTED"

    await db_session.refresh(customer)
    logs_stmt = select(WhatsAppDeliveryLog).where(WhatsAppDeliveryLog.event_type == "ACCESS_GRANTED")
    logs_result = await db_session.execute(logs_stmt)
    logs = logs_result.scalars().all()
    assert len(logs) >= 1

    logs_api = await client.get(f"{settings.API_V1_STR}/admin/notifications/whatsapp-logs", headers=admin_headers)
    assert logs_api.status_code == 200


@pytest.mark.asyncio
async def test_reception_can_manage_whatsapp_automation_rules_and_disabled_rule_skips_send(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    reception = User(
        email="reception_whatsapp@gym.com",
        hashed_password=hashed,
        role=Role.RECEPTION,
        full_name="Reception WhatsApp",
        is_active=True,
    )
    customer = User(
        email="member_whatsapp_rule@gym.com",
        hashed_password=hashed,
        role=Role.CUSTOMER,
        full_name="Member Rule",
        phone_number="+15550002222",
        is_active=True,
    )
    db_session.add_all([reception, customer])
    await db_session.flush()

    db_session.add(Subscription(
        user_id=customer.id,
        plan_name="Gold",
        start_date=datetime.now(timezone.utc) - timedelta(days=1),
        end_date=datetime.now(timezone.utc) + timedelta(days=30),
        status=SubscriptionStatus.ACTIVE,
    ))
    db_session.add(WhatsAppAutomationRule(
        event_type="ACCESS_GRANTED",
        trigger_name="Member QR access granted",
        template_key="activity_check_in",
        message_template="Hi {{member_name}}",
        is_enabled=False,
    ))
    await db_session.commit()

    reception_login = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": reception.email, "password": password},
    )
    reception_headers = {"Authorization": f"Bearer {reception_login.json()['data']['access_token']}"}

    rules_resp = await client.get(f"{settings.API_V1_STR}/admin/notifications/automation-rules", headers=reception_headers)
    assert rules_resp.status_code == 200
    assert any(rule["event_type"] == "ACCESS_GRANTED" for rule in rules_resp.json()["data"])

    update_resp = await client.put(
        f"{settings.API_V1_STR}/admin/notifications/automation-rules/ACCESS_GRANTED",
        json={
            "trigger_name": "Member Entry Trigger",
            "template_key": "activity_check_in_custom",
            "message_template": "Welcome {{member_name}}",
            "is_enabled": False,
        },
        headers=reception_headers,
    )
    assert update_resp.status_code == 200

    customer_login = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": customer.email, "password": password},
    )
    customer_headers = {"Authorization": f"Bearer {customer_login.json()['data']['access_token']}"}
    qr = await client.get(f"{settings.API_V1_STR}/access/qr", headers=customer_headers)
    qr_token = qr.json()["data"]["qr_token"]

    kiosk_id = f"kiosk-{uuid.uuid4().hex[:6]}"
    kiosk_auth = await client.post(
        f"{settings.API_V1_STR}/access/kiosk/auth",
        json={"kiosk_id": kiosk_id},
        headers=reception_headers,
    )
    kiosk_token = kiosk_auth.json()["data"]["kiosk_token"]

    scan = await client.post(
        f"{settings.API_V1_STR}/access/scan",
        json={"qr_token": qr_token, "kiosk_id": kiosk_id},
        headers={"X-Kiosk-Token": kiosk_token},
    )
    assert scan.status_code == 200
    assert scan.json()["data"]["status"] == "GRANTED"

    logs_stmt = select(WhatsAppDeliveryLog).where(WhatsAppDeliveryLog.event_type == "ACCESS_GRANTED")
    logs_result = await db_session.execute(logs_stmt)
    logs = logs_result.scalars().all()
    assert len(logs) >= 1
    assert any(log.status == "SKIPPED" and (log.error_message or "").lower().find("disabled") >= 0 for log in logs)


@pytest.mark.asyncio
async def test_reception_can_create_new_whatsapp_automation_rule(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    reception = User(
        email="reception_create_rule@gym.com",
        hashed_password=hashed,
        role=Role.RECEPTION,
        full_name="Reception Create Rule",
        is_active=True,
    )
    db_session.add(reception)
    await db_session.commit()

    login = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": reception.email, "password": password},
    )
    headers = {"Authorization": f"Bearer {login.json()['data']['access_token']}"}

    create_resp = await client.post(
        f"{settings.API_V1_STR}/admin/notifications/automation-rules",
        json={
            "event_type": "CUSTOM_CAMPAIGN_TRIGGER",
            "trigger_name": "Custom Campaign Trigger",
            "template_key": "custom_campaign_template",
            "message_template": "Hello {{member_name}}",
            "is_enabled": True,
        },
        headers=headers,
    )
    assert create_resp.status_code == 200
    assert create_resp.json()["data"]["event_type"] == "CUSTOM_CAMPAIGN_TRIGGER"

    duplicate_resp = await client.post(
        f"{settings.API_V1_STR}/admin/notifications/automation-rules",
        json={
            "event_type": "CUSTOM_CAMPAIGN_TRIGGER",
            "trigger_name": "Duplicate",
            "template_key": "duplicate_template",
            "message_template": "dup",
            "is_enabled": True,
        },
        headers=headers,
    )
    assert duplicate_resp.status_code == 409


@pytest.mark.asyncio
async def test_automation_rule_delete_guard_and_force_delete(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    admin = User(
        email="admin_delete_rule@gym.com",
        hashed_password=hashed,
        role=Role.ADMIN,
        full_name="Admin Delete Rule",
        is_active=True,
    )
    db_session.add(admin)
    db_session.add(WhatsAppAutomationRule(
        event_type="SUBSCRIPTION_CREATED",
        trigger_name="Subscription created",
        template_key="subscription_updated",
        message_template="msg",
        is_enabled=True,
    ))
    db_session.add(WhatsAppAutomationRule(
        event_type="CUSTOM_DELETE_TEST",
        trigger_name="Custom delete test",
        template_key="custom_delete",
        message_template="msg",
        is_enabled=True,
    ))
    await db_session.commit()

    login = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": admin.email, "password": password},
    )
    headers = {"Authorization": f"Bearer {login.json()['data']['access_token']}"}

    blocked_delete = await client.delete(
        f"{settings.API_V1_STR}/admin/notifications/automation-rules/SUBSCRIPTION_CREATED",
        headers=headers,
    )
    assert blocked_delete.status_code == 400

    forced_delete = await client.delete(
        f"{settings.API_V1_STR}/admin/notifications/automation-rules/SUBSCRIPTION_CREATED",
        params={"force": True},
        headers=headers,
    )
    assert forced_delete.status_code == 200

    custom_delete = await client.delete(
        f"{settings.API_V1_STR}/admin/notifications/automation-rules/CUSTOM_DELETE_TEST",
        headers=headers,
    )
    assert custom_delete.status_code == 200
