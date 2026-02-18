import pytest
from httpx import AsyncClient
from app.models.enums import Role

@pytest.mark.asyncio
async def test_create_diet_plan(client: AsyncClient, admin_token_headers):
    # 1. Create a diet plan
    response = await client.post(
        "/api/v1/fitness/diets",
        headers=admin_token_headers,
        json={
            "name": "Keto Blast",
            "description": "High fat, low carb",
            "content": "Eat bacon.",
            "member_id": None 
        },
    )
    assert response.status_code == 200
    data = response.json()
    # Create returns only ID
    assert "id" in data["data"]
    plan_id = data["data"]["id"]

    # 2. Get the diet plan
    response = await client.get(
        f"/api/v1/fitness/diets/{plan_id}",
        headers=admin_token_headers,
    )
    assert response.status_code == 200
    assert response.json()["data"]["content"] == "Eat bacon."

@pytest.mark.asyncio
async def test_hr_members_list(client: AsyncClient, admin_token_headers, db_session):
    # Seed a customer
    from app.models.user import User
    from app.auth.security import get_password_hash
    
    customer = User(
        email="bob@client.com",
        hashed_password=get_password_hash("password"),
        full_name="Bob Customer",
        role=Role.CUSTOMER,
        is_active=True
    )
    db_session.add(customer)
    await db_session.commit()

    # Should return list containing seeded customers
    response = await client.get(
        "/api/v1/hr/members",
        headers=admin_token_headers,
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert len(data) > 0
    # Bob should be there
    assert any(m["email"] == "bob@client.com" for m in data)

@pytest.mark.asyncio
async def test_workout_feedback_flow(client: AsyncClient, admin_token_headers):
    # 1. Create a workout plan
    plan_res = await client.post(
        "/api/v1/fitness/plans",
        headers=admin_token_headers,
        json={
            "name": "Test Plan",
            "description": "For feedback test",
            "exercises": []
        }
    )
    assert plan_res.status_code == 200
    plan_id = plan_res.json()["data"]["id"]

    # 2. Log feedback (as admin acting as member, for simplicity in this test scope)
    # The endpoint relies on current_user, so this log will be attributed to Admin.
    feedback_res = await client.post(
        "/api/v1/fitness/log",
        headers=admin_token_headers,
        json={
            "plan_id": plan_id,
            "completed": True,
            "difficulty_rating": 5,
            "comment": "Admin found this easy."
        }
    )
    assert feedback_res.status_code == 200
    
    # 3. Verify the feedback is listed
    logs_res = await client.get(
        f"/api/v1/fitness/logs/{plan_id}",
        headers=admin_token_headers
    )
    assert logs_res.status_code == 200
    logs = logs_res.json()["data"]
    assert len(logs) > 0
    assert logs[0]["difficulty_rating"] == 5
