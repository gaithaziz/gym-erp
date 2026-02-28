import pytest
from alembic import command
from alembic.config import Config
from typing import AsyncGenerator
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import NullPool
from app.database import get_db, set_rls_context
from app.config import settings
from app.main import app
from app.core.rate_limit import reset_rate_limiter_state

@pytest.fixture(scope="session", autouse=True)
def migrated_test_database():
    alembic_cfg = Config("alembic.ini")
    command.upgrade(alembic_cfg, "head")
    yield


@pytest.fixture(scope="function")
async def db_engine():
    engine = create_async_engine(
        str(settings.SQLALCHEMY_DATABASE_URI),
        poolclass=NullPool,
    )
    yield engine
    await engine.dispose()

@pytest.fixture(scope="function")
async def db_session(db_engine, migrated_test_database) -> AsyncGenerator[AsyncSession, None]:
    async def _reset_postgres(session: AsyncSession) -> None:
        await session.rollback()
        table_names = [
            row[0]
            for row in (
                await session.execute(
                    text(
                        """
                        SELECT tablename
                        FROM pg_tables
                        WHERE schemaname = 'public'
                          AND tablename <> 'alembic_version'
                        """
                    )
                )
            ).all()
        ]
        if table_names:
            joined = ", ".join(f'"public"."{name}"' for name in table_names)
            await session.execute(text(f"TRUNCATE TABLE {joined} RESTART IDENTITY CASCADE"))
            await session.commit()

    async_session = async_sessionmaker(
        bind=db_engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False
    )
    async with async_session() as session:
        await set_rls_context(session, role="ADMIN")
        await _reset_postgres(session)
        await set_rls_context(session, role="ADMIN")
        yield session
        await _reset_postgres(session)

@pytest.fixture(scope="function")
async def client(db_session) -> AsyncGenerator[AsyncClient, None]:
    await reset_rate_limiter_state()

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    from httpx import ASGITransport
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()
    await reset_rate_limiter_state()

@pytest.fixture
async def admin_token_headers(client, db_session):
    from app.models.user import User
    from app.models.enums import Role
    from app.auth.security import get_password_hash

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
