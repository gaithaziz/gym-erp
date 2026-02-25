import pytest
import uuid
from datetime import datetime, timedelta, timezone
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings
from app.models.access import Subscription, SubscriptionStatus
from app.models.user import User
from app.models.enums import Role
from app.auth.security import get_password_hash
from app.models.fitness import WorkoutPlan
from sqlalchemy import select


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


@pytest.mark.asyncio
async def test_bulk_assign_replaces_active_and_aggregates_adherence(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    coach = User(email="coach_bulk@gym.com", hashed_password=hashed, role=Role.COACH, full_name="Coach Bulk")
    member1 = User(email="bulk_m1@gym.com", hashed_password=hashed, role=Role.CUSTOMER, full_name="Bulk Member 1")
    member2 = User(email="bulk_m2@gym.com", hashed_password=hashed, role=Role.CUSTOMER, full_name="Bulk Member 2")
    db_session.add_all([coach, member1, member2])
    await db_session.flush()
    db_session.add_all([_active_subscription(member1.id), _active_subscription(member2.id)])
    await db_session.commit()

    login_resp = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": "coach_bulk@gym.com", "password": password},
    )
    headers = {"Authorization": f"Bearer {login_resp.json()['data']['access_token']}"}

    ex_resp = await client.post(
        f"{settings.API_V1_STR}/fitness/exercises",
        json={"name": "Bulk Squat", "category": "Legs"},
        headers=headers,
    )
    exercise_id = ex_resp.json()["data"]["id"]

    old1 = await client.post(
        f"{settings.API_V1_STR}/fitness/plans",
        json={
            "name": "Old M1 Plan",
            "status": "PUBLISHED",
            "member_id": str(member1.id),
            "exercises": [{"exercise_id": exercise_id, "sets": 3, "reps": 8, "order": 1}],
        },
        headers=headers,
    )
    assert old1.status_code == 200
    old2 = await client.post(
        f"{settings.API_V1_STR}/fitness/plans",
        json={
            "name": "Old M2 Plan",
            "status": "PUBLISHED",
            "member_id": str(member2.id),
            "exercises": [{"exercise_id": exercise_id, "sets": 3, "reps": 8, "order": 1}],
        },
        headers=headers,
    )
    assert old2.status_code == 200

    source = await client.post(
        f"{settings.API_V1_STR}/fitness/plans",
        json={
            "name": "Bulk Source",
            "status": "PUBLISHED",
            "is_template": True,
            "exercises": [{"exercise_id": exercise_id, "sets": 4, "reps": 10, "order": 1}],
        },
        headers=headers,
    )
    assert source.status_code == 200
    source_id = source.json()["data"]["id"]

    bulk_resp = await client.post(
        f"{settings.API_V1_STR}/fitness/plans/{source_id}/bulk-assign",
        json={"member_ids": [str(member1.id), str(member2.id)], "replace_active": True},
        headers=headers,
    )
    assert bulk_resp.status_code == 200
    bulk_data = bulk_resp.json()["data"]
    assert bulk_data["assigned_count"] == 2
    assert bulk_data["replaced_count"] >= 2

    plans_visible = await client.get(f"{settings.API_V1_STR}/fitness/plans", headers=headers)
    assert plans_visible.status_code == 200
    visible_ids = {p["id"] for p in plans_visible.json()["data"]}
    assert old1.json()["data"]["id"] not in visible_ids
    assert old2.json()["data"]["id"] not in visible_ids

    plans_with_archived = await client.get(f"{settings.API_V1_STR}/fitness/plans?include_archived=true", headers=headers)
    assert plans_with_archived.status_code == 200
    all_plans = plans_with_archived.json()["data"]
    archived_old = [p for p in all_plans if p["id"] in {old1.json()["data"]["id"], old2.json()["data"]["id"]}]
    assert all(p["status"] == "ARCHIVED" for p in archived_old)

    adherence_resp = await client.get(f"{settings.API_V1_STR}/fitness/plans/adherence?window_days=30", headers=headers)
    assert adherence_resp.status_code == 200
    adherence_rows = adherence_resp.json()["data"]
    source_row = next((r for r in adherence_rows if r["plan_id"] == source_id), None)
    assert source_row is not None
    assert source_row["assigned_members"] == 2


