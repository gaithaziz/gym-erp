import uuid
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import security
from app.config import settings
from app.models.access import AccessLog, AttendanceLog, RenewalRequestStatus, Subscription, SubscriptionRenewalRequest
from app.models.chat import ChatMessage, ChatThread
from app.models.enums import Role
from app.models.finance import PaymentMethod, Transaction, TransactionCategory, TransactionType
from app.models.fitness import BiometricLog, DietPlan, WorkoutPlan
from app.models.hr import LeaveRequest, LeaveStatus, LeaveType
from app.models.lost_found import LostFoundItem, LostFoundStatus
from app.models.notification import MobileDevice, PushDeliveryLog, WhatsAppDeliveryLog
from app.models.roaming import MemberRoamingAccess
from app.models.subscription_enums import SubscriptionStatus
from app.models.support import SupportTicket, TicketCategory, TicketStatus
from app.models.tenancy import Branch, UserBranchAccess
from app.models.user import User
from app.services.push_service import PushNotificationService
from app.services.tenancy_service import TenancyService
from app.models.workout_log import WorkoutSession, WorkoutSessionEntry
from app.models.workout_log import DietFeedback, GymFeedback, WorkoutLog


async def _login(client: AsyncClient, email: str, password: str = "password123") -> dict[str, str]:
    response = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200
    token = response.json()["data"]["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_mobile_staff_members_coach_full_customer_view_and_registration(client: AsyncClient, db_session: AsyncSession):
    coach = User(
        email="coach-scope@example.com",
        hashed_password=security.get_password_hash("password123"),
        role=Role.COACH,
        full_name="Scope Coach",
        is_active=True,
    )
    customer = User(
        email="unassigned-member@example.com",
        hashed_password=security.get_password_hash("password123"),
        role=Role.CUSTOMER,
        full_name="Unassigned Member",
        is_active=True,
    )
    admin = User(
        email="admin-mobile-members@example.com",
        hashed_password=security.get_password_hash("password123"),
        role=Role.ADMIN,
        full_name="Mobile Admin",
        is_active=True,
    )
    db_session.add_all([coach, customer, admin])
    await db_session.commit()

    coach_headers = await _login(client, coach.email)
    list_response = await client.get(f"{settings.API_V1_STR}/mobile/staff/members", headers=coach_headers)
    assert list_response.status_code == 200
    coach_members = list_response.json()["data"]
    assert any(item["email"] == customer.email for item in coach_members)

    detail_response = await client.get(f"{settings.API_V1_STR}/mobile/staff/members/{customer.id}", headers=coach_headers)
    assert detail_response.status_code == 200
    assert detail_response.json()["data"]["member"]["email"] == customer.email

    admin_headers = await _login(client, admin.email)
    register_response = await client.post(
        f"{settings.API_V1_STR}/mobile/staff/members/register",
        headers=admin_headers,
        json={
            "full_name": "Registered Mobile Member",
            "email": "registered-mobile-member@example.com",
            "phone_number": "+15550009999",
            "password": "password123",
        },
    )
    assert register_response.status_code == 200
    registered = register_response.json()["data"]["member"]
    assert registered["email"] == "registered-mobile-member@example.com"
    assert registered["subscription"]["status"] == "NONE"

    duplicate_response = await client.post(
        f"{settings.API_V1_STR}/mobile/staff/members/register",
        headers=admin_headers,
        json={
            "full_name": "Duplicate Mobile Member",
            "email": "registered-mobile-member@example.com",
            "phone_number": "+15550008888",
            "password": "password123",
        },
    )
    assert duplicate_response.status_code == 400

    invalid_phone_response = await client.post(
        f"{settings.API_V1_STR}/mobile/staff/members/register",
        headers=admin_headers,
        json={
            "full_name": "Invalid Phone Member",
            "email": "invalid-phone-member@example.com",
            "phone_number": "abc-invalid",
            "password": "password123",
        },
    )
    assert invalid_phone_response.status_code == 422


@pytest.mark.asyncio
async def test_mobile_staff_member_detail_includes_session_volume(client: AsyncClient, db_session: AsyncSession):
    coach = User(
        email="coach-volume@example.com",
        hashed_password=security.get_password_hash("password123"),
        role=Role.COACH,
        full_name="Volume Coach",
        is_active=True,
    )
    member = User(
        email="member-volume@example.com",
        hashed_password=security.get_password_hash("password123"),
        role=Role.CUSTOMER,
        full_name="Volume Member",
        is_active=True,
    )
    db_session.add_all([coach, member])
    await db_session.flush()
    plan = WorkoutPlan(
        name="Volume Plan",
        creator_id=coach.id,
        member_id=member.id,
        status="PUBLISHED",
        version=1,
        expected_sessions_per_30d=12,
    )
    db_session.add(plan)
    await db_session.flush()
    session = WorkoutSession(
        member_id=member.id,
        plan_id=plan.id,
        performed_at=datetime.utcnow() - timedelta(days=1),
        duration_minutes=40,
        notes="Strong session",
    )
    db_session.add(session)
    await db_session.flush()
    db_session.add(
        WorkoutSessionEntry(
            session_id=session.id,
            exercise_name="Bench Press",
            sets_completed=3,
            reps_completed=8,
            weight_kg=100,
            pr_type="VOLUME",
            pr_value="2400 kg",
            is_pr=True,
            order=0,
        )
    )
    await db_session.commit()

    headers = await _login(client, coach.email)
    response = await client.get(f"{settings.API_V1_STR}/mobile/staff/members/{member.id}", headers=headers)
    assert response.status_code == 200
    detail = response.json()["data"]
    assert detail["recent_workout_sessions"][0]["session_volume"] == 2400.0


@pytest.mark.asyncio
async def test_mobile_staff_home_coach_uses_real_activity_not_member_summaries(client: AsyncClient, db_session: AsyncSession):
    now = datetime.utcnow()
    coach = User(
        email="coach-home-activity@example.com",
        hashed_password=security.get_password_hash("password123"),
        role=Role.COACH,
        full_name="Activity Coach",
        is_active=True,
    )
    active_member = User(
        email="active-home-member@example.com",
        hashed_password=security.get_password_hash("password123"),
        role=Role.CUSTOMER,
        full_name="Active Home Member",
        is_active=True,
    )
    quiet_member = User(
        email="quiet-home-member@example.com",
        hashed_password=security.get_password_hash("password123"),
        role=Role.CUSTOMER,
        full_name="Quiet Home Member",
        is_active=True,
    )
    db_session.add_all([coach, active_member, quiet_member])
    await db_session.flush()

    workout_plan = WorkoutPlan(
        name="Activity Strength",
        creator_id=coach.id,
        member_id=active_member.id,
        is_template=False,
        status="PUBLISHED",
        version=1,
        expected_sessions_per_30d=12,
        published_at=now - timedelta(days=2),
    )
    diet_plan = DietPlan(
        name="Activity Nutrition",
        creator_id=coach.id,
        member_id=active_member.id,
        content="Protein and vegetables",
        is_template=False,
        status="PUBLISHED",
        version=1,
        published_at=now - timedelta(days=2),
    )
    db_session.add_all([workout_plan, diet_plan])
    await db_session.flush()
    db_session.add_all(
        [
            WorkoutSession(
                member_id=active_member.id,
                plan_id=workout_plan.id,
                performed_at=now - timedelta(hours=1),
                duration_minutes=45,
            ),
            DietFeedback(
                member_id=active_member.id,
                diet_plan_id=diet_plan.id,
                coach_id=coach.id,
                rating=4,
                comment="Good adherence",
                created_at=now - timedelta(minutes=30),
            ),
        ]
    )
    await db_session.commit()

    headers = await _login(client, coach.email)
    response = await client.get(f"{settings.API_V1_STR}/mobile/staff/home", headers=headers)
    assert response.status_code == 200
    home = response.json()["data"]
    assert home["role"] == "COACH"
    assert {item["kind"] for item in home["items"]} == {"workout_session", "diet_feedback"}
    assert any(item["title"] == active_member.full_name for item in home["items"])
    assert all("email" not in item for item in home["items"])
    assert quiet_member.full_name not in {item.get("title") for item in home["items"]}


@pytest.mark.asyncio
async def test_mobile_staff_home_employee_includes_real_operational_reminders(client: AsyncClient, db_session: AsyncSession):
    now = datetime.now(timezone.utc)
    employee = User(
        email="employee-home-activity@example.com",
        hashed_password=security.get_password_hash("password123"),
        role=Role.EMPLOYEE,
        full_name="Activity Employee",
        is_active=True,
    )
    db_session.add(employee)
    await db_session.flush()
    db_session.add_all(
        [
            AttendanceLog(
                user_id=employee.id,
                check_in_time=now - timedelta(days=1, hours=8),
                check_out_time=now - timedelta(days=1),
                hours_worked=8.0,
            ),
            LeaveRequest(
                user_id=employee.id,
                start_date=(now + timedelta(days=3)).date(),
                end_date=(now + timedelta(days=4)).date(),
                leave_type=LeaveType.VACATION,
                status=LeaveStatus.PENDING,
                reason="Family trip",
            ),
            LostFoundItem(
                reporter_id=employee.id,
                assignee_id=employee.id,
                status=LostFoundStatus.UNDER_REVIEW,
                title="Locker keys",
                description="Found near reception",
                category="FOUND",
                found_date=now.date(),
                found_location="Reception",
            ),
        ]
    )
    await db_session.commit()

    headers = await _login(client, employee.email)
    response = await client.get(f"{settings.API_V1_STR}/mobile/staff/home", headers=headers)
    assert response.status_code == 200
    home = response.json()["data"]
    kinds = {item["kind"] for item in home["items"]}
    assert home["role"] == "EMPLOYEE"
    assert {"attendance", "shift_summary", "leave_request", "lost_found"}.issubset(kinds)
    assert any(item["title"] == "Locker keys" for item in home["items"])
    assert any(item["subtitle"] == "Pending" for item in home["items"])


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
    assert "qr" not in home

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
    workout_session = WorkoutSession(
        member_id=customer.id,
        plan_id=workout_plan.id,
        performed_at=(now - timedelta(days=1)).replace(tzinfo=None),
        duration_minutes=55,
        notes="Solid session",
    )
    db_session.add(workout_session)
    await db_session.flush()
    db_session.add(
        WorkoutSessionEntry(
            session_id=workout_session.id,
            exercise_name="Deadlift",
            sets_completed=3,
            reps_completed=5,
            weight_kg=140,
            is_pr=True,
            pr_type="WEIGHT",
            pr_value="140kg x 5",
            pr_notes="First clean set at this weight",
            order=0,
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
    assert progress["recent_workout_sessions"][0]["session_volume"] == 2100.0
    assert progress["workout_stats"][0]["workouts"] == 1
    assert progress["personal_records"][0]["exercise_name"] == "Deadlift"
    assert progress["personal_records"][0]["pr_value"] == "140kg x 5"
    assert progress["personal_records"][0]["entry_volume"] == 2100.0


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
async def test_mobile_customer_scan_session_flow(client: AsyncClient, db_session: AsyncSession):
    now = datetime.now(timezone.utc)
    active_customer = User(
        email="customer-scan-active@example.com",
        hashed_password=security.get_password_hash("password123"),
        role=Role.CUSTOMER,
        full_name="Active Scanner",
        is_active=True,
    )
    expired_customer = User(
        email="customer-scan-expired@example.com",
        hashed_password=security.get_password_hash("password123"),
        role=Role.CUSTOMER,
        full_name="Expired Scanner",
        is_active=True,
    )
    db_session.add_all([active_customer, expired_customer])
    await db_session.flush()
    db_session.add_all(
        [
            Subscription(
                user_id=active_customer.id,
                plan_name="Monthly",
                start_date=now - timedelta(days=3),
                end_date=now + timedelta(days=27),
                status=SubscriptionStatus.ACTIVE,
            ),
            Subscription(
                user_id=expired_customer.id,
                plan_name="Monthly",
                start_date=now - timedelta(days=60),
                end_date=now - timedelta(days=1),
                status=SubscriptionStatus.EXPIRED,
            ),
        ]
    )
    await db_session.commit()

    active_headers = await _login(client, active_customer.email)
    first_scan = await client.post(
        f"{settings.API_V1_STR}/access/scan-session",
        headers=active_headers,
        json={"kiosk_id": "front-door-01"},
    )
    assert first_scan.status_code == 200
    first_data = first_scan.json()["data"]
    assert first_data["status"] == "GRANTED"
    assert first_data["kiosk_id"] == "front-door-01"
    assert first_data["scan_time"]

    expired_headers = await _login(client, expired_customer.email)
    denied_scan = await client.post(
        f"{settings.API_V1_STR}/access/scan-session",
        headers=expired_headers,
        json={"kiosk_id": "front-door-02"},
    )
    assert denied_scan.status_code == 200
    denied_data = denied_scan.json()["data"]
    assert denied_data["status"] == "DENIED"
    assert denied_data["reason"] == "SUBSCRIPTION_EXPIRED"
    assert denied_data["kiosk_id"] == "front-door-02"


@pytest.mark.asyncio
async def test_mobile_customer_write_flows(client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch):
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

    profile_get = await client.get(f"{settings.API_V1_STR}/mobile/customer/profile", headers=headers)
    assert profile_get.status_code == 200
    assert profile_get.json()["data"]["email"] == customer.email

    profile_put = await client.put(
        f"{settings.API_V1_STR}/mobile/customer/profile",
        headers=headers,
        json={
            "full_name": "Updated Customer",
            "phone_number": "+15551234567",
            "bio": "Member profile from mobile",
        },
    )
    assert profile_put.status_code == 200
    assert profile_put.json()["data"]["full_name"] == "Updated Customer"
    assert profile_put.json()["data"]["phone_number"] == "+15551234567"

    password_put = await client.put(
        f"{settings.API_V1_STR}/mobile/customer/profile/password",
        headers=headers,
        json={"current_password": "password123", "new_password": "password456"},
    )
    assert password_put.status_code == 200

    headers = await _login(client, customer.email, "password456")

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

    device_payload = {"device_token": "ExponentPushToken[test-mobile-device]", "platform": "ios", "device_name": "iPhone Test"}
    device_register = await client.post(f"{settings.API_V1_STR}/mobile/devices/register", headers=headers, json=device_payload)
    assert device_register.status_code == 200
    assert device_register.json()["data"]["registered"] is True
    device = (
        await db_session.execute(select(MobileDevice).where(MobileDevice.device_token == device_payload["device_token"]))
    ).scalar_one_or_none()
    assert device is not None
    assert device.is_active is True

    device_unregister = await client.post(f"{settings.API_V1_STR}/mobile/devices/unregister", headers=headers, json=device_payload)
    assert device_unregister.status_code == 200
    assert device_unregister.json()["data"]["registered"] is False
    await db_session.refresh(device)
    assert device.is_active is False

    monkeypatch.setattr(settings, "PUSH_ENABLED", True)
    monkeypatch.setattr(settings, "PUSH_DRY_RUN", True)
    device_register_again = await client.post(f"{settings.API_V1_STR}/mobile/devices/register", headers=headers, json=device_payload)
    assert device_register_again.status_code == 200
    await PushNotificationService.queue_and_send(
        db=db_session,
        user=customer,
        title="Support replied",
        body="We replied to your support ticket.",
        template_key="support_reply",
        event_type="SUPPORT_REPLY",
        event_ref="test-support-ref",
        params={"message": "We replied to your support ticket."},
        idempotency_key=f"test-push:{customer.id}",
    )
    push_log = (
        await db_session.execute(select(PushDeliveryLog).where(PushDeliveryLog.event_type == "SUPPORT_REPLY"))
    ).scalar_one()
    assert push_log.status == "SENT"
    assert push_log.provider_message_id == "dry-run"

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

    profile_picture = await client.post(
        f"{settings.API_V1_STR}/mobile/customer/profile/picture",
        headers=headers,
        files={"file": ("avatar.png", b"fake-image-content", "image/png")},
    )
    assert profile_picture.status_code == 200
    assert profile_picture.json()["data"]["profile_picture_url"].startswith("/static/profiles/")

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

    support_attachment = await client.post(
        f"{settings.API_V1_STR}/mobile/customer/support/tickets/{ticket_id}/attachments",
        headers=headers,
        data={"message": "Photo attached"},
        files={"file": ("issue.png", b"ticket-image", "image/png")},
    )
    assert support_attachment.status_code == 200
    assert support_attachment.json()["data"]["media_url"].startswith("/static/support_media/")

    lost_found_create = await client.post(
        f"{settings.API_V1_STR}/mobile/customer/lost-found/items",
        headers=headers,
        json={
            "title": "Water Bottle",
            "description": "Black bottle left near treadmill",
            "category": "LOST",
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

    lost_found_media = await client.post(
        f"{settings.API_V1_STR}/mobile/customer/lost-found/items/{lost_found_item_id}/media",
        headers=headers,
        files={"file": ("bottle.png", b"lost-found-image", "image/png")},
    )
    assert lost_found_media.status_code == 200
    assert lost_found_media.json()["data"]["media_url"].startswith("/static/lost_found_media/")

    thread_create = await client.post(
        f"{settings.API_V1_STR}/mobile/customer/chat/threads",
        headers=headers,
        json={"coach_id": str(coach.id)},
    )
    assert thread_create.status_code == 200
    thread_id = thread_create.json()["data"]["id"]

    relevant_coaches = await client.get(
        f"{settings.API_V1_STR}/mobile/customer/chat/coaches",
        headers=headers,
    )
    assert relevant_coaches.status_code == 200
    assert relevant_coaches.json()["data"][0]["id"] == str(coach.id)

    chat_send = await client.post(
        f"{settings.API_V1_STR}/mobile/customer/chat/threads/{thread_id}/messages",
        headers=headers,
        json={"text_content": "Hi coach"},
    )
    assert chat_send.status_code == 200


@pytest.mark.asyncio
async def test_mobile_branch_filters_and_roaming_access_flow(client: AsyncClient, db_session: AsyncSession):
    now = datetime.now(timezone.utc)
    gym, branch_a = await TenancyService.ensure_default_gym_and_branch(db_session)
    branch_b = Branch(
        gym_id=gym.id,
        slug=f"branch-{uuid.uuid4().hex[:6]}",
        code=f"B-{uuid.uuid4().hex[:4].upper()}",
        name="Branch B",
        display_name="Branch B",
        timezone="UTC",
    )
    db_session.add(branch_b)
    await db_session.flush()

    admin = User(
        email=f"mobile-branch-admin-{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=security.get_password_hash("password123"),
        role=Role.ADMIN,
        full_name="Branch Admin",
        gym_id=gym.id,
        home_branch_id=branch_a.id,
        is_active=True,
    )
    member_a = User(
        email=f"member-a-{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=security.get_password_hash("password123"),
        role=Role.CUSTOMER,
        full_name="Member A",
        gym_id=gym.id,
        home_branch_id=branch_a.id,
        is_active=True,
    )
    member_b = User(
        email=f"member-b-{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=security.get_password_hash("password123"),
        role=Role.CUSTOMER,
        full_name="Member B",
        gym_id=gym.id,
        home_branch_id=branch_b.id,
        is_active=True,
    )
    db_session.add_all([admin, member_a, member_b])
    await db_session.flush()

    db_session.add_all(
        [
            UserBranchAccess(user_id=admin.id, gym_id=gym.id, branch_id=branch_a.id),
            UserBranchAccess(user_id=admin.id, gym_id=gym.id, branch_id=branch_b.id),
            Subscription(
                user_id=member_b.id,
                plan_name="Monthly",
                start_date=now - timedelta(days=1),
                end_date=now + timedelta(days=30),
                status=SubscriptionStatus.ACTIVE,
                gym_id=gym.id,
            ),
        ]
    )
    await db_session.commit()

    headers = await _login(client, admin.email)

    members_a = await client.get(
        f"{settings.API_V1_STR}/mobile/staff/members",
        headers=headers,
        params={"branch_id": str(branch_a.id)},
    )
    assert members_a.status_code == 200
    emails_a = {item["email"] for item in members_a.json()["data"]}
    assert member_a.email in emails_a
    assert member_b.email not in emails_a

    members_b = await client.get(
        f"{settings.API_V1_STR}/mobile/staff/members",
        headers=headers,
        params={"branch_id": str(branch_b.id)},
    )
    assert members_b.status_code == 200
    emails_b = {item["email"] for item in members_b.json()["data"]}
    assert member_b.email in emails_b
    assert member_a.email not in emails_b

    denied_before_roaming = await client.get(
        f"{settings.API_V1_STR}/mobile/staff/members/{member_b.id}",
        headers=headers,
        params={"branch_id": str(branch_a.id)},
    )
    assert denied_before_roaming.status_code == 404

    check_in = await client.post(
        f"{settings.API_V1_STR}/mobile/staff/check-in/process",
        headers=headers,
        json={
            "member_id": str(member_b.id),
            "kiosk_id": "front-a-01",
            "branch_id": str(branch_a.id),
        },
    )
    assert check_in.status_code == 200
    grant = (
        await db_session.execute(
            select(MemberRoamingAccess).where(
                MemberRoamingAccess.member_id == member_b.id,
                MemberRoamingAccess.branch_id == branch_a.id,
            )
        )
    ).scalar_one_or_none()
    assert grant is not None
    assert grant.revoked_at is None
    assert grant.expires_at > now

    allowed_after_roaming = await client.get(
        f"{settings.API_V1_STR}/mobile/staff/members/{member_b.id}",
        headers=headers,
        params={"branch_id": str(branch_a.id)},
    )
    assert allowed_after_roaming.status_code == 200
    assert allowed_after_roaming.json()["data"]["member"]["email"] == member_b.email

    grant.expires_at = now - timedelta(minutes=1)
    await db_session.commit()

    denied_after_expiry = await client.get(
        f"{settings.API_V1_STR}/mobile/staff/members/{member_b.id}",
        headers=headers,
        params={"branch_id": str(branch_a.id)},
    )
    assert denied_after_expiry.status_code == 404


@pytest.mark.asyncio
async def test_branch_scoped_push_skips_branch_ineligible_recipients(db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch):
    gym, branch_a = await TenancyService.ensure_default_gym_and_branch(db_session)
    branch_b = Branch(
        gym_id=gym.id,
        slug=f"push-{uuid.uuid4().hex[:6]}",
        code=f"P-{uuid.uuid4().hex[:4].upper()}",
        name="Push Branch B",
        display_name="Push Branch B",
        timezone="UTC",
    )
    db_session.add(branch_b)
    await db_session.flush()

    eligible = User(
        email=f"push-eligible-{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=security.get_password_hash("password123"),
        role=Role.MANAGER,
        full_name="Eligible",
        gym_id=gym.id,
        home_branch_id=branch_a.id,
        is_active=True,
    )
    ineligible = User(
        email=f"push-ineligible-{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=security.get_password_hash("password123"),
        role=Role.MANAGER,
        full_name="Ineligible",
        gym_id=gym.id,
        home_branch_id=branch_b.id,
        is_active=True,
    )
    db_session.add_all([eligible, ineligible])
    await db_session.flush()
    db_session.add_all(
        [
            MobileDevice(user_id=eligible.id, device_token="ExponentPushToken[eligible]", platform="ios", is_active=True),
            MobileDevice(user_id=ineligible.id, device_token="ExponentPushToken[ineligible]", platform="ios", is_active=True),
        ]
    )
    await db_session.commit()

    monkeypatch.setattr(settings, "PUSH_ENABLED", True)
    monkeypatch.setattr(settings, "PUSH_DRY_RUN", True)

    await PushNotificationService.queue_and_send(
        db=db_session,
        user=eligible,
        title="Branch event",
        body="Eligible user should receive this",
        template_key="support_ticket",
        event_type="SUPPORT_TICKET_CREATED",
        event_ref=str(uuid.uuid4()),
        params={},
        idempotency_key=f"push-eligible-{uuid.uuid4()}",
        scope="BRANCH",
        scope_branch_id=str(branch_a.id),
    )
    await PushNotificationService.queue_and_send(
        db=db_session,
        user=ineligible,
        title="Branch event",
        body="Ineligible user should be skipped",
        template_key="support_ticket",
        event_type="SUPPORT_TICKET_CREATED",
        event_ref=str(uuid.uuid4()),
        params={},
        idempotency_key=f"push-ineligible-{uuid.uuid4()}",
        scope="BRANCH",
        scope_branch_id=str(branch_a.id),
    )

    logs = (
        await db_session.execute(
            select(PushDeliveryLog).order_by(PushDeliveryLog.created_at.desc()).limit(4)
        )
    ).scalars().all()
    sent_logs = [log for log in logs if log.user_id == eligible.id]
    skipped_logs = [log for log in logs if log.user_id == ineligible.id]
    assert any(log.status == "SENT" for log in sent_logs)
    assert any(log.status == "SKIPPED" and "branch-scoped" in (log.error_message or "") for log in skipped_logs)


@pytest.mark.asyncio
async def test_mobile_support_and_lost_found_respect_branch_filters(client: AsyncClient, db_session: AsyncSession):
    now = datetime.now(timezone.utc)
    gym, branch_a = await TenancyService.ensure_default_gym_and_branch(db_session)
    branch_b = Branch(
        gym_id=gym.id,
        slug=f"ops-{uuid.uuid4().hex[:6]}",
        code=f"O-{uuid.uuid4().hex[:4].upper()}",
        name="Ops Branch B",
        display_name="Ops Branch B",
        timezone="UTC",
    )
    admin = User(
        email=f"mobile-admin-{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=security.get_password_hash("password123"),
        role=Role.ADMIN,
        full_name="Admin",
        gym_id=gym.id,
        home_branch_id=branch_a.id,
        is_active=True,
    )
    customer = User(
        email=f"mobile-customer-{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=security.get_password_hash("password123"),
        role=Role.CUSTOMER,
        full_name="Customer",
        gym_id=gym.id,
        home_branch_id=branch_a.id,
        is_active=True,
    )
    db_session.add_all([branch_b, admin, customer])
    await db_session.flush()
    db_session.add_all(
        [
            UserBranchAccess(user_id=admin.id, gym_id=gym.id, branch_id=branch_a.id),
            UserBranchAccess(user_id=admin.id, gym_id=gym.id, branch_id=branch_b.id),
            SupportTicket(
                customer_id=customer.id,
                subject="A ticket",
                category=TicketCategory.GENERAL,
                status=TicketStatus.OPEN,
                created_at=now,
                updated_at=now,
                gym_id=gym.id,
                branch_id=branch_a.id,
            ),
            SupportTicket(
                customer_id=customer.id,
                subject="B ticket",
                category=TicketCategory.GENERAL,
                status=TicketStatus.OPEN,
                created_at=now,
                updated_at=now,
                gym_id=gym.id,
                branch_id=branch_b.id,
            ),
            LostFoundItem(
                reporter_id=customer.id,
                assignee_id=None,
                status=LostFoundStatus.REPORTED,
                title="A item",
                description="A",
                category="personal",
                created_at=now,
                updated_at=now,
                gym_id=gym.id,
                branch_id=branch_a.id,
            ),
            LostFoundItem(
                reporter_id=customer.id,
                assignee_id=None,
                status=LostFoundStatus.REPORTED,
                title="B item",
                description="B",
                category="personal",
                created_at=now,
                updated_at=now,
                gym_id=gym.id,
                branch_id=branch_b.id,
            ),
        ]
    )
    await db_session.commit()

    headers = await _login(client, admin.email)
    support_a = await client.get(
        f"{settings.API_V1_STR}/mobile/support/tickets",
        headers=headers,
        params={"branch_id": str(branch_a.id)},
    )
    assert support_a.status_code == 200
    subjects = {row["subject"] for row in support_a.json()["data"]}
    assert "A ticket" in subjects
    assert "B ticket" not in subjects

    support_b = await client.get(
        f"{settings.API_V1_STR}/mobile/support/tickets",
        headers=headers,
        params={"branch_id": str(branch_b.id)},
    )
    assert support_b.status_code == 200
    subjects_b = {row["subject"] for row in support_b.json()["data"]}
    assert "B ticket" in subjects_b
    assert "A ticket" not in subjects_b

    lost_a = await client.get(
        f"{settings.API_V1_STR}/mobile/lost-found/items",
        headers=headers,
        params={"branch_id": str(branch_a.id)},
    )
    assert lost_a.status_code == 200
    titles_a = {row["title"] for row in lost_a.json()["data"]}
    assert "A item" in titles_a
    assert "B item" not in titles_a
@pytest.mark.asyncio
async def test_mobile_coach_feedback_includes_only_assigned_flagged_sessions(client: AsyncClient, db_session: AsyncSession):
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    coach = User(
        email="coach-flagged-feedback@example.com",
        hashed_password=security.get_password_hash("password123"),
        role=Role.COACH,
        full_name="Flagged Coach",
        is_active=True,
    )
    other_coach = User(
        email="other-flagged-feedback@example.com",
        hashed_password=security.get_password_hash("password123"),
        role=Role.COACH,
        full_name="Other Flagged Coach",
        is_active=True,
    )
    admin = User(
        email="admin-flagged-feedback@example.com",
        hashed_password=security.get_password_hash("password123"),
        role=Role.ADMIN,
        full_name="Flagged Admin",
        is_active=True,
    )
    manager = User(
        email="manager-flagged-feedback@example.com",
        hashed_password=security.get_password_hash("password123"),
        role=Role.MANAGER,
        full_name="Flagged Manager",
        is_active=True,
    )
    customer = User(
        email="customer-flagged-feedback@example.com",
        hashed_password=security.get_password_hash("password123"),
        role=Role.CUSTOMER,
        full_name="Flagged Member",
        is_active=True,
    )
    db_session.add_all([coach, other_coach, admin, manager, customer])
    await db_session.flush()

    own_plan = WorkoutPlan(
        name="Own Flagged Plan",
        creator_id=coach.id,
        member_id=customer.id,
        is_template=False,
        status="PUBLISHED",
        version=1,
        published_at=now - timedelta(days=2),
    )
    other_plan = WorkoutPlan(
        name="Other Flagged Plan",
        creator_id=other_coach.id,
        member_id=customer.id,
        is_template=False,
        status="PUBLISHED",
        version=1,
        published_at=now - timedelta(days=2),
    )
    db_session.add_all([own_plan, other_plan])
    await db_session.flush()

    own_session = WorkoutSession(
        member_id=customer.id,
        plan_id=own_plan.id,
        performed_at=now - timedelta(hours=2),
        duration_minutes=50,
        notes="Pain during last set",
        rpe=9,
        pain_level=5,
        effort_feedback="TOO_HARD",
        attachment_url=f"/static/workout_session_media/{customer.id}/squat.jpg",
        attachment_mime="image/jpeg",
    )
    other_session = WorkoutSession(
        member_id=customer.id,
        plan_id=other_plan.id,
        performed_at=now - timedelta(hours=1),
        duration_minutes=45,
        pain_level=6,
        effort_feedback="TOO_HARD",
    )
    db_session.add_all([own_session, other_session])
    await db_session.flush()
    db_session.add_all(
        [
            WorkoutSessionEntry(
                session_id=own_session.id,
                exercise_name="Squat",
                sets_completed=3,
                reps_completed=5,
                weight_kg=100,
                skipped=False,
                is_pr=True,
                order=0,
            ),
            WorkoutSessionEntry(
                session_id=other_session.id,
                exercise_name="Bench",
                sets_completed=3,
                reps_completed=8,
                weight_kg=80,
                skipped=False,
                order=0,
            ),
        ]
    )
    await db_session.commit()

    headers = await _login(client, coach.email)
    response = await client.get(f"{settings.API_V1_STR}/mobile/staff/coach/feedback", headers=headers)

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["stats"]["flagged_sessions"] == 1
    assert data["flagged_sessions"][0]["plan_name"] == "Own Flagged Plan"
    assert data["flagged_sessions"][0]["member_name"] == "Flagged Member"
    assert data["flagged_sessions"][0]["pain_level"] == 5
    assert data["flagged_sessions"][0]["pr_count"] == 1

    admin_headers = await _login(client, admin.email)
    admin_response = await client.get(f"{settings.API_V1_STR}/mobile/staff/coach/feedback", headers=admin_headers)
    assert admin_response.status_code == 200
    assert admin_response.json()["data"]["stats"]["flagged_sessions"] == 2

    manager_headers = await _login(client, manager.email)
    manager_response = await client.get(f"{settings.API_V1_STR}/mobile/staff/coach/feedback", headers=manager_headers)
    assert manager_response.status_code == 200
    assert manager_response.json()["data"]["stats"]["flagged_sessions"] == 2

    manager_review_response = await client.post(
        f"{settings.API_V1_STR}/fitness/session-logs/{own_session.id}/review",
        json={"reviewed": True, "reviewer_note": "Manager cannot close"},
        headers=manager_headers,
    )
    assert manager_review_response.status_code == 403

    review_response = await client.post(
        f"{settings.API_V1_STR}/fitness/session-logs/{own_session.id}/review",
        json={"reviewed": True, "reviewer_note": "Handled in chat"},
        headers=headers,
    )
    assert review_response.status_code == 200
    assert review_response.json()["data"]["review_status"] == "REVIEWED"
    assert review_response.json()["data"]["reviewer_note"] == "Handled in chat"

    reviewed_queue = await client.get(f"{settings.API_V1_STR}/mobile/staff/coach/feedback", headers=headers)
    assert reviewed_queue.status_code == 200
    assert reviewed_queue.json()["data"]["stats"]["flagged_sessions"] == 0
