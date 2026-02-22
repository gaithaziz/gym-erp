import pytest
from datetime import datetime, timedelta, timezone
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings
from app.models.access import Subscription, SubscriptionStatus
from app.models.user import User
from app.models.enums import Role
from app.auth.security import get_password_hash


def _active_subscription(user_id):
    now = datetime.now(timezone.utc)
    return Subscription(
        user_id=user_id,
        plan_name="Gold",
        start_date=now - timedelta(days=1),
        end_date=now + timedelta(days=30),
        status=SubscriptionStatus.ACTIVE,
    )

@pytest.mark.asyncio
async def test_fitness_flow(client: AsyncClient, db_session: AsyncSession):
    # 1. Setup Coach User
    password = "password123"
    hashed = get_password_hash(password)
    coach = User(email="coach_fit@gym.com", hashed_password=hashed, role=Role.COACH, full_name="Coach Fit")
    db_session.add(coach)
    await db_session.flush()
    
    login_resp = await client.post(f"{settings.API_V1_STR}/auth/login", json={"email": "coach_fit@gym.com", "password": password})
    token = login_resp.json()["data"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    # 2. Create Exercise
    invalid_url_resp = await client.post(
        f"{settings.API_V1_STR}/fitness/exercises",
        json={"name": "Invalid URL", "category": "Chest", "video_url": "not-a-url"},
        headers=headers,
    )
    assert invalid_url_resp.status_code == 422

    unsupported_provider_resp = await client.post(
        f"{settings.API_V1_STR}/fitness/exercises",
        json={"name": "Unsupported Provider", "category": "Chest", "video_url": "https://example.com/video"},
        headers=headers,
    )
    assert unsupported_provider_resp.status_code == 422

    ex_data = {
        "name": "Push Up",
        "category": "Chest",
        "description": "Standard push up",
        "video_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    }
    resp = await client.post(f"{settings.API_V1_STR}/fitness/exercises", json=ex_data, headers=headers)
    assert resp.status_code == 200
    ex_id = resp.json()["data"]["id"]
    
    # 3. List Exercises
    resp_list = await client.get(f"{settings.API_V1_STR}/fitness/exercises", headers=headers)
    assert resp_list.status_code == 200
    exercises = resp_list.json()["data"]
    assert any(e["id"] == ex_id for e in exercises)
    
    # 4. Create Workout Plan
    plan_data = {
        "name": "Beginner Chest",
        "description": "Intro to chest day",
        "exercises": [
            {
                "exercise_id": ex_id,
                "sets": 3,
                "reps": 10,
                "order": 1
            }
        ]
    }
    resp_plan = await client.post(f"{settings.API_V1_STR}/fitness/plans", json=plan_data, headers=headers)
    assert resp_plan.status_code == 200
    
    # 5. List Plans
    resp_plans = await client.get(f"{settings.API_V1_STR}/fitness/plans", headers=headers)
    assert resp_plans.status_code == 200
    plans = resp_plans.json()["data"]
    assert len(plans) > 0
    assert plans[0]["name"] == "Beginner Chest"


@pytest.mark.asyncio
async def test_customer_can_only_log_assigned_plan(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)

    coach = User(email="coach_assign@gym.com", hashed_password=hashed, role=Role.COACH, full_name="Coach Assign")
    customer_assigned = User(email="assigned@gym.com", hashed_password=hashed, role=Role.CUSTOMER, full_name="Assigned Member")
    customer_other = User(email="other@gym.com", hashed_password=hashed, role=Role.CUSTOMER, full_name="Other Member")
    db_session.add_all([coach, customer_assigned, customer_other])
    await db_session.flush()
    db_session.add_all([_active_subscription(customer_assigned.id), _active_subscription(customer_other.id)])
    await db_session.commit()

    coach_login = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": "coach_assign@gym.com", "password": password}
    )
    coach_headers = {"Authorization": f"Bearer {coach_login.json()['data']['access_token']}"}

    exercise_resp = await client.post(
        f"{settings.API_V1_STR}/fitness/exercises",
        json={"name": "Squat", "category": "Legs"},
        headers=coach_headers,
    )
    exercise_id = exercise_resp.json()["data"]["id"]

    plan_resp = await client.post(
        f"{settings.API_V1_STR}/fitness/plans",
        json={
            "name": "Assigned Plan",
            "member_id": str(customer_assigned.id),
            "exercises": [{"exercise_id": exercise_id, "sets": 3, "reps": 8, "order": 1}],
        },
        headers=coach_headers,
    )
    plan_id = plan_resp.json()["data"]["id"]

    other_login = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": "other@gym.com", "password": password}
    )
    other_headers = {"Authorization": f"Bearer {other_login.json()['data']['access_token']}"}

    forbidden_log = await client.post(
        f"{settings.API_V1_STR}/fitness/log",
        json={"plan_id": plan_id, "completed": True, "difficulty_rating": 3},
        headers=other_headers,
    )
    assert forbidden_log.status_code == 403

    assigned_login = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": "assigned@gym.com", "password": password}
    )
    assigned_headers = {"Authorization": f"Bearer {assigned_login.json()['data']['access_token']}"}

    allowed_log = await client.post(
        f"{settings.API_V1_STR}/fitness/log",
        json={"plan_id": plan_id, "completed": True, "difficulty_rating": 4},
        headers=assigned_headers,
    )
    assert allowed_log.status_code == 200


