import uuid
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import security
from app.config import settings
from app.models.access import AccessLog, RenewalRequestStatus, Subscription, SubscriptionRenewalRequest
from app.models.chat import ChatMessage, ChatThread
from app.models.enums import Role
from app.models.finance import PaymentMethod, Transaction, TransactionCategory, TransactionType
from app.models.fitness import BiometricLog, DietPlan, WorkoutPlan
from app.models.notification import WhatsAppDeliveryLog
from app.models.subscription_enums import SubscriptionStatus
from app.models.support import SupportTicket, TicketCategory, TicketStatus
from app.models.user import User
from app.models.workout_log import WorkoutSession


async def _login(client: AsyncClient, email: str, password: str = "password123") -> dict[str, str]:
    response = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200
    token = response.json()["data"]["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_mobile_customer_home_and_billing(client: AsyncClient, db_session: AsyncSession):
    now = datetime.now(timezone.utc)
    customer = User(
        email="customer-mobile@example.com",
        hashed_password=security.get_password_hash("password123"),
        role=Role.CUSTOMER,
        full_name="Customer Mobile",
        is_active=True,
    )
    coach = User(
        email="coach-mobile@example.com",
        hashed_password=security.get_password_hash("password123"),
        role=Role.COACH,
        full_name="Coach Mobile",
        is_active=True,
    )
    db_session.add_all([customer, coach])
    await db_session.flush()

    db_session.add(
        Subscription(
            user_id=customer.id,
            plan_name="Monthly",
            start_date=now - timedelta(days=5),
            end_date=now + timedelta(days=5),
            status=SubscriptionStatus.ACTIVE,
        )
    )
    db_session.add(
        WorkoutPlan(
            name="Starter Plan",
            creator_id=coach.id,
            member_id=customer.id,
            is_template=False,
            status="PUBLISHED",
            version=1,
            expected_sessions_per_30d=12,
            published_at=now - timedelta(days=2),
        )
    )
    db_session.add(
        DietPlan(
            name="Lean Diet",
            creator_id=coach.id,
            member_id=customer.id,
            content="Lean diet content",
            is_template=False,
            status="PUBLISHED",
            version=1,
            published_at=now - timedelta(days=2),
        )
    )
    db_session.add(
        BiometricLog(
            member_id=customer.id,
            date=now - timedelta(days=1),
            weight_kg=81.2,
            body_fat_pct=18.4,
        )
    )
    db_session.add(
        AccessLog(
            user_id=customer.id,
            scan_time=now - timedelta(days=1),
            kiosk_id="kiosk-01",
            status="GRANTED",
            reason=None,
        )
    )
    db_session.add(
        SupportTicket(
            customer_id=customer.id,
            subject="Need help",
            category=TicketCategory.SUBSCRIPTION,
            status=TicketStatus.OPEN,
            created_at=now - timedelta(days=1),
            updated_at=now - timedelta(days=1),
        )
    )
    thread = ChatThread(
        customer_id=customer.id,
        coach_id=coach.id,
        created_at=now - timedelta(days=1),
        updated_at=now - timedelta(days=1),
        last_message_at=now - timedelta(hours=3),
    )
    db_session.add(thread)
    await db_session.flush()
    db_session.add(
        ChatMessage(
            thread_id=thread.id,
            sender_id=coach.id,
            message_type="TEXT",
            text_content="Please check your new plan",
            created_at=now - timedelta(hours=3),
            is_deleted=False,
        )
    )
    tx = Transaction(
        amount=30.0,
        type=TransactionType.INCOME,
        category=TransactionCategory.SUBSCRIPTION,
        payment_method=PaymentMethod.CARD,
        description="Monthly renewal",
        user_id=customer.id,
        date=now - timedelta(hours=2),
    )
    db_session.add(tx)
    db_session.add(
        WhatsAppDeliveryLog(
            user_id=customer.id,
            phone_number="+15550001111",
            template_key="subscription_renewed_v1",
            payload_json='{"message":"renewed"}',
            event_type="SUBSCRIPTION_RENEWED",
            event_ref=str(customer.id),
            idempotency_key=f"mobile-home-{customer.id}",
            status="SENT",
            created_at=now - timedelta(hours=1),
        )
    )
    await db_session.commit()

    headers = await _login(client, customer.email)

    home_response = await client.get(f"{settings.API_V1_STR}/mobile/customer/home", headers=headers)
    assert home_response.status_code == 200
    home = home_response.json()["data"]
    assert home["subscription"]["status"] == "ACTIVE"
    assert home["quick_stats"]["active_workout_plans"] == 1
    assert home["quick_stats"]["active_diet_plans"] == 1
    assert home["quick_stats"]["open_support_tickets"] == 1
    assert home["quick_stats"]["unread_chat_messages"] == 1
    assert home["recent_receipts"][0]["description"] == "Monthly renewal"
    assert home["latest_biometric"]["weight_kg"] == 81.2

    billing_response = await client.get(f"{settings.API_V1_STR}/mobile/customer/billing", headers=headers)
    assert billing_response.status_code == 200
    billing = billing_response.json()["data"]
    assert billing["payment_policy"]["store_billing_used"] is False
    assert len(billing["renewal_offers"]) == 2
    assert billing["receipts"][0]["id"] == str(tx.id)

    receipt_response = await client.get(
        f"{settings.API_V1_STR}/mobile/customer/receipts/{tx.id}",
        headers=headers,
    )
    assert receipt_response.status_code == 200
    receipt = receipt_response.json()["data"]
    assert receipt["receipt_no"]
    assert receipt["receipt_export_pdf_url"].endswith("/receipt/export-pdf")


@pytest.mark.asyncio
async def test_mobile_customer_plans_and_progress(client: AsyncClient, db_session: AsyncSession):
    now = datetime.now(timezone.utc)
    customer = User(
        email="customer-progress@example.com",
        hashed_password=security.get_password_hash("password123"),
        role=Role.CUSTOMER,
        full_name="Progress Customer",
        is_active=True,
    )
    coach = User(
        email="coach-progress@example.com",
        hashed_password=security.get_password_hash("password123"),
        role=Role.COACH,
        full_name="Progress Coach",
        is_active=True,
    )
    db_session.add_all([customer, coach])
    await db_session.flush()

    db_session.add(
        Subscription(
            user_id=customer.id,
            plan_name="Monthly",
            start_date=now - timedelta(days=3),
            end_date=now + timedelta(days=27),
            status=SubscriptionStatus.ACTIVE,
        )
    )
    workout_plan = WorkoutPlan(
        name="Strength Block",
        creator_id=coach.id,
        member_id=customer.id,
        is_template=False,
        status="PUBLISHED",
        version=1,
        expected_sessions_per_30d=16,
        published_at=now - timedelta(days=2),
    )
    db_session.add(workout_plan)
    await db_session.flush()
    db_session.add(
        DietPlan(
            name="High Protein",
            creator_id=coach.id,
            member_id=customer.id,
            content="Protein diet",
            is_template=False,
            status="PUBLISHED",
            version=1,
            published_at=now - timedelta(days=2),
        )
    )
    db_session.add(
        WorkoutSession(
            member_id=customer.id,
            plan_id=workout_plan.id,
            performed_at=(now - timedelta(days=1)).replace(tzinfo=None),
            duration_minutes=55,
            notes="Solid session",
        )
    )
    db_session.add(
        BiometricLog(
            member_id=customer.id,
            date=now - timedelta(days=1),
            weight_kg=79.4,
            muscle_mass_kg=35.1,
        )
    )
    db_session.add(
        AccessLog(
            user_id=customer.id,
            scan_time=now - timedelta(days=2),
            kiosk_id="kiosk-02",
            status="GRANTED",
            reason=None,
        )
    )
    await db_session.commit()

    headers = await _login(client, customer.email)

    plans_response = await client.get(f"{settings.API_V1_STR}/mobile/customer/plans", headers=headers)
    assert plans_response.status_code == 200
    plans = plans_response.json()["data"]
    assert plans["workout_plans"][0]["name"] == "Strength Block"
    assert plans["diet_plans"][0]["name"] == "High Protein"

    progress_response = await client.get(f"{settings.API_V1_STR}/mobile/customer/progress", headers=headers)
    assert progress_response.status_code == 200
    progress = progress_response.json()["data"]
    assert progress["biometrics"][0]["weight_kg"] == 79.4
    assert progress["attendance_history"][0]["status"] == "GRANTED"
    assert progress["recent_workout_sessions"][0]["duration_minutes"] == 55
    assert progress["workout_stats"][0]["workouts"] == 1


@pytest.mark.asyncio
async def test_mobile_customer_notifications_feed(client: AsyncClient, db_session: AsyncSession):
    now = datetime.now(timezone.utc)
    customer = User(
        email="customer-notify@example.com",
        hashed_password=security.get_password_hash("password123"),
        role=Role.CUSTOMER,
        full_name="Notify Customer",
        is_active=True,
    )
    db_session.add(customer)
    await db_session.flush()
    db_session.add(
        WhatsAppDeliveryLog(
            user_id=customer.id,
            phone_number="+15550002222",
            template_key="support_reply_v1",
            payload_json='{"message":"reply"}',
            event_type="SUPPORT_REPLY",
            event_ref=str(uuid.uuid4()),
            idempotency_key=f"mobile-notify-{customer.id}",
            status="SENT",
            created_at=now,
        )
    )
    await db_session.commit()

    headers = await _login(client, customer.email)
    response = await client.get(f"{settings.API_V1_STR}/mobile/customer/notifications", headers=headers)
    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["items"][0]["event_type"] == "SUPPORT_REPLY"
    assert payload["items"][0]["status"] == "SENT"


@pytest.mark.asyncio
async def test_mobile_customer_write_flows(client: AsyncClient, db_session: AsyncSession):
    now = datetime.now(timezone.utc)
    customer = User(
        email="customer-write@example.com",
        hashed_password=security.get_password_hash("password123"),
        role=Role.CUSTOMER,
        full_name="Write Customer",
        is_active=True,
    )
    coach = User(
        email="coach-write@example.com",
        hashed_password=security.get_password_hash("password123"),
        role=Role.COACH,
        full_name="Write Coach",
        is_active=True,
    )
    db_session.add_all([customer, coach])
    await db_session.flush()
    db_session.add(
        Subscription(
            user_id=customer.id,
            plan_name="Monthly",
            start_date=now - timedelta(days=35),
            end_date=now - timedelta(days=5),
            status=SubscriptionStatus.EXPIRED,
        )
    )
    await db_session.commit()

    headers = await _login(client, customer.email)

    prefs_get = await client.get(f"{settings.API_V1_STR}/mobile/customer/notification-settings", headers=headers)
    assert prefs_get.status_code == 200
    assert prefs_get.json()["data"]["push_enabled"] is True

    prefs_put = await client.put(
        f"{settings.API_V1_STR}/mobile/customer/notification-settings",
        headers=headers,
        json={
            "push_enabled": True,
            "chat_enabled": False,
            "support_enabled": True,
            "billing_enabled": True,
            "announcements_enabled": False,
        },
    )
    assert prefs_put.status_code == 200
    assert prefs_put.json()["data"]["chat_enabled"] is False
    assert prefs_put.json()["data"]["announcements_enabled"] is False

    bootstrap = await client.get(f"{settings.API_V1_STR}/mobile/bootstrap", headers=headers)
    assert bootstrap.status_code == 200
    assert bootstrap.json()["data"]["notification_settings"]["chat_enabled"] is False

    renewal_request = await client.post(
        f"{settings.API_V1_STR}/mobile/customer/billing/renewal-requests",
        headers=headers,
        json={"offer_code": "MONTHLY_30", "duration_days": 30, "customer_note": "I will pay at the front desk today."},
    )
    assert renewal_request.status_code == 200
    renewal_data = renewal_request.json()["data"]
    assert renewal_data["status"] == "PENDING"
    assert renewal_data["payment_method"] == "CASH"

    duplicate_request = await client.post(
        f"{settings.API_V1_STR}/mobile/customer/billing/renewal-requests",
        headers=headers,
        json={"offer_code": "MONTHLY_30", "duration_days": 30},
    )
    assert duplicate_request.status_code == 400

    billing = await client.get(f"{settings.API_V1_STR}/mobile/customer/billing", headers=headers)
    assert billing.status_code == 200
    billing_data = billing.json()["data"]
    assert billing_data["receipts"] == []
    assert billing_data["renewal_requests"][0]["id"] == renewal_data["id"]
    assert billing_data["payment_policy"]["notes"].startswith("Submit a renewal request")

    renewal_requests = await client.get(
        f"{settings.API_V1_STR}/mobile/customer/billing/renewal-requests",
        headers=headers,
    )
    assert renewal_requests.status_code == 200
    assert renewal_requests.json()["data"]["items"][0]["status"] == "PENDING"

    stored_request = (
        await db_session.get(SubscriptionRenewalRequest, uuid.UUID(renewal_data["id"]))
    )
    assert stored_request is not None
    assert stored_request.status == RenewalRequestStatus.PENDING

    support_create = await client.post(
        f"{settings.API_V1_STR}/mobile/customer/support/tickets",
        headers=headers,
        json={"subject": "Need help", "category": "GENERAL", "message": "Hello support"},
    )
    assert support_create.status_code == 200
    ticket_id = support_create.json()["data"]["id"]

    support_reply = await client.post(
        f"{settings.API_V1_STR}/mobile/customer/support/tickets/{ticket_id}/messages",
        headers=headers,
        json={"message": "Following up"},
    )
    assert support_reply.status_code == 200
    assert support_reply.json()["data"]["message"] == "Following up"

    lost_found_create = await client.post(
        f"{settings.API_V1_STR}/mobile/customer/lost-found/items",
        headers=headers,
        json={
            "title": "Water Bottle",
            "description": "Black bottle left near treadmill",
            "category": "Bottle",
            "found_location": "Cardio area",
            "contact_note": "Please hold at reception",
        },
    )
    assert lost_found_create.status_code == 200
    lost_found_item_id = lost_found_create.json()["data"]["id"]

    lost_found_list = await client.get(
        f"{settings.API_V1_STR}/mobile/customer/lost-found/items",
        headers=headers,
    )
    assert lost_found_list.status_code == 200
    assert lost_found_list.json()["data"][0]["title"] == "Water Bottle"

    lost_found_comment = await client.post(
        f"{settings.API_V1_STR}/mobile/customer/lost-found/items/{lost_found_item_id}/comments",
        headers=headers,
        json={"text": "This one is mine, thanks."},
    )
    assert lost_found_comment.status_code == 200
    assert lost_found_comment.json()["data"]["text"] == "This one is mine, thanks."

    thread_create = await client.post(
        f"{settings.API_V1_STR}/mobile/customer/chat/threads",
        headers=headers,
        json={"coach_id": str(coach.id)},
    )
    assert thread_create.status_code == 200
    thread_id = thread_create.json()["data"]["id"]

    chat_send = await client.post(
        f"{settings.API_V1_STR}/mobile/customer/chat/threads/{thread_id}/messages",
        headers=headers,
        json={"text_content": "Hi coach"},
    )
    assert chat_send.status_code == 200
    assert chat_send.json()["data"]["text_content"] == "Hi coach"

    chat_read = await client.post(
        f"{settings.API_V1_STR}/mobile/customer/chat/threads/{thread_id}/read",
        headers=headers,
    )
    assert chat_read.status_code == 200
