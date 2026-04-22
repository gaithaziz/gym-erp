from datetime import datetime, timedelta, timezone

import pytest
from app.auth.security import get_password_hash
from app.models.enums import Role
from app.models.user import User
from app.services.tenancy_service import TenancyService


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


@pytest.mark.asyncio
async def test_coach_can_view_other_coaches_sessions_but_not_edit_them(client, db_session):
    admin = await _create_user(db_session, email="classes-admin-3@test.com", full_name="Classes Admin 3", role=Role.ADMIN)
    coach_a = await _create_user(db_session, email="classes-coach-a@test.com", full_name="Classes Coach A", role=Role.COACH)
    coach_b = await _create_user(db_session, email="classes-coach-b@test.com", full_name="Classes Coach B", role=Role.COACH)

    gym, branch = await TenancyService.ensure_default_gym_and_branch(db_session)
    for user in (admin, coach_a, coach_b):
        user.gym_id = gym.id
        user.home_branch_id = branch.id
    await db_session.flush()
    await TenancyService.ensure_user_branch_access(db_session, user_id=admin.id, gym_id=gym.id, branch_id=branch.id)
    await TenancyService.ensure_user_branch_access(db_session, user_id=coach_a.id, gym_id=gym.id, branch_id=branch.id)
    await TenancyService.ensure_user_branch_access(db_session, user_id=coach_b.id, gym_id=gym.id, branch_id=branch.id)
    await db_session.commit()

    admin_headers = await _auth_headers(client, email=admin.email)
    start_one = datetime.now(timezone.utc).replace(second=0, microsecond=0) + timedelta(days=3)
    start_two = start_one + timedelta(hours=2)

    first_response = await client.post(
        "/api/v1/classes/sessions",
        headers=admin_headers,
        json={
            "template_name": "Coach A Class",
            "template_duration_minutes": 60,
            "template_capacity": 20,
            "coach_id": str(coach_a.id),
            "session_name": "Coach A Morning",
            "starts_at": start_one.isoformat(),
        },
    )
    assert first_response.status_code == 201
    coach_a_session_id = first_response.json()[0]["id"]

    second_response = await client.post(
        "/api/v1/classes/sessions",
        headers=admin_headers,
        json={
            "template_name": "Coach B Class",
            "template_duration_minutes": 60,
            "template_capacity": 20,
            "coach_id": str(coach_b.id),
            "session_name": "Coach B Morning",
            "starts_at": start_two.isoformat(),
        },
    )
    assert second_response.status_code == 201
    coach_b_session_id = second_response.json()[0]["id"]

    coach_headers = await _auth_headers(client, email=coach_a.email)
    sessions_response = await client.get("/api/v1/classes/sessions", headers=coach_headers)
    assert sessions_response.status_code == 200
    session_ids = {row["id"] for row in sessions_response.json()}
    assert coach_a_session_id in session_ids
    assert coach_b_session_id in session_ids

    edit_other_response = await client.put(
        f"/api/v1/classes/sessions/{coach_b_session_id}",
        headers=coach_headers,
        json={"session_name": "Edited by the wrong coach"},
    )
    assert edit_other_response.status_code == 403
