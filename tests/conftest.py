import pytest
import asyncio
from typing import AsyncGenerator, Generator
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.config import settings
from app.database import Base, get_db
from app.main import app

# Use an in-memory SQLite database for testing, or a separate test DB.
# For async, sqlite+aiosqlite is good, but we configured Postgres.
# To allow testing without running a separate Postgres DB, we can use a different URL.
# However, user's env has POSTGRES_HOST=db or localhost.
# Let's try to use the same logic but maybe override the DB name if possible, OR just mock the session.
# But integration tests usually need a real DB.
# Let's assume the user wants us to run tests against the configured DB (or a test one).
# I'll use the configured DB for now but handle the loop.

# event_loop fixture removed as it is deprecated in pytest-asyncio

@pytest.fixture(scope="session")
async def db_engine():
    # Use SQLite for testing to avoid dependency on running Postgres
    from sqlalchemy.pool import StaticPool
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()

@pytest.fixture(scope="function")
async def db_session(db_engine) -> AsyncGenerator[AsyncSession, None]:
    async_session = async_sessionmaker(
        bind=db_engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False
    )
    async with async_session() as session:
        yield session

@pytest.fixture(scope="function")
async def client(db_session) -> AsyncGenerator[AsyncClient, None]:
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    from httpx import ASGITransport
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()

@pytest.fixture
async def admin_token_headers(client, db_session):
    from app.models.user import User
    from app.models.enums import Role
    from app.auth.security import get_password_hash
    import uuid

    # Create Admin User
    admin_data = {
        "email": "admin@test.com",
        "password": "password",
        "full_name": "Admin User",
        "role": Role.ADMIN
    }
    
    # Check if exists (unlikely in new db but good practice)
    from sqlalchemy import select
    res = await db_session.execute(select(User).where(User.email == admin_data["email"]))
    if not res.scalar_one_or_none():
        user = User(
            email=admin_data["email"],
            hashed_password=get_password_hash(admin_data["password"]),
            full_name=admin_data["full_name"],
            role=admin_data["role"],
            is_active=True
        )
        db_session.add(user)
        await db_session.commit()

    # Login
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": admin_data["email"], "password": admin_data["password"]}
    )
    token = response.json()["data"]["access_token"]
    return {"Authorization": f"Bearer {token}"}
