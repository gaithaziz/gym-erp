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
from app.models.fitness import DietPlan, WorkoutPlan
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
async def test_diet_draft_publish_fork_archive_flow(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    coach = User(email="coach_diet_lifecycle@gym.com", hashed_password=hashed, role=Role.COACH, full_name="Coach Diet Lifecycle")
    db_session.add(coach)
    await db_session.flush()
    await db_session.commit()

    login_resp = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": "coach_diet_lifecycle@gym.com", "password": password},
    )
    headers = {"Authorization": f"Bearer {login_resp.json()['data']['access_token']}"}

    create_resp = await client.post(
        f"{settings.API_V1_STR}/fitness/diets",
        json={
            "name": "Diet Lifecycle",
            "description": "Lifecycle testing",
            "content": "Meal A\\nMeal B",
            "content_structured": {"days": [{"name": "Monday", "meals": []}]},
            "status": "DRAFT",
            "is_template": True,
        },
        headers=headers,
    )
    assert create_resp.status_code == 200
    draft_id = create_resp.json()["data"]["id"]

    publish_resp = await client.post(f"{settings.API_V1_STR}/fitness/diets/{draft_id}/publish", headers=headers)
    assert publish_resp.status_code == 200

    blocked_update = await client.put(
        f"{settings.API_V1_STR}/fitness/diets/{draft_id}",
        json={"name": "blocked", "description": "x", "content": "x", "is_template": True},
        headers=headers,
    )
    assert blocked_update.status_code == 400

    fork_resp = await client.post(f"{settings.API_V1_STR}/fitness/diets/{draft_id}/fork-draft", headers=headers)
    assert fork_resp.status_code == 200
    fork_id = fork_resp.json()["data"]["id"]

    edit_draft = await client.put(
        f"{settings.API_V1_STR}/fitness/diets/{fork_id}",
        json={"name": "Diet Lifecycle v2", "description": "ok", "content": "Updated", "is_template": True},
        headers=headers,
    )
    assert edit_draft.status_code == 200

    archive_resp = await client.post(f"{settings.API_V1_STR}/fitness/diets/{draft_id}/archive", headers=headers)
    assert archive_resp.status_code == 200

    default_list = await client.get(f"{settings.API_V1_STR}/fitness/diets", headers=headers)
    assert default_list.status_code == 200
    default_ids = {row["id"] for row in default_list.json()["data"]}
    assert draft_id not in default_ids
    assert fork_id in default_ids

    archived_list = await client.get(f"{settings.API_V1_STR}/fitness/diets?include_archived=true", headers=headers)
    assert archived_list.status_code == 200
    by_id = {row["id"]: row for row in archived_list.json()["data"]}
    assert by_id[draft_id]["status"] == "ARCHIVED"
    assert by_id[fork_id]["status"] == "DRAFT"
    assert by_id[fork_id]["parent_plan_id"] == draft_id

    stmt = select(DietPlan).where(DietPlan.id.in_([uuid.UUID(draft_id), uuid.UUID(fork_id)]))
    rows = (await db_session.execute(stmt)).scalars().all()
    db_by_id = {str(row.id): row for row in rows}
    assert db_by_id[fork_id].version == db_by_id[draft_id].version + 1


