import uuid
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.security import get_password_hash
from app.config import settings
from app.database import set_rls_context
from app.models.access import Subscription, SubscriptionStatus
from app.models.enums import Role
from app.models.roaming import MemberRoamingAccess
from app.models.tenancy import Branch, UserBranchAccess
from app.models.user import User
from app.routers.chat import _compress_chat_image
from app.services.tenancy_service import TenancyService


def _active_subscription(user_id):
    now = datetime.now(timezone.utc)
    return Subscription(
        user_id=user_id,
        plan_name="Gold",
        start_date=now - timedelta(days=2),
        end_date=now + timedelta(days=30),
        status=SubscriptionStatus.ACTIVE,
    )


async def _add_active_subscription(db_session: AsyncSession, user_id) -> None:
    prev_user_id = db_session.info.get("rls_user_id")
    prev_role = db_session.info.get("rls_user_role")
    prev_gym_id = db_session.info.get("rls_gym_id")
    prev_branch_id = db_session.info.get("rls_branch_id")
    try:
        await set_rls_context(db_session, user_id=str(user_id), role=Role.CUSTOMER.value)
        db_session.add(_active_subscription(user_id))
        await db_session.flush()
    finally:
        await set_rls_context(
            db_session,
            user_id=prev_user_id,
            role=prev_role,
            gym_id=prev_gym_id,
            branch_id=prev_branch_id,
        )