@pytest.mark.asyncio
async def test_coach_cannot_view_other_coach_plan_logs(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)

    coach_owner = User(email="coach_owner@gym.com", hashed_password=hashed, role=Role.COACH, full_name="Coach Owner")
    coach_other = User(email="coach_other@gym.com", hashed_password=hashed, role=Role.COACH, full_name="Coach Other")
    customer = User(email="logs_member@gym.com", hashed_password=hashed, role=Role.CUSTOMER, full_name="Logs Member")
    db_session.add_all([coach_owner, coach_other, customer])
    await db_session.flush()
    db_session.add(_active_subscription(customer.id))
    await db_session.commit()

    owner_login = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": "coach_owner@gym.com", "password": password}
    )
    owner_headers = {"Authorization": f"Bearer {owner_login.json()['data']['access_token']}"}

    other_login = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": "coach_other@gym.com", "password": password}
    )
    other_headers = {"Authorization": f"Bearer {other_login.json()['data']['access_token']}"}

    member_login = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": "logs_member@gym.com", "password": password}
    )
    member_headers = {"Authorization": f"Bearer {member_login.json()['data']['access_token']}"}

    exercise_resp = await client.post(
        f"{settings.API_V1_STR}/fitness/exercises",
        json={"name": "Bench Press", "category": "Chest"},
        headers=owner_headers,
    )
    exercise_id = exercise_resp.json()["data"]["id"]

    plan_resp = await client.post(
        f"{settings.API_V1_STR}/fitness/plans",
        json={
            "name": "Owner Plan",
            "member_id": str(customer.id),
            "exercises": [{"exercise_id": exercise_id, "sets": 4, "reps": 6, "order": 1}],
        },
        headers=owner_headers,
    )
    plan_id = plan_resp.json()["data"]["id"]

    log_resp = await client.post(
        f"{settings.API_V1_STR}/fitness/log",
        json={"plan_id": plan_id, "completed": True, "difficulty_rating": 4},
        headers=member_headers,
    )
    assert log_resp.status_code == 200

    forbidden_logs = await client.get(
        f"{settings.API_V1_STR}/fitness/logs/{plan_id}",
        headers=other_headers,
    )
    assert forbidden_logs.status_code == 403

    owner_logs = await client.get(
        f"{settings.API_V1_STR}/fitness/logs/{plan_id}",
        headers=owner_headers,
    )
    assert owner_logs.status_code == 200


