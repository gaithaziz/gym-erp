import pytest
from datetime import date, timedelta
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.auth import security
from app.models.user import User
from app.models.enums import Role
from app.config import settings

@pytest.mark.asyncio
async def test_login_success(client: AsyncClient, db_session: AsyncSession):
    # Create a user
    email = "test@example.com"
    password = "password123"
    hashed_password = security.get_password_hash(password)
    user = User(email=email, hashed_password=hashed_password, role=Role.CUSTOMER)
    db_session.add(user)
    await db_session.commit()

    response = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": email, "password": password}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "access_token" in data["data"]
    assert "refresh_token" in data["data"]
    assert data["data"]["token_type"] == "bearer"

@pytest.mark.asyncio
async def test_login_invalid_credentials(client: AsyncClient, db_session: AsyncSession):
    response = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": "wrong@example.com", "password": "wrongpassword"}
    )
    assert response.status_code == 401

@pytest.mark.asyncio
async def test_refresh_token_success(client: AsyncClient, db_session: AsyncSession):
    # Create user
    email = "refresh@example.com"
    password = "password123"
    hashed_password = security.get_password_hash(password)
    user = User(email=email, hashed_password=hashed_password, role=Role.CUSTOMER)
    db_session.add(user)
    await db_session.commit()

    # Login to get a tracked refresh token
    login_response = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": email, "password": password}
    )
    assert login_response.status_code == 200
    refresh_token = login_response.json()["data"]["refresh_token"]
    
    # Use refresh token
    response = await client.post(
        f"{settings.API_V1_STR}/auth/refresh",
        headers={"Authorization": f"Bearer {refresh_token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "access_token" in data["data"]
    assert "refresh_token" in data["data"]


@pytest.mark.asyncio
async def test_refresh_token_rotation_revokes_old_token(client: AsyncClient, db_session: AsyncSession):
    email = "rotation@example.com"
    password = "password123"
    hashed_password = security.get_password_hash(password)
    user = User(email=email, hashed_password=hashed_password, role=Role.CUSTOMER)
    db_session.add(user)
    await db_session.commit()

    login_response = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": email, "password": password}
    )
    assert login_response.status_code == 200
    first_refresh = login_response.json()["data"]["refresh_token"]

    rotate_response = await client.post(
        f"{settings.API_V1_STR}/auth/refresh",
        headers={"Authorization": f"Bearer {first_refresh}"}
    )
    assert rotate_response.status_code == 200
    second_refresh = rotate_response.json()["data"]["refresh_token"]
    assert second_refresh != first_refresh

    reuse_old_response = await client.post(
        f"{settings.API_V1_STR}/auth/refresh",
        headers={"Authorization": f"Bearer {first_refresh}"}
    )
    assert reuse_old_response.status_code == 401

@pytest.mark.asyncio
async def test_refresh_token_invalid(client: AsyncClient):
    response = await client.post(
        f"{settings.API_V1_STR}/auth/refresh",
        headers={"Authorization": "Bearer invalid_token"}
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_login_rate_limit_triggers(client: AsyncClient):
    for _ in range(5):
        response = await client.post(
            f"{settings.API_V1_STR}/auth/login",
            json={"email": "wrong@example.com", "password": "wrongpassword"},
        )
        assert response.status_code == 401

    blocked = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": "wrong@example.com", "password": "wrongpassword"},
    )
    assert blocked.status_code == 429
    assert "retry" in blocked.json()["detail"].lower()


@pytest.mark.asyncio
async def test_refresh_rate_limit_triggers(client: AsyncClient):
    for _ in range(10):
        response = await client.post(
            f"{settings.API_V1_STR}/auth/refresh",
            headers={"Authorization": "Bearer invalid_token"},
        )
        assert response.status_code == 401

    blocked = await client.post(
        f"{settings.API_V1_STR}/auth/refresh",
        headers={"Authorization": "Bearer invalid_token"},
    )
    assert blocked.status_code == 429


@pytest.mark.asyncio
async def test_update_me_profile_validation(client: AsyncClient, db_session: AsyncSession):
    email = "validate@example.com"
    password = "password123"
    hashed_password = security.get_password_hash(password)
    user = User(email=email, hashed_password=hashed_password, role=Role.CUSTOMER)
    db_session.add(user)
    await db_session.commit()

    login_response = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": email, "password": password}
    )
    token = login_response.json()["data"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    invalid_phone_response = await client.put(
        f"{settings.API_V1_STR}/auth/me",
        json={"phone_number": "abc-invalid"},
        headers=headers,
    )
    assert invalid_phone_response.status_code == 422
    assert "request_id" in invalid_phone_response.json()
    assert "x-request-id" in invalid_phone_response.headers

    future_dob = (date.today() + timedelta(days=1)).isoformat()
    invalid_dob_response = await client.put(
        f"{settings.API_V1_STR}/auth/me",
        json={"date_of_birth": future_dob},
        headers=headers,
    )
    assert invalid_dob_response.status_code == 422
    assert "request_id" in invalid_dob_response.json()

    too_long_bio_response = await client.put(
        f"{settings.API_V1_STR}/auth/me",
        json={"bio": "x" * 501},
        headers=headers,
    )
    assert too_long_bio_response.status_code == 422
    assert "request_id" in too_long_bio_response.json()