async def _login(client: AsyncClient, email: str, password: str = "password123") -> dict[str, str]:
    response = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200
    token = response.json()["data"]["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_admin_can_list_and_read_threads_but_cannot_send(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)

    admin = User(email="admin_chat@gym.com", hashed_password=hashed, role=Role.ADMIN, full_name="Admin Chat")
    coach = User(email="coach_chat@gym.com", hashed_password=hashed, role=Role.COACH, full_name="Coach Chat")
    customer = User(email="customer_chat@gym.com", hashed_password=hashed, role=Role.CUSTOMER, full_name="Customer Chat")
    db_session.add_all([admin, coach, customer])
    await db_session.flush()
    await _add_active_subscription(db_session, customer.id)
    await db_session.commit()

    customer_headers = await _login(client, customer.email, password)
    coach_headers = await _login(client, coach.email, password)
    admin_headers = await _login(client, admin.email, password)

    create_thread = await client.post(
        f"{settings.API_V1_STR}/chat/threads",
        json={"coach_id": str(coach.id)},
        headers=customer_headers,
    )
    assert create_thread.status_code == 200
    thread_id = create_thread.json()["data"]["id"]

    first_message = await client.post(
        f"{settings.API_V1_STR}/chat/threads/{thread_id}/messages",
        json={"text_content": "hello from customer"},
        headers=customer_headers,
    )
    assert first_message.status_code == 200

    second_message = await client.post(
        f"{settings.API_V1_STR}/chat/threads/{thread_id}/messages",
        json={"text_content": "hello from coach"},
        headers=coach_headers,
    )
    assert second_message.status_code == 200

    admin_threads = await client.get(f"{settings.API_V1_STR}/chat/threads", headers=admin_headers)
    assert admin_threads.status_code == 200
    assert any(t["id"] == thread_id for t in admin_threads.json()["data"])

    admin_messages = await client.get(f"{settings.API_V1_STR}/chat/threads/{thread_id}/messages", headers=admin_headers)
    assert admin_messages.status_code == 200
    assert len(admin_messages.json()["data"]) >= 2

    admin_create = await client.post(
        f"{settings.API_V1_STR}/chat/threads",
        json={"coach_id": str(coach.id)},
        headers=admin_headers,
    )
    assert admin_create.status_code == 403

    admin_send = await client.post(
        f"{settings.API_V1_STR}/chat/threads/{thread_id}/messages",
        json={"text_content": "admin send should fail"},
        headers=admin_headers,
    )
    assert admin_send.status_code == 403

    admin_read = await client.post(f"{settings.API_V1_STR}/chat/threads/{thread_id}/read", headers=admin_headers)
    assert admin_read.status_code == 403

    admin_upload = await client.post(
        f"{settings.API_V1_STR}/chat/threads/{thread_id}/attachments",
        headers=admin_headers,
        files={"file": ("x.jpg", b"abc", "image/jpeg")},
    )
    assert admin_upload.status_code == 403


@pytest.mark.asyncio
async def test_participant_visibility_is_restricted(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)

    coach = User(email="coach_chat_acl@gym.com", hashed_password=hashed, role=Role.COACH, full_name="Coach ACL")
    customer_1 = User(email="customer1_chat_acl@gym.com", hashed_password=hashed, role=Role.CUSTOMER, full_name="Customer One")
    customer_2 = User(email="customer2_chat_acl@gym.com", hashed_password=hashed, role=Role.CUSTOMER, full_name="Customer Two")
    db_session.add_all([coach, customer_1, customer_2])
    await db_session.flush()
    await _add_active_subscription(db_session, customer_1.id)
    await _add_active_subscription(db_session, customer_2.id)
    await db_session.commit()

    customer_1_headers = await _login(client, customer_1.email, password)
    customer_2_headers = await _login(client, customer_2.email, password)

    create_thread = await client.post(
        f"{settings.API_V1_STR}/chat/threads",
        json={"coach_id": str(coach.id)},
        headers=customer_1_headers,
    )
    assert create_thread.status_code == 200
    thread_id = create_thread.json()["data"]["id"]

    forbidden_read = await client.get(
        f"{settings.API_V1_STR}/chat/threads/{thread_id}/messages",
        headers=customer_2_headers,
    )
    assert forbidden_read.status_code == 403


@pytest.mark.asyncio
async def test_customer_chat_contacts_respect_branch_scope(client: AsyncClient, db_session: AsyncSession):
    gym, branch_a = await TenancyService.ensure_default_gym_and_branch(db_session)
    branch_b = Branch(
        gym_id=gym.id,
        slug=f"chat-branch-{uuid.uuid4().hex[:6]}",
        code=f"CB-{uuid.uuid4().hex[:4].upper()}",
        name="Chat Branch B",
        display_name="Chat Branch B",
        timezone="UTC",
    )
    hashed = get_password_hash("password")
    coach_a = User(
        email="chat-branch-coach-a@gym.com",
        hashed_password=hashed,
        role=Role.COACH,
        full_name="Coach Branch A",
        is_active=True,
        gym_id=gym.id,
        home_branch_id=branch_a.id,
    )
    coach_b = User(
        email="chat-branch-coach-b@gym.com",
        hashed_password=hashed,
        role=Role.COACH,
        full_name="Coach Branch B",
        is_active=True,
        gym_id=gym.id,
        home_branch_id=branch_b.id,
    )
    customer = User(
        email="chat-branch-customer@gym.com",
        hashed_password=hashed,
        role=Role.CUSTOMER,
        full_name="Branch Customer",
        is_active=True,
        gym_id=gym.id,
        home_branch_id=branch_a.id,
    )
    db_session.add_all([branch_b, coach_a, customer])
    await db_session.flush()
    await TenancyService.ensure_user_branch_access(
        db_session,
        user_id=coach_a.id,
        gym_id=gym.id,
        branch_id=branch_a.id,
    )
    await set_rls_context(db_session, user_id="", role=Role.ADMIN.value, gym_id=gym.id, branch_id=branch_b.id)
    db_session.add(coach_b)
    await db_session.flush()
    await TenancyService.ensure_user_branch_access(
        db_session,
        user_id=coach_b.id,
        gym_id=gym.id,
        branch_id=branch_b.id,
    )
    await set_rls_context(db_session, user_id="", role=Role.ADMIN.value, gym_id=gym.id, branch_id=branch_a.id)
    await _add_active_subscription(db_session, customer.id)
    await db_session.commit()

    headers = await _login(client, customer.email, "password")
    contacts = await client.get(f"{settings.API_V1_STR}/chat/contacts", headers=headers)
    assert contacts.status_code == 200
    contact_ids = {row["id"] for row in contacts.json()["data"]}
    assert str(coach_a.id) in contact_ids
    assert str(coach_b.id) not in contact_ids


@pytest.mark.asyncio
async def test_admin_chat_endpoints_respect_branch_filter(client: AsyncClient, db_session: AsyncSession):
    gym, branch_a = await TenancyService.ensure_default_gym_and_branch(db_session)
    branch_b = Branch(
        gym_id=gym.id,
        slug=f"admin-chat-branch-{uuid.uuid4().hex[:6]}",
        code=f"AC-{uuid.uuid4().hex[:4].upper()}",
        name="Admin Chat Branch B",
        display_name="Admin Chat Branch B",
        timezone="UTC",
    )
    db_session.add(branch_b)
    await db_session.flush()
    password = "password123"
    hashed = get_password_hash(password)

    admin = User(
        email="admin-chat-branch@gym.com",
        hashed_password=hashed,
        role=Role.ADMIN,
        full_name="Admin Branch Monitor",
        is_active=True,
        gym_id=gym.id,
        home_branch_id=branch_a.id,
    )
    coach_a = User(
        email="admin-chat-coach-a@gym.com",
        hashed_password=hashed,
        role=Role.COACH,
        full_name="Admin Coach A",
        is_active=True,
        gym_id=gym.id,
        home_branch_id=branch_a.id,
    )
    coach_b = User(
        email="admin-chat-coach-b@gym.com",
        hashed_password=hashed,
        role=Role.COACH,
        full_name="Admin Coach B",
        is_active=True,
        gym_id=gym.id,
        home_branch_id=branch_b.id,
    )
    customer_a = User(
        email="admin-chat-customer-a@gym.com",
        hashed_password=hashed,
        role=Role.CUSTOMER,
        full_name="Admin Customer A",
        is_active=True,
        gym_id=gym.id,
        home_branch_id=branch_a.id,
    )
    customer_b = User(
        email="admin-chat-customer-b@gym.com",
        hashed_password=hashed,
        role=Role.CUSTOMER,
        full_name="Admin Customer B",
        is_active=True,
        gym_id=gym.id,
        home_branch_id=branch_b.id,
    )
    customer_roaming = User(
        email="admin-chat-customer-roaming@gym.com",
        hashed_password=hashed,
        role=Role.CUSTOMER,
        full_name="Admin Customer Roaming",
        is_active=True,
        gym_id=gym.id,
        home_branch_id=branch_b.id,
    )
    db_session.add_all([admin, coach_a, coach_b, customer_a, customer_b, customer_roaming])
    await db_session.flush()
    await TenancyService.ensure_user_branch_access(db_session, user_id=admin.id, gym_id=gym.id, branch_id=branch_a.id)
    await TenancyService.ensure_user_branch_access(db_session, user_id=coach_a.id, gym_id=gym.id, branch_id=branch_a.id)
    await TenancyService.ensure_user_branch_access(db_session, user_id=coach_b.id, gym_id=gym.id, branch_id=branch_b.id)
    await _add_active_subscription(db_session, customer_a.id)
    await _add_active_subscription(db_session, customer_b.id)
    await _add_active_subscription(db_session, customer_roaming.id)
    db_session.add(
        MemberRoamingAccess(
            gym_id=gym.id,
            branch_id=branch_a.id,
            member_id=customer_roaming.id,
            granted_by_user_id=admin.id,
            expires_at=datetime.now(timezone.utc) + timedelta(days=30),
        )
    )
    await db_session.commit()

    customer_a_headers = await _login(client, customer_a.email, password)
    customer_b_headers = await _login(client, customer_b.email, password)
    customer_roaming_headers = await _login(client, customer_roaming.email, password)
    admin_headers = await _login(client, admin.email, password)

    thread_a = await client.post(
        f"{settings.API_V1_STR}/chat/threads",
        json={"coach_id": str(coach_a.id)},
        headers=customer_a_headers,
    )
    assert thread_a.status_code == 200
    thread_a_id = thread_a.json()["data"]["id"]

    thread_b = await client.post(
        f"{settings.API_V1_STR}/chat/threads",
        json={"coach_id": str(coach_b.id)},
        headers=customer_b_headers,
    )
    assert thread_b.status_code == 200
    thread_b_id = thread_b.json()["data"]["id"]

    thread_roaming = await client.post(
        f"{settings.API_V1_STR}/chat/threads",
        json={"coach_id": str(coach_a.id)},
        headers=customer_roaming_headers,
    )
    assert thread_roaming.status_code == 200
    thread_roaming_id = thread_roaming.json()["data"]["id"]

    admin_threads_a = await client.get(
        f"{settings.API_V1_STR}/chat/threads",
        params={"branch_id": str(branch_a.id)},
        headers=admin_headers,
    )
    assert admin_threads_a.status_code == 200
    thread_ids_a = {row["id"] for row in admin_threads_a.json()["data"]}
    assert thread_a_id in thread_ids_a
    assert thread_b_id not in thread_ids_a
    assert thread_roaming_id in thread_ids_a

    admin_messages_ok = await client.get(
        f"{settings.API_V1_STR}/chat/threads/{thread_a_id}/messages",
        params={"branch_id": str(branch_a.id)},
        headers=admin_headers,
    )
    assert admin_messages_ok.status_code == 200

    admin_messages_hidden = await client.get(
        f"{settings.API_V1_STR}/chat/threads/{thread_b_id}/messages",
        params={"branch_id": str(branch_a.id)},
        headers=admin_headers,
    )
    assert admin_messages_hidden.status_code == 404

    admin_threads_b = await client.get(
        f"{settings.API_V1_STR}/chat/threads",
        params={"branch_id": str(branch_b.id)},
        headers=admin_headers,
    )
    assert admin_threads_b.status_code == 200
    thread_ids_b = {row["id"] for row in admin_threads_b.json()["data"]}
    assert thread_b_id in thread_ids_b
    assert thread_a_id not in thread_ids_b

    mobile_threads_a = await client.get(
        f"{settings.API_V1_STR}/mobile/chat/threads",
        params={"branch_id": str(branch_a.id)},
        headers=admin_headers,
    )
    assert mobile_threads_a.status_code == 200
    mobile_thread_ids_a = {row["id"] for row in mobile_threads_a.json()["data"]}
    assert thread_a_id in mobile_thread_ids_a
    assert thread_b_id not in mobile_thread_ids_a

    mobile_messages_hidden = await client.get(
        f"{settings.API_V1_STR}/mobile/chat/threads/{thread_b_id}/messages",
        params={"branch_id": str(branch_a.id)},
        headers=admin_headers,
    )
    assert mobile_messages_hidden.status_code == 404

    mobile_threads_b = await client.get(
        f"{settings.API_V1_STR}/mobile/chat/threads",
        params={"branch_id": str(branch_b.id)},
        headers=admin_headers,
    )
    assert mobile_threads_b.status_code == 200
    mobile_thread_ids_b = {row["id"] for row in mobile_threads_b.json()["data"]}
    assert thread_b_id in mobile_thread_ids_b


def test_compress_chat_image_reduces_large_images(tmp_path):
    image_path = tmp_path / "photo.png"
    width, height = 1800, 1400
    image = Image.new("RGB", (width, height))
    pixels = []
    for y in range(height):
        for x in range(width):
            pixels.append(((x * 17 + y * 11) % 256, (x * 7 + y * 19) % 256, (x * 13 + y * 5) % 256))
    image.putdata(pixels)
    image.save(image_path)

    compressed = _compress_chat_image(str(image_path), limit_bytes=500_000)

    assert compressed is not None
    new_name, new_size = compressed
    assert new_name.endswith(".jpg")
    assert new_size <= 500_000
    assert not image_path.exists()
    assert (tmp_path / new_name).exists()