@pytest.mark.asyncio
async def test_coach_can_clone_template_plan(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)

    coach = User(email="coach_templates@gym.com", hashed_password=hashed, role=Role.COACH, full_name="Coach Templates")
    member = User(email="member_templates@gym.com", hashed_password=hashed, role=Role.CUSTOMER, full_name="Template Member")
    db_session.add_all([coach, member])
    await db_session.flush()

    coach_login = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": "coach_templates@gym.com", "password": password}
    )
    headers = {"Authorization": f"Bearer {coach_login.json()['data']['access_token']}"}

    exercise_resp = await client.post(
        f"{settings.API_V1_STR}/fitness/exercises",
        json={"name": "Deadlift", "category": "Back"},
        headers=headers,
    )
    exercise_id = exercise_resp.json()["data"]["id"]

    template_resp = await client.post(
        f"{settings.API_V1_STR}/fitness/plans",
        json={
            "name": "Strength Template",
            "is_template": True,
            "exercises": [{"exercise_id": exercise_id, "sets": 5, "reps": 5, "order": 1}],
        },
        headers=headers,
    )
    assert template_resp.status_code == 200
    template_plan_id = template_resp.json()["data"]["id"]

    clone_resp = await client.post(
        f"{settings.API_V1_STR}/fitness/plans/{template_plan_id}/clone",
        json={"name": "Member Strength Plan", "member_id": str(member.id)},
        headers=headers,
    )
    assert clone_resp.status_code == 200
    cloned_plan_id = clone_resp.json()["data"]["id"]

    list_resp = await client.get(f"{settings.API_V1_STR}/fitness/plans", headers=headers)
    assert list_resp.status_code == 200
    plans = list_resp.json()["data"]

    cloned = next(p for p in plans if p["id"] == cloned_plan_id)
    assert cloned["name"] == "Member Strength Plan"
    assert cloned["member_id"] == str(member.id)
    assert cloned["is_template"] is False


@pytest.mark.asyncio
async def test_coach_can_clone_diet_plan(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)

    coach = User(email="coach_diet_templates@gym.com", hashed_password=hashed, role=Role.COACH, full_name="Coach Diet Templates")
    member = User(email="member_diet_templates@gym.com", hashed_password=hashed, role=Role.CUSTOMER, full_name="Diet Member")
    db_session.add_all([coach, member])
    await db_session.flush()

    coach_login = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": "coach_diet_templates@gym.com", "password": password}
    )
    headers = {"Authorization": f"Bearer {coach_login.json()['data']['access_token']}"}

    create_resp = await client.post(
        f"{settings.API_V1_STR}/fitness/diets",
        json={
            "name": "Cutting Template",
            "description": "High protein cut",
            "content": "Breakfast: eggs\nLunch: chicken\nDinner: fish",
        },
        headers=headers,
    )
    assert create_resp.status_code == 200
    source_id = create_resp.json()["data"]["id"]

    clone_resp = await client.post(
        f"{settings.API_V1_STR}/fitness/diets/{source_id}/clone",
        json={"name": "Member Cutting Plan", "member_id": str(member.id)},
        headers=headers,
    )
    assert clone_resp.status_code == 200
    cloned_id = clone_resp.json()["data"]["id"]

    list_resp = await client.get(f"{settings.API_V1_STR}/fitness/diets", headers=headers)
    assert list_resp.status_code == 200
    diets = list_resp.json()["data"]

    cloned = next(d for d in diets if d["id"] == cloned_id)
    assert cloned["name"] == "Member Cutting Plan"
    assert cloned["member_id"] == str(member.id)


@pytest.mark.asyncio
async def test_coach_can_delete_diet_plan(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)

    coach = User(email="coach_delete_diet@gym.com", hashed_password=hashed, role=Role.COACH, full_name="Coach Delete Diet")
    db_session.add(coach)
    await db_session.flush()

    login_resp = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": "coach_delete_diet@gym.com", "password": password},
    )
    headers = {"Authorization": f"Bearer {login_resp.json()['data']['access_token']}"}

    create_resp = await client.post(
        f"{settings.API_V1_STR}/fitness/diets",
        json={"name": "Delete Diet", "description": "x", "content": "meal"},
        headers=headers,
    )
    assert create_resp.status_code == 200
    diet_id = create_resp.json()["data"]["id"]

    delete_resp = await client.delete(f"{settings.API_V1_STR}/fitness/diets/{diet_id}", headers=headers)
    assert delete_resp.status_code == 200


