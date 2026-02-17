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
