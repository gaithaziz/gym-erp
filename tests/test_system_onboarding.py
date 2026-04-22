import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import security
from app.config import settings
from app.database import set_rls_context
from app.models.enums import Role
from app.models.tenancy import Branch, Gym, UserBranchAccess
from app.models.user import User


async def _login(client: AsyncClient, email: str, password: str = "password123") -> dict[str, str]:
    response = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200
    token = response.json()["data"]["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_system_onboarding_creates_atomic_records(client: AsyncClient, db_session: AsyncSession):
    super_admin = User(
        email=f"super-onboard-{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=security.get_password_hash("password123"),
        role=Role.SUPER_ADMIN,
        full_name="Super Admin",
        is_active=True,
    )
    db_session.add(super_admin)
    await db_session.commit()
    headers = await _login(client, super_admin.email)

    payload = {
        "name": "Atomic Fitness",
        "slug": f"atomic-{uuid.uuid4().hex[:6]}",
        "brand_name": "Atomic Brand",
        "admin_email": f"atomic-admin-{uuid.uuid4().hex[:6]}@example.com",
        "admin_password": "Password123",
        "plan_tier": "premium",
    }
    response = await client.post(f"{settings.API_V1_STR}/system/gyms/onboard", headers=headers, json=payload)
    assert response.status_code == 200
    data = response.json()["data"]
    gym_id = data["gym_id"]
    admin_id = data["admin_id"]
    await set_rls_context(db_session, role=Role.SUPER_ADMIN.value)

    gym = await db_session.get(Gym, uuid.UUID(gym_id))
    assert gym is not None
    assert gym.slug == payload["slug"]
    assert gym.plan_tier == "premium"

    branch = (
        await db_session.execute(
            select(Branch).where(Branch.gym_id == gym.id, Branch.slug == "main")
        )
    ).scalar_one_or_none()
    assert branch is not None

    admin = await db_session.get(User, uuid.UUID(admin_id))
    assert admin is not None
    assert admin.gym_id == gym.id
    assert admin.home_branch_id == branch.id

    access = (
        await db_session.execute(
            select(UserBranchAccess).where(
                UserBranchAccess.user_id == admin.id,
                UserBranchAccess.branch_id == branch.id,
            )
        )
    ).scalar_one_or_none()
    assert access is not None


@pytest.mark.asyncio
async def test_system_onboarding_conflicts_return_409_without_partial_writes(client: AsyncClient, db_session: AsyncSession):
    super_admin = User(
        email=f"super-onboard-conflict-{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=security.get_password_hash("password123"),
        role=Role.SUPER_ADMIN,
        full_name="Super Admin",
        is_active=True,
    )
    existing_admin = User(
        email=f"existing-admin-{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=security.get_password_hash("password123"),
        role=Role.ADMIN,
        full_name="Existing Admin",
        is_active=True,
    )
    db_session.add_all([super_admin, existing_admin])
    await db_session.commit()
    headers = await _login(client, super_admin.email)

    slug = f"conflict-{uuid.uuid4().hex[:6]}"
    seed_response = await client.post(
        f"{settings.API_V1_STR}/system/gyms/onboard",
        headers=headers,
        json={
            "name": "Existing Gym",
            "slug": slug,
            "brand_name": "Existing Gym",
            "admin_email": f"seed-admin-{uuid.uuid4().hex[:6]}@example.com",
            "admin_password": "Password123",
            "plan_tier": "standard",
        },
    )
    assert seed_response.status_code == 200
    await set_rls_context(db_session, role=Role.SUPER_ADMIN.value)

    before_count = (await db_session.execute(select(Gym.id))).scalars().all()
    before_total = len(before_count)

    slug_conflict = await client.post(
        f"{settings.API_V1_STR}/system/gyms/onboard",
        headers=headers,
        json={
            "name": "Conflict Slug Gym",
            "slug": slug,
            "brand_name": "Conflict Slug Gym",
            "admin_email": f"new-admin-{uuid.uuid4().hex[:6]}@example.com",
            "admin_password": "Password123",
            "plan_tier": "standard",
        },
    )
    assert slug_conflict.status_code == 409
    assert slug_conflict.json()["detail"]["code"] == "GYM_SLUG_CONFLICT"

    email_conflict = await client.post(
        f"{settings.API_V1_STR}/system/gyms/onboard",
        headers=headers,
        json={
            "name": "Conflict Email Gym",
            "slug": f"email-{uuid.uuid4().hex[:6]}",
            "brand_name": "Conflict Email Gym",
            "admin_email": existing_admin.email,
            "admin_password": "Password123",
            "plan_tier": "enterprise",
        },
    )
    assert email_conflict.status_code == 409
    assert email_conflict.json()["detail"]["code"] == "ADMIN_EMAIL_CONFLICT"

    invalid_plan = await client.post(
        f"{settings.API_V1_STR}/system/gyms/onboard",
        headers=headers,
        json={
            "name": "Invalid Plan Gym",
            "slug": f"plan-{uuid.uuid4().hex[:6]}",
            "brand_name": "Invalid Plan Gym",
            "admin_email": f"new-admin2-{uuid.uuid4().hex[:6]}@example.com",
            "admin_password": "Password123",
            "plan_tier": "invalid",
        },
    )
    assert invalid_plan.status_code == 422
    details = invalid_plan.json()["detail"]
    assert isinstance(details, list)
    assert any(item.get("code") == "INVALID_PLAN_TIER" for item in details)

    after_count = (await db_session.execute(select(Gym.id))).scalars().all()
    assert len(after_count) == before_total


@pytest.mark.asyncio
async def test_system_onboarding_password_validation_uses_typed_errors(client: AsyncClient, db_session: AsyncSession):
    super_admin = User(
        email=f"super-onboard-pass-{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=security.get_password_hash("password123"),
        role=Role.SUPER_ADMIN,
        full_name="Super Admin",
        is_active=True,
    )
    db_session.add(super_admin)
    await db_session.commit()
    headers = await _login(client, super_admin.email)

    weak_password_response = await client.post(
        f"{settings.API_V1_STR}/system/gyms/onboard",
        headers=headers,
        json={
            "name": "Weak Password Gym",
            "slug": f"weak-pass-{uuid.uuid4().hex[:6]}",
            "brand_name": "Weak Password Gym",
            "admin_email": f"weak-pass-admin-{uuid.uuid4().hex[:6]}@example.com",
            "admin_password": "weak",
            "plan_tier": "standard",
        },
    )
    assert weak_password_response.status_code == 422
    details = weak_password_response.json()["detail"]
    assert any(item.get("code") == "WEAK_ADMIN_PASSWORD" and item.get("field") == "admin_password" for item in details)