@pytest.mark.asyncio
async def test_bulk_assign_diet_replaces_active(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    coach = User(email="coach_bulk_diet@gym.com", hashed_password=hashed, role=Role.COACH, full_name="Coach Bulk Diet")
    member1 = User(email="bulk_diet_m1@gym.com", hashed_password=hashed, role=Role.CUSTOMER, full_name="Bulk Diet M1")
    member2 = User(email="bulk_diet_m2@gym.com", hashed_password=hashed, role=Role.CUSTOMER, full_name="Bulk Diet M2")
    db_session.add_all([coach, member1, member2])
    await db_session.flush()
    db_session.add_all([_active_subscription(member1.id), _active_subscription(member2.id)])
    await db_session.commit()

    login_resp = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": "coach_bulk_diet@gym.com", "password": password},
    )
    headers = {"Authorization": f"Bearer {login_resp.json()['data']['access_token']}"}

    old1 = await client.post(
        f"{settings.API_V1_STR}/fitness/diets",
        json={"name": "Old Diet 1", "content": "A", "status": "PUBLISHED", "member_id": str(member1.id)},
        headers=headers,
    )
    assert old1.status_code == 200
    old2 = await client.post(
        f"{settings.API_V1_STR}/fitness/diets",
        json={"name": "Old Diet 2", "content": "B", "status": "PUBLISHED", "member_id": str(member2.id)},
        headers=headers,
    )
    assert old2.status_code == 200

    source = await client.post(
        f"{settings.API_V1_STR}/fitness/diets",
        json={"name": "Bulk Diet Source", "content": "Template", "status": "PUBLISHED", "is_template": True},
        headers=headers,
    )
    assert source.status_code == 200
    source_id = source.json()["data"]["id"]

    bulk_resp = await client.post(
        f"{settings.API_V1_STR}/fitness/diets/{source_id}/bulk-assign",
        json={"member_ids": [str(member1.id), str(member2.id)], "replace_active": True},
        headers=headers,
    )
    assert bulk_resp.status_code == 200
    bulk_data = bulk_resp.json()["data"]
    assert bulk_data["assigned_count"] == 2
    assert bulk_data["replaced_count"] >= 2

    plans_with_archived = await client.get(f"{settings.API_V1_STR}/fitness/diets?include_archived=true", headers=headers)
    assert plans_with_archived.status_code == 200
    all_plans = plans_with_archived.json()["data"]
    archived_old = [p for p in all_plans if p["id"] in {old1.json()["data"]["id"], old2.json()["data"]["id"]}]
    assert all(p["status"] == "ARCHIVED" for p in archived_old)
    assigned_new = [p for p in all_plans if p.get("parent_plan_id") == source_id and p.get("member_id") in {str(member1.id), str(member2.id)}]
    assert len(assigned_new) == 2


@pytest.mark.asyncio
async def test_non_owner_coach_cannot_manage_other_coach_diet_lifecycle(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    owner = User(email="coach_owner_diet@gym.com", hashed_password=hashed, role=Role.COACH, full_name="Diet Owner")
    other = User(email="coach_other_diet@gym.com", hashed_password=hashed, role=Role.COACH, full_name="Diet Other")
    db_session.add_all([owner, other])
    await db_session.flush()
    await db_session.commit()

    owner_login = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": "coach_owner_diet@gym.com", "password": password},
    )
    owner_headers = {"Authorization": f"Bearer {owner_login.json()['data']['access_token']}"}
    other_login = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": "coach_other_diet@gym.com", "password": password},
    )
    other_headers = {"Authorization": f"Bearer {other_login.json()['data']['access_token']}"}

    create_resp = await client.post(
        f"{settings.API_V1_STR}/fitness/diets",
        json={"name": "Protected Diet", "content": "X", "status": "DRAFT"},
        headers=owner_headers,
    )
    assert create_resp.status_code == 200
    diet_id = create_resp.json()["data"]["id"]

    blocked_publish = await client.post(f"{settings.API_V1_STR}/fitness/diets/{diet_id}/publish", headers=other_headers)
    assert blocked_publish.status_code == 403

    blocked_archive = await client.post(f"{settings.API_V1_STR}/fitness/diets/{diet_id}/archive", headers=other_headers)
    assert blocked_archive.status_code == 403

    blocked_fork = await client.post(f"{settings.API_V1_STR}/fitness/diets/{diet_id}/fork-draft", headers=other_headers)
    assert blocked_fork.status_code == 403


