from collections.abc import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

engine = create_async_engine(
    str(settings.SQLALCHEMY_DATABASE_URI),
    echo=False,
    future=True
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False
)

class Base(DeclarativeBase):
    pass


async def set_rls_context(
    session: AsyncSession,
    *,
    user_id: str | None = None,
    role: str | None = None,
) -> None:
    await session.execute(
        text(
            """
            SELECT
                set_config('app.current_user_id', :user_id, false),
                set_config('app.current_user_role', :user_role, false)
            """
        ),
        {
            "user_id": user_id or "",
            "user_role": role or "ANONYMOUS",
        },
    )


async def reset_rls_context(session: AsyncSession) -> None:
    await set_rls_context(session, user_id="", role="ANONYMOUS")

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            await reset_rls_context(session)
            yield session
        finally:
            try:
                await reset_rls_context(session)
            except Exception:
                pass
            await session.close()
