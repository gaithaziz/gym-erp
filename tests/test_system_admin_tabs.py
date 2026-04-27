import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import security
from app.config import settings
from app.database import set_rls_context
from app.models.access import Subscription
from app.models.finance import Transaction, TransactionCategory, TransactionType
from app.models.enums import Role
from app.models.subscription_enums import SubscriptionStatus
from app.models.tenancy import Branch, Gym
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
async def test_system_users_search_returns_paginated_recent_users_and_query_filter(client: AsyncClient, db_session: AsyncSession):
    await set_rls_context(db_session, role=Role.SUPER_ADMIN.value)

    super_admin = User(
        email=f"super-users-{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=security.get_password_hash("password123"),
        role=Role.SUPER_ADMIN,
        full_name="Super Admin",
        is_active=True,
    )
    user_alpha = User(
        email=f"alpha-{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=security.get_password_hash("password123"),
        role=Role.ADMIN,
        full_name="Alpha Person",
        is_active=True,
    )
    user_beta = User(
        email=f"beta-{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=security.get_password_hash("password123"),
        role=Role.COACH,
        full_name="Beta Person",
        is_active=True,
    )
    db_session.add_all([super_admin, user_alpha, user_beta])
    await db_session.flush()

    await db_session.commit()

    headers = await _login(client, super_admin.email)

    recent_resp = await client.get(
        f"{settings.API_V1_STR}/system/users/search",
        headers=headers,
        params={"page": 1, "limit": 2},
    )
    assert recent_resp.status_code == 200
    payload = recent_resp.json()["data"]
    assert set(payload.keys()) == {"items", "total", "page", "limit"}
    assert payload["page"] == 1
    assert payload["limit"] == 2
    assert payload["total"] >= 3
    assert len(payload["items"]) <= 2

    query_resp = await client.get(
        f"{settings.API_V1_STR}/system/users/search",
        headers=headers,
        params={"q": "Alpha", "page": 1, "limit": 20},
    )
    assert query_resp.status_code == 200
    query_items = query_resp.json()["data"]["items"]
    assert any("Alpha" in (item.get("full_name") or "") for item in query_items)


@pytest.mark.asyncio
async def test_system_audit_logs_returns_paginated_data_and_filters(client: AsyncClient, db_session: AsyncSession):
    await set_rls_context(db_session, role=Role.SUPER_ADMIN.value)

    super_admin = User(
        email=f"super-audit-{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=security.get_password_hash("password123"),
        role=Role.SUPER_ADMIN,
        full_name="Super Admin",
        is_active=True,
    )
    db_session.add(super_admin)
    await db_session.flush()

    await db_session.commit()

    headers = await _login(client, super_admin.email)
    now = datetime.now(timezone.utc)

    # Generate real audit events via API flows
    maint_resp = await client.post(
        f"{settings.API_V1_STR}/system/config/maintenance",
        headers=headers,
        json={"is_maintenance_mode": True},
    )
    assert maint_resp.status_code == 200

    maint_resp_reset = await client.post(
        f"{settings.API_V1_STR}/system/config/maintenance",
        headers=headers,
        json={"is_maintenance_mode": False},
    )
    assert maint_resp_reset.status_code == 200

    paged_resp = await client.get(
        f"{settings.API_V1_STR}/system/audit-logs",
        headers=headers,
        params={"page": 1, "limit": 1},
    )
    assert paged_resp.status_code == 200
    paged = paged_resp.json()["data"]
    assert paged["page"] == 1
    assert paged["limit"] == 1
    assert paged["total"] >= 2
    assert len(paged["items"]) == 1

    filtered_resp = await client.get(
        f"{settings.API_V1_STR}/system/audit-logs",
        headers=headers,
        params={"action": "GLOBAL_MAINTENANCE_TOGGLED", "page": 1, "limit": 20},
    )
    assert filtered_resp.status_code == 200
    filtered_items = filtered_resp.json()["data"]["items"]
    assert len(filtered_items) >= 1
    assert all(item["action"] == "GLOBAL_MAINTENANCE_TOGGLED" for item in filtered_items)

    date_filtered_resp = await client.get(
        f"{settings.API_V1_STR}/system/audit-logs",
        headers=headers,
        params={
            "from": (now - timedelta(days=1)).date().isoformat(),
            "to": now.date().isoformat(),
            "page": 1,
            "limit": 20,
        },
    )
    assert date_filtered_resp.status_code == 200
    date_items = date_filtered_resp.json()["data"]["items"]
    assert any(item["action"] == "GLOBAL_MAINTENANCE_TOGGLED" for item in date_items)


