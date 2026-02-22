from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.security import get_password_hash
from app.config import settings
from app.models.access import Subscription, SubscriptionStatus
from app.models.enums import Role
from app.models.user import User


def _active_subscription(user_id):
    now = datetime.now(timezone.utc)
    return Subscription(
        user_id=user_id,
        plan_name="Gold",
        start_date=now - timedelta(days=2),
        end_date=now + timedelta(days=30),
        status=SubscriptionStatus.ACTIVE,
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
    db_session.add(_active_subscription(customer.id))
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
    db_session.add_all([_active_subscription(customer_1.id), _active_subscription(customer_2.id)])
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
