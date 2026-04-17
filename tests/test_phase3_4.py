import pytest
from httpx import AsyncClient
from app.models.enums import Role


async def _auth_headers_for_role(client: AsyncClient, db_session, role: Role, email: str) -> dict[str, str]:
    from app.auth.security import get_password_hash
    from app.models.user import User

    user = User(
        email=email,
        hashed_password=get_password_hash("password"),
        full_name=f"{role.value.title()} User",
        role=role,
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()

    response = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "password"},
    )
    assert response.status_code == 200
    token = response.json()["data"]["access_token"]
    return {"Authorization": f"Bearer {token}"}

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


@pytest.mark.asyncio
async def test_mobile_admin_summary_endpoints_allow_admin_and_manager(client: AsyncClient, db_session):
    endpoints = [
        "/api/v1/mobile/admin/home",
        "/api/v1/mobile/admin/people/summary",
        "/api/v1/mobile/admin/operations/summary",
        "/api/v1/mobile/admin/finance/summary",
        "/api/v1/mobile/admin/audit/summary",
        "/api/v1/mobile/admin/inventory/summary",
    ]
    admin_headers = await _auth_headers_for_role(client, db_session, Role.ADMIN, "phase4-admin@test.com")
    manager_headers = await _auth_headers_for_role(client, db_session, Role.MANAGER, "phase4-manager@test.com")

    for headers in (admin_headers, manager_headers):
        for endpoint in endpoints:
            response = await client.get(endpoint, headers=headers)
            assert response.status_code == 200, endpoint
            body = response.json()
            assert body["success"] is True
            assert body["data"] is not None


@pytest.mark.asyncio
async def test_mobile_admin_summary_endpoints_reject_non_admin_control_roles(client: AsyncClient, db_session):
    endpoints = [
        "/api/v1/mobile/admin/home",
        "/api/v1/mobile/admin/people/summary",
        "/api/v1/mobile/admin/operations/summary",
        "/api/v1/mobile/admin/finance/summary",
        "/api/v1/mobile/admin/audit/summary",
        "/api/v1/mobile/admin/inventory/summary",
    ]
    customer_headers = await _auth_headers_for_role(client, db_session, Role.CUSTOMER, "phase4-customer@test.com")

    for endpoint in endpoints:
        response = await client.get(endpoint, headers=customer_headers)
        assert response.status_code == 403, endpoint
