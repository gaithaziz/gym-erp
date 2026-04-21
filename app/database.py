from collections.abc import AsyncGenerator
from uuid import UUID

from sqlalchemy import event, text
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


def _rls_params_for_session(session: AsyncSession | object) -> dict[str, str]:
    info = getattr(session, "info", {})

    def _to_str(value: object | None) -> str:
        if value in (None, ""):
            return ""
        return str(value)

    return {
        "user_id": _to_str(info.get("rls_user_id", "")),
        "user_role": _to_str(info.get("rls_user_role", "ANONYMOUS")) or "ANONYMOUS",
        "gym_id": _to_str(info.get("rls_gym_id", "")),
        "branch_id": _to_str(info.get("rls_branch_id", "")),
    }


def _coerce_uuid(value: str | UUID | None) -> str | UUID | None:
    if value in (None, ""):
        return None if value is None else ""
    if isinstance(value, UUID):
        return value
    try:
        return UUID(str(value))
    except (ValueError, TypeError):
        return value


@event.listens_for(AsyncSession.sync_session_class, "after_begin")
def _apply_rls_context_on_transaction_begin(sync_session, transaction, connection) -> None:
    del transaction
    connection.execute(
        text(
            """
            SELECT
                set_config('app.current_user_id', :user_id, false),
                set_config('app.current_user_role', :user_role, false),
                set_config('app.current_gym_id', :gym_id, false),
                set_config('app.current_branch_id', :branch_id, false)
            """
        ),
        _rls_params_for_session(sync_session),
    )


@event.listens_for(AsyncSession.sync_session_class, "before_flush")
def _autostamp_tenant_context(sync_session, flush_context, instances) -> None:
    del flush_context, instances
    gym_id = _coerce_uuid(sync_session.info.get("rls_gym_id"))
    branch_id = _coerce_uuid(sync_session.info.get("rls_branch_id"))
    for obj in sync_session.new:
        if hasattr(obj, "gym_id") and getattr(obj, "gym_id", None) in (None, "") and gym_id:
            setattr(obj, "gym_id", gym_id)
        if hasattr(obj, "branch_id") and getattr(obj, "branch_id", None) in (None, "") and branch_id:
            setattr(obj, "branch_id", branch_id)
        if hasattr(obj, "home_branch_id") and getattr(obj, "home_branch_id", None) in (None, "") and branch_id:
            setattr(obj, "home_branch_id", branch_id)


async def set_rls_context(
    session: AsyncSession,
    *,
    user_id: str | UUID | None = None,
    role: str | None = None,
    gym_id: str | UUID | None = None,
    branch_id: str | UUID | None = None,
) -> None:
    if user_id is not None:
        session.info["rls_user_id"] = _coerce_uuid(user_id)
    elif "rls_user_id" not in session.info:
        session.info["rls_user_id"] = ""

    if role is not None:
        session.info["rls_user_role"] = role
    elif "rls_user_role" not in session.info:
        session.info["rls_user_role"] = "ANONYMOUS"

    if gym_id is not None:
        session.info["rls_gym_id"] = _coerce_uuid(gym_id)
    elif "rls_gym_id" not in session.info:
        session.info["rls_gym_id"] = ""

    if branch_id is not None:
        session.info["rls_branch_id"] = _coerce_uuid(branch_id)
    elif "rls_branch_id" not in session.info:
        session.info["rls_branch_id"] = ""
    await session.execute(
        text(
            """
            SELECT
                set_config('app.current_user_id', :user_id, false),
                set_config('app.current_user_role', :user_role, false),
                set_config('app.current_gym_id', :gym_id, false),
                set_config('app.current_branch_id', :branch_id, false)
            """
        ),
        _rls_params_for_session(session),
    )


async def reset_rls_context(session: AsyncSession) -> None:
    await set_rls_context(session, user_id="", role="ANONYMOUS", gym_id="", branch_id="")

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
