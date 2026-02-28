from datetime import datetime, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.security import get_password_hash
from app.config import settings
from app.models.enums import Role
from app.models.user import User


async def _login(client: AsyncClient, email: str, password: str = "password123") -> dict[str, str]:
    response = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200
    token = response.json()["data"]["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_all_roles_can_create_report(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    roles = [
        Role.ADMIN,
        Role.MANAGER,
        Role.FRONT_DESK,
        Role.RECEPTION,
        Role.COACH,
        Role.EMPLOYEE,
        Role.CASHIER,
        Role.CUSTOMER,
    ]

    users: list[User] = []
    for idx, role in enumerate(roles):
        users.append(
            User(
                email=f"lostfound_{role.value.lower()}_{idx}@gym.com",
                hashed_password=hashed,
                role=role,
                full_name=f"{role.value} User",
                is_active=True,
            )
        )
    db_session.add_all(users)
    await db_session.commit()

    for user in users:
        headers = await _login(client, user.email, password)
        response = await client.post(
            f"{settings.API_V1_STR}/lost-found/items",
            headers=headers,
            json={
                "title": "Blue bottle",
                "description": "Found near cardio section",
                "category": "Accessories",
            },
        )
        assert response.status_code == 200
        assert response.json()["data"]["reporter"]["id"] == str(user.id)