@pytest.mark.asyncio
async def test_draft_publish_fork_publish_version_flow(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    coach = User(email="coach_lifecycle@gym.com", hashed_password=hashed, role=Role.COACH, full_name="Coach Lifecycle")
    db_session.add(coach)
    await db_session.flush()
    await db_session.commit()

    login_resp = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": "coach_lifecycle@gym.com", "password": password},
    )
    headers = {"Authorization": f"Bearer {login_resp.json()['data']['access_token']}"}

    ex_resp = await client.post(
        f"{settings.API_V1_STR}/fitness/exercises",
        json={"name": "Lifecycle Pushup", "category": "Chest"},
        headers=headers,
    )
    exercise_id = ex_resp.json()["data"]["id"]

    create_resp = await client.post(
        f"{settings.API_V1_STR}/fitness/plans",
        json={
            "name": "Lifecycle Plan",
            "status": "DRAFT",
            "exercises": [{"exercise_id": exercise_id, "sets": 3, "reps": 12, "order": 1}],
        },
        headers=headers,
    )
    assert create_resp.status_code == 200
    draft_id = create_resp.json()["data"]["id"]

    publish_resp = await client.post(f"{settings.API_V1_STR}/fitness/plans/{draft_id}/publish", headers=headers)
    assert publish_resp.status_code == 200

    blocked_update = await client.put(
        f"{settings.API_V1_STR}/fitness/plans/{draft_id}",
        json={
            "name": "Should Fail",
            "status": "PUBLISHED",
            "exercises": [{"exercise_id": exercise_id, "sets": 4, "reps": 8, "order": 1}],
        },
        headers=headers,
    )
    assert blocked_update.status_code == 400

    fork_resp = await client.post(f"{settings.API_V1_STR}/fitness/plans/{draft_id}/fork-draft", headers=headers)
    assert fork_resp.status_code == 200
    fork_id = fork_resp.json()["data"]["id"]

    republish_resp = await client.post(f"{settings.API_V1_STR}/fitness/plans/{fork_id}/publish", headers=headers)
    assert republish_resp.status_code == 200

    stmt = select(WorkoutPlan).where(WorkoutPlan.id.in_([uuid.UUID(draft_id), uuid.UUID(fork_id)]))
    result = await db_session.execute(stmt)
    by_id = {str(p.id): p for p in result.scalars().all()}
    assert by_id[draft_id].status == "PUBLISHED"
    assert by_id[fork_id].status == "PUBLISHED"
    assert by_id[fork_id].parent_plan_id == by_id[draft_id].id
    assert by_id[fork_id].version == by_id[draft_id].version + 1


