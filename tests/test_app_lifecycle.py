import asyncio
import sys
from types import ModuleType

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.auth.security import get_password_hash, verify_password
from app.core import startup
from app.core import schedulers
from app.core.startup import (
    DEMO_SEED_MARKER_KEY,
    LOCAL_ADMIN_EMAIL,
    LOCAL_ADMIN_PASSWORD,
    ensure_demo_classes_seed,
    ensure_local_admin_user,
)
from app.models.enums import Role
from app.models.system import SystemConfig
from app.models.user import User
from app.services.tenancy_service import TenancyService


@pytest.fixture(autouse=True)
async def cleanup_scheduler_tasks():
    await schedulers.stop_background_schedulers()
    yield
    await schedulers.stop_background_schedulers()
    schedulers.payroll_scheduler_task = None
    schedulers.subscription_scheduler_task = None


@pytest.fixture
def startup_session_factory(monkeypatch: pytest.MonkeyPatch, db_engine):
    session_factory = async_sessionmaker(
        bind=db_engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
    )
    monkeypatch.setattr(startup, "AsyncSessionLocal", session_factory)
    return session_factory


def test_background_schedulers_are_disabled_in_test_env(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(schedulers.settings, "APP_ENV", "test")
    monkeypatch.setattr(schedulers.settings, "BACKGROUND_TASKS_ENABLED_IN_TESTS", False)

    tasks = schedulers.start_background_schedulers()

    assert tasks == []
    assert schedulers.payroll_scheduler_task is None
    assert schedulers.subscription_scheduler_task is None


def test_subscription_scheduler_respects_disabled_config(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(schedulers.settings, "APP_ENV", "development")
    monkeypatch.setattr(schedulers.settings, "SUBSCRIPTION_AUTO_ENABLED", False)
    monkeypatch.setattr(schedulers.settings, "PAYROLL_AUTO_ENABLED", False)

    tasks = schedulers.start_background_schedulers()

    assert tasks == []
    assert schedulers.subscription_scheduler_task is None


@pytest.mark.asyncio
async def test_subscription_scheduler_duplicate_start_is_guarded(monkeypatch: pytest.MonkeyPatch):
    async def idle_subscription_loop():
        await asyncio.Event().wait()

    monkeypatch.setattr(schedulers.settings, "APP_ENV", "development")
    monkeypatch.setattr(schedulers.settings, "BACKGROUND_TASKS_ENABLED_IN_TESTS", True)
    monkeypatch.setattr(schedulers.settings, "SUBSCRIPTION_AUTO_ENABLED", True)
    monkeypatch.setattr(schedulers.settings, "PAYROLL_AUTO_ENABLED", False)
    monkeypatch.setattr(schedulers, "_subscription_scheduler_loop", idle_subscription_loop)

    first_tasks = schedulers.start_background_schedulers()
    first_task = schedulers.subscription_scheduler_task
    second_tasks = schedulers.start_background_schedulers()

    assert len(first_tasks) == 1
    assert len(second_tasks) == 1
    assert first_task is not None
    assert schedulers.subscription_scheduler_task is first_task


@pytest.mark.asyncio
async def test_local_admin_is_created_in_development(
    monkeypatch: pytest.MonkeyPatch,
    db_session,
    startup_session_factory,
):
    monkeypatch.setattr(schedulers.settings, "APP_ENV", "development")

    await ensure_local_admin_user()

    user = (
        await db_session.execute(select(User).where(User.email == LOCAL_ADMIN_EMAIL))
    ).scalar_one_or_none()
    assert user is not None
    assert user.role == Role.ADMIN
    assert verify_password(LOCAL_ADMIN_PASSWORD, user.hashed_password)


@pytest.mark.asyncio
async def test_existing_local_admin_password_reset_is_configurable(
    monkeypatch: pytest.MonkeyPatch,
    db_session,
    startup_session_factory,
):
    monkeypatch.setattr(schedulers.settings, "APP_ENV", "development")
    monkeypatch.setattr(schedulers.settings, "RESET_LOCAL_ADMIN_ON_STARTUP", False)
    gym, branch = await TenancyService.ensure_default_gym_and_branch(db_session)
    original_password = "DoNotReset123!"
    db_session.add(
        User(
            gym_id=gym.id,
            email=LOCAL_ADMIN_EMAIL,
            hashed_password=get_password_hash(original_password),
            full_name="Existing Admin",
            role=Role.ADMIN,
            is_active=True,
            home_branch_id=branch.id,
        )
    )
    await db_session.commit()

    await ensure_local_admin_user()
    preserved_user = (
        await db_session.execute(select(User).where(User.email == LOCAL_ADMIN_EMAIL))
    ).scalar_one()
    assert verify_password(original_password, preserved_user.hashed_password)

    monkeypatch.setattr(schedulers.settings, "RESET_LOCAL_ADMIN_ON_STARTUP", True)
    await ensure_local_admin_user()
    db_session.expire_all()
    reset_user = (
        await db_session.execute(select(User).where(User.email == LOCAL_ADMIN_EMAIL))
    ).scalar_one()
    assert verify_password(LOCAL_ADMIN_PASSWORD, reset_user.hashed_password)


@pytest.mark.asyncio
async def test_demo_seed_marker_controls_startup_seed(
    monkeypatch: pytest.MonkeyPatch,
    db_session,
    startup_session_factory,
):
    calls = 0
    fake_seed_module = ModuleType("app.seed_demo_data")

    async def fake_seed_demo_data():
        nonlocal calls
        calls += 1

    fake_seed_module.seed_demo_data = fake_seed_demo_data
    monkeypatch.setitem(sys.modules, "app.seed_demo_data", fake_seed_module)
    monkeypatch.setattr(schedulers.settings, "APP_ENV", "development")
    monkeypatch.setattr(schedulers.settings, "DEMO_SEED_ON_STARTUP", True)

    await ensure_demo_classes_seed()

    marker = (
        await db_session.execute(select(SystemConfig).where(SystemConfig.key == DEMO_SEED_MARKER_KEY))
    ).scalar_one_or_none()
    assert calls == 1
    assert marker is not None
    assert marker.value_bool is True

    await ensure_demo_classes_seed()
    assert calls == 1