@pytest.mark.asyncio
async def test_system_audit_logs_empty_state_contract(client: AsyncClient, db_session: AsyncSession):
    await set_rls_context(db_session, role=Role.SUPER_ADMIN.value)

    super_admin = User(
        email=f"super-empty-audit-{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=security.get_password_hash("password123"),
        role=Role.SUPER_ADMIN,
        full_name="Super Admin",
        is_active=True,
    )
    db_session.add(super_admin)
    await db_session.commit()

    headers = await _login(client, super_admin.email)

    empty_resp = await client.get(
        f"{settings.API_V1_STR}/system/audit-logs",
        headers=headers,
        params={"action": "NON_EXISTING_ACTION", "page": 1, "limit": 20},
    )
    assert empty_resp.status_code == 200
    payload = empty_resp.json()["data"]
    assert payload["items"] == []
    assert payload["total"] == 0
    assert payload["page"] == 1
    assert payload["limit"] == 20


@pytest.mark.asyncio
async def test_system_stats_reports_clear_global_metrics(
    client: AsyncClient,
    db_session: AsyncSession,
    superadmin_token_headers: dict[str, str],
):
    await set_rls_context(db_session, role=Role.SUPER_ADMIN.value)

    gym = (await db_session.execute(select(Gym).order_by(Gym.created_at.asc()))).scalar_one()
    branch = (await db_session.execute(select(Branch).where(Branch.gym_id == gym.id).order_by(Branch.created_at.asc()))).scalar_one()

    active_user = User(
        email=f"stats-active-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password=security.get_password_hash("password123"),
        role=Role.CUSTOMER,
        full_name="Active Member",
        is_active=True,
        gym_id=gym.id,
        home_branch_id=branch.id,
    )
    inactive_user = User(
        email=f"stats-inactive-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password=security.get_password_hash("password123"),
        role=Role.CUSTOMER,
        full_name="Inactive Member",
        is_active=False,
        gym_id=gym.id,
        home_branch_id=branch.id,
    )
    db_session.add_all([active_user, inactive_user])
    await db_session.flush()

    db_session.add(
        Subscription(
            gym_id=gym.id,
            user_id=active_user.id,
            plan_name="Monthly",
            start_date=datetime.now(timezone.utc) - timedelta(days=10),
            end_date=datetime.now(timezone.utc) + timedelta(days=20),
            status=SubscriptionStatus.ACTIVE,
        )
    )
    db_session.add(
        Transaction(
            gym_id=gym.id,
            branch_id=branch.id,
            amount=Decimal("120.00"),
            type=TransactionType.INCOME,
            category=TransactionCategory.SUBSCRIPTION,
            description="Membership renewal",
            date=datetime.now(timezone.utc) - timedelta(days=2),
        )
    )
    db_session.add(
        Transaction(
            gym_id=gym.id,
            branch_id=branch.id,
            amount=Decimal("35.00"),
            type=TransactionType.EXPENSE,
            category=TransactionCategory.UTILITIES,
            description="Electricity bill",
            date=datetime.now(timezone.utc) - timedelta(days=1),
        )
    )
    await db_session.commit()

    stats_resp = await client.get(
        f"{settings.API_V1_STR}/system/stats",
        headers=superadmin_token_headers,
    )
    assert stats_resp.status_code == 200
    stats = stats_resp.json()
    assert stats["total_gyms"] == 1
    assert stats["total_branches"] == 1
    assert stats["total_users"] == 3
    assert stats["active_users"] == 2
    assert stats["active_subscriptions"] == 1
    assert stats["global_maintenance"] is False

    revenue_resp = await client.get(
        f"{settings.API_V1_STR}/system/analytics/revenue",
        headers=superadmin_token_headers,
        params={"days": 30},
    )
    assert revenue_resp.status_code == 200
    revenue_rows = revenue_resp.json()
    assert any(row["income"] > 0 for row in revenue_rows)
    assert any(row["expense"] > 0 for row in revenue_rows)
