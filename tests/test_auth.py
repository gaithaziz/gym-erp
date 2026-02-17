import pytest
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

    # Get tokens
    refresh_token = security.create_refresh_token(subject=email)
    
    # Use refresh token
    response = await client.post(
        f"{settings.API_V1_STR}/auth/refresh",
        headers={"Authorization": f"Bearer {refresh_token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "access_token" in data["data"]

@pytest.mark.asyncio
async def test_refresh_token_invalid(client: AsyncClient):
    response = await client.post(
        f"{settings.API_V1_STR}/auth/refresh",
        headers={"Authorization": "Bearer invalid_token"}
    )
    assert response.status_code == 401