@pytest.mark.asyncio
async def test_visibility_and_handler_filters(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    admin = User(email="admin_lf@gym.com", hashed_password=hashed, role=Role.ADMIN, full_name="Admin LF")
    reception = User(email="reception_lf@gym.com", hashed_password=hashed, role=Role.RECEPTION, full_name="Reception LF")
    front_desk = User(email="frontdesk_lf@gym.com", hashed_password=hashed, role=Role.FRONT_DESK, full_name="Front Desk LF")
    customer_a = User(email="customer_a_lf@gym.com", hashed_password=hashed, role=Role.CUSTOMER, full_name="Customer A")
    customer_b = User(email="customer_b_lf@gym.com", hashed_password=hashed, role=Role.CUSTOMER, full_name="Customer B")
    db_session.add_all([admin, reception, front_desk, customer_a, customer_b])
    await db_session.commit()

    headers_admin = await _login(client, admin.email, password)
    headers_customer_a = await _login(client, customer_a.email, password)
    headers_customer_b = await _login(client, customer_b.email, password)

    create_a = await client.post(
        f"{settings.API_V1_STR}/lost-found/items",
        headers=headers_customer_a,
        json={"title": "Headphones", "description": "Black case", "category": "Electronics"},
    )
    create_b = await client.post(
        f"{settings.API_V1_STR}/lost-found/items",
        headers=headers_customer_b,
        json={"title": "Water bottle", "description": "Green", "category": "Accessories"},
    )
    assert create_a.status_code == 200
    assert create_b.status_code == 200
    item_a = create_a.json()["data"]["id"]

    list_a = await client.get(f"{settings.API_V1_STR}/lost-found/items", headers=headers_customer_a)
    assert list_a.status_code == 200
    assert len(list_a.json()["data"]) == 1
    assert list_a.json()["data"][0]["id"] == item_a

    list_admin = await client.get(f"{settings.API_V1_STR}/lost-found/items", headers=headers_admin)
    assert list_admin.status_code == 200
    assert len(list_admin.json()["data"]) >= 2

    summary_reception = await client.get(
        f"{settings.API_V1_STR}/lost-found/summary",
        headers=await _login(client, reception.email, password),
    )
    assert summary_reception.status_code == 200
    assert summary_reception.json()["data"]["reported"] >= 2

    summary_front_desk = await client.get(
        f"{settings.API_V1_STR}/lost-found/summary",
        headers=await _login(client, front_desk.email, password),
    )
    assert summary_front_desk.status_code == 403


@pytest.mark.asyncio
async def test_status_assign_and_acl(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    admin = User(email="admin_status_lf@gym.com", hashed_password=hashed, role=Role.ADMIN, full_name="Admin")
    reception = User(email="reception_status_lf@gym.com", hashed_password=hashed, role=Role.RECEPTION, full_name="Reception")
    front_desk = User(email="fd_status_lf@gym.com", hashed_password=hashed, role=Role.FRONT_DESK, full_name="FD")
    reporter = User(email="reporter_status_lf@gym.com", hashed_password=hashed, role=Role.CUSTOMER, full_name="Reporter")
    other = User(email="other_status_lf@gym.com", hashed_password=hashed, role=Role.CUSTOMER, full_name="Other")
    db_session.add_all([admin, reception, front_desk, reporter, other])
    await db_session.commit()

    admin_headers = await _login(client, admin.email, password)
    reception_headers = await _login(client, reception.email, password)
    front_desk_headers = await _login(client, front_desk.email, password)
    reporter_headers = await _login(client, reporter.email, password)
    other_headers = await _login(client, other.email, password)

    create = await client.post(
        f"{settings.API_V1_STR}/lost-found/items",
        headers=reporter_headers,
        json={"title": "Locker key", "description": "Key with red ring", "category": "Keys"},
    )
    assert create.status_code == 200
    item_id = create.json()["data"]["id"]

    forbidden_status = await client.post(
        f"{settings.API_V1_STR}/lost-found/items/{item_id}/status",
        headers=reporter_headers,
        json={"status": "UNDER_REVIEW"},
    )
    assert forbidden_status.status_code == 403

    forbidden_status_fd = await client.post(
        f"{settings.API_V1_STR}/lost-found/items/{item_id}/status",
        headers=front_desk_headers,
        json={"status": "UNDER_REVIEW"},
    )
    assert forbidden_status_fd.status_code == 403

    assign = await client.post(
        f"{settings.API_V1_STR}/lost-found/items/{item_id}/assign",
        headers=admin_headers,
        json={"assignee_id": str(reception.id)},
    )
    assert assign.status_code == 200
    assert assign.json()["data"]["assignee"]["id"] == str(reception.id)

    invalid_assign = await client.post(
        f"{settings.API_V1_STR}/lost-found/items/{item_id}/assign",
        headers=admin_headers,
        json={"assignee_id": str(front_desk.id)},
    )
    assert invalid_assign.status_code == 400

    to_under_review = await client.post(
        f"{settings.API_V1_STR}/lost-found/items/{item_id}/status",
        headers=reception_headers,
        json={"status": "UNDER_REVIEW", "note": "Checking CCTV"},
    )
    assert to_under_review.status_code == 200

    invalid_transition = await client.post(
        f"{settings.API_V1_STR}/lost-found/items/{item_id}/status",
        headers=admin_headers,
        json={"status": "CLOSED"},
    )
    assert invalid_transition.status_code == 400

    to_ready = await client.post(
        f"{settings.API_V1_STR}/lost-found/items/{item_id}/status",
        headers=admin_headers,
        json={"status": "READY_FOR_PICKUP"},
    )
    assert to_ready.status_code == 200

    to_closed = await client.post(
        f"{settings.API_V1_STR}/lost-found/items/{item_id}/status",
        headers=admin_headers,
        json={"status": "CLOSED"},
    )
    assert to_closed.status_code == 200
    assert to_closed.json()["data"]["closed_at"] is not None

    forbidden_view = await client.get(
        f"{settings.API_V1_STR}/lost-found/items/{item_id}",
        headers=other_headers,
    )
    assert forbidden_view.status_code == 404


@pytest.mark.asyncio
async def test_comments_and_media_validation(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    admin = User(email="admin_media_lf@gym.com", hashed_password=hashed, role=Role.ADMIN, full_name="Admin")
    reporter = User(email="reporter_media_lf@gym.com", hashed_password=hashed, role=Role.CUSTOMER, full_name="Reporter")
    viewer = User(email="viewer_media_lf@gym.com", hashed_password=hashed, role=Role.CUSTOMER, full_name="Viewer")
    db_session.add_all([admin, reporter, viewer])
    await db_session.commit()

    admin_headers = await _login(client, admin.email, password)
    reporter_headers = await _login(client, reporter.email, password)
    viewer_headers = await _login(client, viewer.email, password)

    create = await client.post(
        f"{settings.API_V1_STR}/lost-found/items",
        headers=reporter_headers,
        json={"title": "Gym bag", "description": "Blue, small", "category": "Bags"},
    )
    assert create.status_code == 200
    item_id = create.json()["data"]["id"]

    comment = await client.post(
        f"{settings.API_V1_STR}/lost-found/items/{item_id}/comments",
        headers=reporter_headers,
        json={"text": "I can identify contents if needed"},
    )
    assert comment.status_code == 200

    comment_admin = await client.post(
        f"{settings.API_V1_STR}/lost-found/items/{item_id}/comments",
        headers=admin_headers,
        json={"text": "Will verify with camera feed"},
    )
    assert comment_admin.status_code == 200

    bad_media = await client.post(
        f"{settings.API_V1_STR}/lost-found/items/{item_id}/media",
        headers=reporter_headers,
        files={"file": ("note.txt", b"plain text", "text/plain")},
    )
    assert bad_media.status_code == 400

    ok_media = await client.post(
        f"{settings.API_V1_STR}/lost-found/items/{item_id}/media",
        headers=reporter_headers,
        files={"file": ("photo.jpg", b"\xff\xd8\xff\xd9", "image/jpeg")},
    )
    assert ok_media.status_code == 200
    assert ok_media.json()["data"]["media_mime"] == "image/jpeg"

    await client.post(
        f"{settings.API_V1_STR}/lost-found/items/{item_id}/status",
        headers=admin_headers,
        json={"status": "UNDER_REVIEW"},
    )
    await client.post(
        f"{settings.API_V1_STR}/lost-found/items/{item_id}/status",
        headers=admin_headers,
        json={"status": "READY_FOR_PICKUP"},
    )
    await client.post(
        f"{settings.API_V1_STR}/lost-found/items/{item_id}/status",
        headers=admin_headers,
        json={"status": "CLOSED"},
    )

    closed_media = await client.post(
        f"{settings.API_V1_STR}/lost-found/items/{item_id}/media",
        headers=reporter_headers,
        files={"file": ("photo2.jpg", b"\xff\xd8\xff\xd9", "image/jpeg")},
    )
    assert closed_media.status_code == 400

    handler_media = await client.post(
        f"{settings.API_V1_STR}/lost-found/items/{item_id}/media",
        headers=admin_headers,
        files={"file": ("photo3.jpg", b"\xff\xd8\xff\xd9", "image/jpeg")},
    )
    assert handler_media.status_code == 200

    viewer_comment = await client.post(
        f"{settings.API_V1_STR}/lost-found/items/{item_id}/comments",
        headers=viewer_headers,
        json={"text": "I think this is mine"},
    )
    assert viewer_comment.status_code == 404