@pytest.mark.asyncio
async def test_workout_library_update_delete_authorization(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    admin = User(email="admin_lib@gym.com", hashed_password=hashed, role=Role.ADMIN, full_name="Admin Lib")
    coach1 = User(email="coach1_lib@gym.com", hashed_password=hashed, role=Role.COACH, full_name="Coach One")
    coach2 = User(email="coach2_lib@gym.com", hashed_password=hashed, role=Role.COACH, full_name="Coach Two")
    db_session.add_all([admin, coach1, coach2])
    await db_session.flush()
    await db_session.commit()

    admin_login = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": "admin_lib@gym.com", "password": password},
    )
    admin_headers = {"Authorization": f"Bearer {admin_login.json()['data']['access_token']}"}
    coach1_login = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": "coach1_lib@gym.com", "password": password},
    )
    coach1_headers = {"Authorization": f"Bearer {coach1_login.json()['data']['access_token']}"}
    coach2_login = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": "coach2_lib@gym.com", "password": password},
    )
    coach2_headers = {"Authorization": f"Bearer {coach2_login.json()['data']['access_token']}"}

    global_create = await client.post(
        f"{settings.API_V1_STR}/fitness/exercise-library",
        json={"name": "Admin Global Bench", "category": "PUSH", "is_global": True},
        headers=admin_headers,
    )
    assert global_create.status_code == 200
    global_id = global_create.json()["data"]["id"]

    forbidden_update = await client.put(
        f"{settings.API_V1_STR}/fitness/exercise-library/{global_id}",
        json={"name": "Coach Edit Attempt", "category": "PUSH", "tags": [], "is_global": False},
        headers=coach1_headers,
    )
    assert forbidden_update.status_code == 403

    mine_create = await client.post(
        f"{settings.API_V1_STR}/fitness/exercise-library",
        json={"name": "Coach One Row", "category": "PULL", "is_global": False},
        headers=coach1_headers,
    )
    assert mine_create.status_code == 200
    mine_id = mine_create.json()["data"]["id"]

    other_forbidden = await client.delete(
        f"{settings.API_V1_STR}/fitness/exercise-library/{mine_id}",
        headers=coach2_headers,
    )
    assert other_forbidden.status_code == 403

    owner_update = await client.put(
        f"{settings.API_V1_STR}/fitness/exercise-library/{mine_id}",
        json={
            "name": "Coach One Row Updated",
            "category": "PULL",
            "muscle_group": "Back",
            "equipment": "Cable",
            "tags": ["back", "pull"],
            "is_global": False,
        },
        headers=coach1_headers,
    )
    assert owner_update.status_code == 200

    owner_delete = await client.delete(
        f"{settings.API_V1_STR}/fitness/exercise-library/{mine_id}",
        headers=coach1_headers,
    )
    assert owner_delete.status_code == 200


@pytest.mark.asyncio
async def test_diet_library_crud_and_to_plan(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    admin = User(email="admin_diet_lib@gym.com", hashed_password=hashed, role=Role.ADMIN, full_name="Admin Diet")
    coach = User(email="coach_diet_lib@gym.com", hashed_password=hashed, role=Role.COACH, full_name="Coach Diet")
    db_session.add_all([admin, coach])
    await db_session.flush()
    await db_session.commit()

    admin_login = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": "admin_diet_lib@gym.com", "password": password},
    )
    admin_headers = {"Authorization": f"Bearer {admin_login.json()['data']['access_token']}"}
    coach_login = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": "coach_diet_lib@gym.com", "password": password},
    )
    coach_headers = {"Authorization": f"Bearer {coach_login.json()['data']['access_token']}"}

    create_resp = await client.post(
        f"{settings.API_V1_STR}/fitness/diet-library",
        json={
            "name": "Global Cut Template",
            "description": "Global diet template",
            "content": "Meal 1\nMeal 2",
            "is_global": True,
        },
        headers=admin_headers,
    )
    assert create_resp.status_code == 200
    item_id = create_resp.json()["data"]["id"]

    list_resp = await client.get(
        f"{settings.API_V1_STR}/fitness/diet-library?scope=global&query=Cut",
        headers=coach_headers,
    )
    assert list_resp.status_code == 200
    assert any(row["id"] == item_id for row in list_resp.json()["data"])

    to_plan_resp = await client.post(
        f"{settings.API_V1_STR}/fitness/diet-library/{item_id}/to-plan",
        headers=coach_headers,
    )
    assert to_plan_resp.status_code == 200
    plan_id = to_plan_resp.json()["data"]["id"]

    diets_resp = await client.get(f"{settings.API_V1_STR}/fitness/diets", headers=coach_headers)
    assert diets_resp.status_code == 200
    assert any(d["id"] == plan_id for d in diets_resp.json()["data"])

    coach_update_global = await client.put(
        f"{settings.API_V1_STR}/fitness/diet-library/{item_id}",
        json={"name": "Coach Forbidden", "description": "x", "content": "x", "is_global": False},
        headers=coach_headers,
    )
    assert coach_update_global.status_code == 403