@pytest.mark.asyncio
async def test_coach_bulk_assign_diet_replace_active_only_archives_own_plans(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)

    coach_a = User(email="coach_a_replace_diet@gym.com", hashed_password=hashed, role=Role.COACH, full_name="Coach A")
    coach_b = User(email="coach_b_replace_diet@gym.com", hashed_password=hashed, role=Role.COACH, full_name="Coach B")
    member = User(email="member_replace_diet@gym.com", hashed_password=hashed, role=Role.CUSTOMER, full_name="Member Replace")
    db_session.add_all([coach_a, coach_b, member])
    await db_session.flush()
    db_session.add(_active_subscription(member.id))
    await db_session.commit()

    coach_a_login = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": coach_a.email, "password": password},
    )
    coach_a_headers = {"Authorization": f"Bearer {coach_a_login.json()['data']['access_token']}"}
    coach_b_login = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": coach_b.email, "password": password},
    )
    coach_b_headers = {"Authorization": f"Bearer {coach_b_login.json()['data']['access_token']}"}

    coach_a_old = await client.post(
        f"{settings.API_V1_STR}/fitness/diets",
        json={"name": "Coach A Old", "content": "A", "status": "PUBLISHED", "member_id": str(member.id)},
        headers=coach_a_headers,
    )
    assert coach_a_old.status_code == 200
    coach_b_old = await client.post(
        f"{settings.API_V1_STR}/fitness/diets",
        json={"name": "Coach B Old", "content": "B", "status": "PUBLISHED", "member_id": str(member.id)},
        headers=coach_b_headers,
    )
    assert coach_b_old.status_code == 200

    source = await client.post(
        f"{settings.API_V1_STR}/fitness/diets",
        json={"name": "Coach A Source", "content": "Template", "status": "PUBLISHED", "is_template": True},
        headers=coach_a_headers,
    )
    assert source.status_code == 200
    source_id = source.json()["data"]["id"]

    assign_resp = await client.post(
        f"{settings.API_V1_STR}/fitness/diets/{source_id}/bulk-assign",
        json={"member_ids": [str(member.id)], "replace_active": True},
        headers=coach_a_headers,
    )
    assert assign_resp.status_code == 200
    assert assign_resp.json()["data"]["assigned_count"] == 1
    assert assign_resp.json()["data"]["replaced_count"] == 1

    coach_a_plans = await client.get(f"{settings.API_V1_STR}/fitness/diets?include_archived=true", headers=coach_a_headers)
    assert coach_a_plans.status_code == 200
    coach_a_by_id = {row["id"]: row for row in coach_a_plans.json()["data"]}
    assert coach_a_by_id[coach_a_old.json()["data"]["id"]]["status"] == "ARCHIVED"

    coach_b_plans = await client.get(f"{settings.API_V1_STR}/fitness/diets?include_archived=true", headers=coach_b_headers)
    assert coach_b_plans.status_code == 200
    coach_b_by_id = {row["id"]: row for row in coach_b_plans.json()["data"]}
    assert coach_b_by_id[coach_b_old.json()["data"]["id"]]["status"] == "PUBLISHED"


@pytest.mark.asyncio
async def test_admin_bulk_assign_diet_archives_all_active_and_skips_non_customer_targets(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)

    admin = User(email="admin_replace_diet@gym.com", hashed_password=hashed, role=Role.ADMIN, full_name="Admin Replace")
    coach = User(email="coach_replace_diet_admin@gym.com", hashed_password=hashed, role=Role.COACH, full_name="Coach Replace")
    member = User(email="member_replace_diet_admin@gym.com", hashed_password=hashed, role=Role.CUSTOMER, full_name="Member Replace")
    db_session.add_all([admin, coach, member])
    await db_session.flush()
    db_session.add(_active_subscription(member.id))
    await db_session.commit()

    admin_login = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": admin.email, "password": password},
    )
    admin_headers = {"Authorization": f"Bearer {admin_login.json()['data']['access_token']}"}
    coach_login = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": coach.email, "password": password},
    )
    coach_headers = {"Authorization": f"Bearer {coach_login.json()['data']['access_token']}"}

    coach_old = await client.post(
        f"{settings.API_V1_STR}/fitness/diets",
        json={"name": "Coach Old", "content": "C", "status": "PUBLISHED", "member_id": str(member.id)},
        headers=coach_headers,
    )
    assert coach_old.status_code == 200
    admin_old = await client.post(
        f"{settings.API_V1_STR}/fitness/diets",
        json={"name": "Admin Old", "content": "A", "status": "PUBLISHED", "member_id": str(member.id)},
        headers=admin_headers,
    )
    assert admin_old.status_code == 200
    admin_source = await client.post(
        f"{settings.API_V1_STR}/fitness/diets",
        json={"name": "Admin Source", "content": "Template", "status": "PUBLISHED", "is_template": True},
        headers=admin_headers,
    )
    assert admin_source.status_code == 200

    assign_resp = await client.post(
        f"{settings.API_V1_STR}/fitness/diets/{admin_source.json()['data']['id']}/bulk-assign",
        json={"member_ids": [str(member.id), str(coach.id)], "replace_active": True},
        headers=admin_headers,
    )
    assert assign_resp.status_code == 200
    data = assign_resp.json()["data"]
    assert data["assigned_count"] == 1
    assert data["replaced_count"] == 2
    assert any(str(coach.id) in row and "not a customer" in row for row in data["skipped"])

    admin_plans = await client.get(f"{settings.API_V1_STR}/fitness/diets?include_archived=true", headers=admin_headers)
    assert admin_plans.status_code == 200
    by_id = {row["id"]: row for row in admin_plans.json()["data"]}
    assert by_id[admin_old.json()["data"]["id"]]["status"] == "ARCHIVED"

    coach_plans = await client.get(f"{settings.API_V1_STR}/fitness/diets?include_archived=true", headers=coach_headers)
    assert coach_plans.status_code == 200
    coach_by_id = {row["id"]: row for row in coach_plans.json()["data"]}
    assert coach_by_id[coach_old.json()["data"]["id"]]["status"] == "ARCHIVED"


