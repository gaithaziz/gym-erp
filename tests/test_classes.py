from datetime import datetime, timedelta, timezone

import pytest
from app.auth.security import get_password_hash
from app.models.enums import Role
from app.models.user import User


async def _create_user(db_session, *, email: str, full_name: str, role: Role, password: str = "password") -> User:
    user = User(
        email=email,
        hashed_password=get_password_hash(password),
        full_name=full_name,
        role=role,
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


async def _auth_headers(client, *, email: str, password: str = "password") -> dict[str, str]:
    response = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    token = response.json()["data"]["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_create_session_rejects_overlapping_coach_booking(client, db_session):
    admin = await _create_user(db_session, email="classes-admin@test.com", full_name="Classes Admin", role=Role.ADMIN)
    coach = await _create_user(db_session, email="classes-coach@test.com", full_name="Classes Coach", role=Role.COACH)

    headers = await _auth_headers(client, email=admin.email)
    starts_at = datetime.now(timezone.utc).replace(second=0, microsecond=0) + timedelta(days=1)

    first_response = await client.post(
        "/api/v1/classes/sessions",
        headers=headers,
        json={
            "template_name": "Strength Basics",
            "template_duration_minutes": 60,
            "template_capacity": 16,
            "coach_id": str(coach.id),
            "session_name": "Morning Strength",
            "starts_at": starts_at.isoformat(),
        },
    )
    assert first_response.status_code == 201

    overlapping_response = await client.post(
        "/api/v1/classes/sessions",
        headers=headers,
        json={
            "template_name": "Strength Basics",
            "template_duration_minutes": 60,
            "template_capacity": 16,
            "coach_id": str(coach.id),
            "session_name": "Conflict Session",
            "starts_at": (starts_at + timedelta(minutes=30)).isoformat(),
        },
    )

    assert overlapping_response.status_code == 409
    assert overlapping_response.json()["detail"] == "This coach already has another class scheduled during that time"


@pytest.mark.asyncio
async def test_update_session_rejects_overlapping_coach_booking(client, db_session):
    admin = await _create_user(db_session, email="classes-admin-2@test.com", full_name="Classes Admin 2", role=Role.ADMIN)
    coach = await _create_user(db_session, email="classes-coach-2@test.com", full_name="Classes Coach 2", role=Role.COACH)

    headers = await _auth_headers(client, email=admin.email)
    base_start = datetime.now(timezone.utc).replace(second=0, microsecond=0) + timedelta(days=2)

    first_response = await client.post(
        "/api/v1/classes/sessions",
        headers=headers,
        json={
            "template_name": "Mobility Flow",
            "template_duration_minutes": 45,
            "template_capacity": 12,
            "coach_id": str(coach.id),
            "session_name": "Early Flow",
            "starts_at": base_start.isoformat(),
        },
    )
    assert first_response.status_code == 201
    first_session_id = first_response.json()[0]["id"]

    second_response = await client.post(
        "/api/v1/classes/sessions",
        headers=headers,
        json={
            "template_name": "Mobility Flow",
            "template_duration_minutes": 45,
            "template_capacity": 12,
            "coach_id": str(coach.id),
            "session_name": "Late Flow",
            "starts_at": (base_start + timedelta(hours=2)).isoformat(),
        },
    )
    assert second_response.status_code == 201
    second_session_id = second_response.json()[0]["id"]

    update_response = await client.put(
        f"/api/v1/classes/sessions/{second_session_id}",
        headers=headers,
        json={"starts_at": (base_start + timedelta(minutes=20)).isoformat()},
    )

    assert update_response.status_code == 409
    assert update_response.json()["detail"] == "This coach already has another class scheduled during that time"

    assert first_session_id != second_session_id
