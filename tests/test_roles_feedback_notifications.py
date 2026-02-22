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