@pytest.mark.asyncio
async def test_coach_can_read_other_coach_diet_by_id_but_customer_cannot(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)

    owner = User(email="coach_read_owner_diet@gym.com", hashed_password=hashed, role=Role.COACH, full_name="Owner Coach")
    other = User(email="coach_read_other_diet@gym.com", hashed_password=hashed, role=Role.COACH, full_name="Other Coach")
    member = User(email="member_read_other_diet@gym.com", hashed_password=hashed, role=Role.CUSTOMER, full_name="Member Read")
    db_session.add_all([owner, other, member])
    await db_session.flush()
    db_session.add(_active_subscription(member.id))
    await db_session.commit()

    owner_login = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": owner.email, "password": password},
    )
    owner_headers = {"Authorization": f"Bearer {owner_login.json()['data']['access_token']}"}
    other_login = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": other.email, "password": password},
    )
    other_headers = {"Authorization": f"Bearer {other_login.json()['data']['access_token']}"}
    member_login = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": member.email, "password": password},
    )
    member_headers = {"Authorization": f"Bearer {member_login.json()['data']['access_token']}"}

    create_resp = await client.post(
        f"{settings.API_V1_STR}/fitness/diets",
        json={"name": "Owner Template", "content": "X", "status": "DRAFT", "is_template": True},
        headers=owner_headers,
    )
    assert create_resp.status_code == 200
    diet_id = create_resp.json()["data"]["id"]

    other_read = await client.get(f"{settings.API_V1_STR}/fitness/diets/{diet_id}", headers=other_headers)
    assert other_read.status_code == 200
    assert other_read.json()["data"]["id"] == diet_id

    member_read = await client.get(f"{settings.API_V1_STR}/fitness/diets/{diet_id}", headers=member_headers)
    assert member_read.status_code == 403


@pytest.mark.asyncio
async def test_admin_can_list_diet_summaries_across_creators_with_flag(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)

    admin = User(email="admin_all_creators_diet@gym.com", hashed_password=hashed, role=Role.ADMIN, full_name="Admin All Creators")
    coach = User(email="coach_all_creators_diet@gym.com", hashed_password=hashed, role=Role.COACH, full_name="Coach All Creators")
    db_session.add_all([admin, coach])
    await db_session.flush()
    await db_session.commit()

    admin_login = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": admin.email, "password": password},
    )
    admin_headers = {"Authorization": f"Bearer {admin_login.json()['data']['access_token']}"}
    coach_login = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": coach.email, "password": password},
    )
    coach_headers = {"Authorization": f"Bearer {coach_login.json()['data']['access_token']}"}

    create_admin = await client.post(
        f"{settings.API_V1_STR}/fitness/diets",
        json={"name": "Admin Visible", "content": "Admin", "status": "PUBLISHED", "is_template": True},
        headers=admin_headers,
    )
    assert create_admin.status_code == 200
    create_coach = await client.post(
        f"{settings.API_V1_STR}/fitness/diets",
        json={"name": "Coach Visible", "content": "Coach", "status": "PUBLISHED", "is_template": True},
        headers=coach_headers,
    )
    assert create_coach.status_code == 200

    default_resp = await client.get(f"{settings.API_V1_STR}/fitness/diet-summaries", headers=admin_headers)
    assert default_resp.status_code == 200
    default_names = {row["name"] for row in default_resp.json()["data"]}
    assert "Admin Visible" in default_names
    assert "Coach Visible" not in default_names

    all_resp = await client.get(
        f"{settings.API_V1_STR}/fitness/diet-summaries?include_all_creators=true&templates_only=true",
        headers=admin_headers,
    )
    assert all_resp.status_code == 200
    all_names = {row["name"] for row in all_resp.json()["data"]}
    assert "Admin Visible" in all_names
    assert "Coach Visible" in all_names

    filtered_resp = await client.get(
        f"{settings.API_V1_STR}/fitness/diet-summaries?include_all_creators=true&creator_id={coach.id}",
        headers=admin_headers,
    )
    assert filtered_resp.status_code == 200
    filtered_names = {row["name"] for row in filtered_resp.json()["data"]}
    assert "Coach Visible" in filtered_names
    assert "Admin Visible" not in filtered_names


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
