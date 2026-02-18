import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings
from app.models.user import User
from app.models.enums import Role
from app.auth.security import get_password_hash

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
    ex_data = {
        "name": "Push Up",
        "category": "Chest",
        "description": "Standard push up",
        "video_url": "http://video.com/pushup"
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