@pytest.mark.asyncio
async def test_coach_can_delete_plan_that_has_logs(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)

    coach = User(email="coach_delete_plan@gym.com", hashed_password=hashed, role=Role.COACH, full_name="Coach Delete Plan")
    member = User(email="member_delete_plan@gym.com", hashed_password=hashed, role=Role.CUSTOMER, full_name="Member Delete Plan")
    db_session.add_all([coach, member])
    await db_session.flush()
    db_session.add(_active_subscription(member.id))
    await db_session.commit()

    coach_login = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": "coach_delete_plan@gym.com", "password": password},
    )
    coach_headers = {"Authorization": f"Bearer {coach_login.json()['data']['access_token']}"}

    member_login = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": "member_delete_plan@gym.com", "password": password},
    )
    member_headers = {"Authorization": f"Bearer {member_login.json()['data']['access_token']}"}

    exercise_resp = await client.post(
        f"{settings.API_V1_STR}/fitness/exercises",
        json={"name": "Delete Plan Exercise", "category": "Core"},
        headers=coach_headers,
    )
    exercise_id = exercise_resp.json()["data"]["id"]

    plan_resp = await client.post(
        f"{settings.API_V1_STR}/fitness/plans",
        json={
            "name": "Delete Plan Target",
            "member_id": str(member.id),
            "exercises": [{"exercise_id": exercise_id, "sets": 3, "reps": 12, "order": 1}],
        },
        headers=coach_headers,
    )
    assert plan_resp.status_code == 200
    plan_id = plan_resp.json()["data"]["id"]

    log_resp = await client.post(
        f"{settings.API_V1_STR}/fitness/log",
        json={"plan_id": plan_id, "completed": True, "difficulty_rating": 3},
        headers=member_headers,
    )
    assert log_resp.status_code == 200

    delete_resp = await client.delete(f"{settings.API_V1_STR}/fitness/plans/{plan_id}", headers=coach_headers)
    assert delete_resp.status_code == 200


@pytest.mark.asyncio
async def test_coach_can_view_member_biometrics(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)

    coach = User(email="coach_bio_view@gym.com", hashed_password=hashed, role=Role.COACH, full_name="Coach Bio View")
    member = User(email="member_bio_view@gym.com", hashed_password=hashed, role=Role.CUSTOMER, full_name="Member Bio View")
    db_session.add_all([coach, member])
    await db_session.flush()
    db_session.add(_active_subscription(member.id))
    await db_session.commit()

    member_login = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": "member_bio_view@gym.com", "password": password},
    )
    member_headers = {"Authorization": f"Bearer {member_login.json()['data']['access_token']}"}
    member_log = await client.post(
        f"{settings.API_V1_STR}/fitness/biometrics",
        json={"height_cm": 180.0, "weight_kg": 78.2, "body_fat_pct": 17.5},
        headers=member_headers,
    )
    assert member_log.status_code == 200

    coach_login = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": "coach_bio_view@gym.com", "password": password},
    )
    coach_headers = {"Authorization": f"Bearer {coach_login.json()['data']['access_token']}"}

    list_resp = await client.get(f"{settings.API_V1_STR}/fitness/biometrics/member/{member.id}", headers=coach_headers)
    assert list_resp.status_code == 200
    logs = list_resp.json()["data"]
    assert any((log.get("height_cm") == 180.0 and log.get("weight_kg") == 78.2) for log in logs)


@pytest.mark.asyncio
async def test_biometrics_supports_pagination(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    member = User(email="member_bio_page@gym.com", hashed_password=hashed, role=Role.CUSTOMER, full_name="Bio Page Member")
    db_session.add(member)
    await db_session.flush()
    db_session.add(_active_subscription(member.id))
    await db_session.commit()

    login_resp = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": "member_bio_page@gym.com", "password": password}
    )
    headers = {"Authorization": f"Bearer {login_resp.json()['data']['access_token']}"}

    first_log = await client.post(f"{settings.API_V1_STR}/fitness/biometrics", json={"weight_kg": 80.0}, headers=headers)
    second_log = await client.post(f"{settings.API_V1_STR}/fitness/biometrics", json={"weight_kg": 79.5}, headers=headers)
    assert first_log.status_code == 200
    assert second_log.status_code == 200

    paged_resp = await client.get(f"{settings.API_V1_STR}/fitness/biometrics?limit=1&offset=0", headers=headers)
    assert paged_resp.status_code == 200
    assert len(paged_resp.json()["data"]) == 1

    next_page_resp = await client.get(f"{settings.API_V1_STR}/fitness/biometrics?limit=1&offset=1", headers=headers)
    assert next_page_resp.status_code == 200
    assert len(next_page_resp.json()["data"]) == 1
