import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.security import get_password_hash
from app.config import settings
from app.models.enums import Role
from app.models.tenancy import Branch
from app.models.user import User
from app.services.tenancy_service import TenancyService


async def _login_headers(client: AsyncClient, *, email: str, password: str) -> dict[str, str]:
    login_resp = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": email, "password": password},
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["data"]["access_token"]
    return {"Authorization": f"Bearer {token}"}


async def _create_user(
    db_session: AsyncSession,
    *,
    email: str,
    password: str,
    role: Role,
    gym_id,
    home_branch_id,
) -> User:
    user = User(
        gym_id=gym_id,
        email=email,
        hashed_password=get_password_hash(password),
        full_name=email.split("@")[0],
        role=role,
        is_active=True,
        home_branch_id=home_branch_id,
    )
    db_session.add(user)
    await db_session.flush()
    if home_branch_id is not None:
        await TenancyService.ensure_user_branch_access(
            db_session,
            user_id=user.id,
            gym_id=gym_id,
            branch_id=home_branch_id,
        )
    await db_session.commit()
    await db_session.refresh(user)
    return user


async def _create_secondary_branch(db_session: AsyncSession, *, gym_id) -> Branch:
    suffix = uuid.uuid4().hex[:6]
    branch = Branch(
        gym_id=gym_id,
        slug=f"branch-{suffix}",
        code=f"B{suffix.upper()}",
        name=f"Branch {suffix}",
        display_name=f"Branch {suffix}",
    )
    db_session.add(branch)
    await db_session.commit()
    await db_session.refresh(branch)
    return branch


@pytest.mark.asyncio
async def test_finance_summary_respects_branch_filter_and_all_branches(
    client: AsyncClient,
    db_session: AsyncSession,
):
    gym, branch_a = await TenancyService.ensure_default_gym_and_branch(db_session)
    await db_session.commit()
    branch_b = await _create_secondary_branch(db_session, gym_id=gym.id)

    admin = await _create_user(
        db_session,
        email=f"branch_fin_admin_{uuid.uuid4().hex[:8]}@gym.com",
        password="password123",
        role=Role.ADMIN,
        gym_id=gym.id,
        home_branch_id=branch_a.id,
    )
    headers = await _login_headers(client, email=admin.email, password="password123")

    tx_a = await client.post(
        f"{settings.API_V1_STR}/finance/transactions",
        json={
            "amount": 120.0,
            "type": "INCOME",
            "category": "OTHER_INCOME",
            "description": "Branch A income",
            "payment_method": "CASH",
            "branch_id": str(branch_a.id),
        },
        headers=headers,
    )
    assert tx_a.status_code == 200

    tx_b = await client.post(
        f"{settings.API_V1_STR}/finance/transactions",
        json={
            "amount": 80.0,
            "type": "INCOME",
            "category": "OTHER_INCOME",
            "description": "Branch B income",
            "payment_method": "CASH",
            "branch_id": str(branch_b.id),
        },
        headers=headers,
    )
    assert tx_b.status_code == 200

    summary_all = await client.get(f"{settings.API_V1_STR}/finance/summary", headers=headers)
    assert summary_all.status_code == 200
    assert summary_all.json()["data"]["total_income"] == 200.0

    summary_a = await client.get(
        f"{settings.API_V1_STR}/finance/summary",
        params={"branch_id": str(branch_a.id)},
        headers=headers,
    )
    assert summary_a.status_code == 200
    assert summary_a.json()["data"]["total_income"] == 120.0

    summary_b = await client.get(
        f"{settings.API_V1_STR}/finance/summary",
        params={"branch_id": str(branch_b.id)},
        headers=headers,
    )
    assert summary_b.status_code == 200
    assert summary_b.json()["data"]["total_income"] == 80.0


@pytest.mark.asyncio
async def test_inventory_denies_cross_branch_filter_for_non_admin(
    client: AsyncClient,
    db_session: AsyncSession,
):
    gym, branch_a = await TenancyService.ensure_default_gym_and_branch(db_session)
    await db_session.commit()
    branch_b = await _create_secondary_branch(db_session, gym_id=gym.id)

    admin = await _create_user(
        db_session,
        email=f"branch_inv_admin_{uuid.uuid4().hex[:8]}@gym.com",
        password="password123",
        role=Role.ADMIN,
        gym_id=gym.id,
        home_branch_id=branch_a.id,
    )
    employee = await _create_user(
        db_session,
        email=f"branch_inv_employee_{uuid.uuid4().hex[:8]}@gym.com",
        password="password123",
        role=Role.EMPLOYEE,
        gym_id=gym.id,
        home_branch_id=branch_a.id,
    )

    admin_headers = await _login_headers(client, email=admin.email, password="password123")
    employee_headers = await _login_headers(client, email=employee.email, password="password123")

    create_a = await client.post(
        f"{settings.API_V1_STR}/inventory/products",
        json={
            "name": "Branch A Product",
            "category": "OTHER",
            "price": 10.0,
            "stock_quantity": 5,
            "low_stock_threshold": 2,
            "branch_id": str(branch_a.id),
        },
        headers=admin_headers,
    )
    assert create_a.status_code == 200

    create_b = await client.post(
        f"{settings.API_V1_STR}/inventory/products",
        json={
            "name": "Branch B Product",
            "category": "OTHER",
            "price": 12.0,
            "stock_quantity": 7,
            "low_stock_threshold": 2,
            "branch_id": str(branch_b.id),
        },
        headers=admin_headers,
    )
    assert create_b.status_code == 200

    list_default = await client.get(f"{settings.API_V1_STR}/inventory/products", headers=employee_headers)
    assert list_default.status_code == 200
    names = [row["name"] for row in list_default.json()["data"]]
    assert "Branch A Product" in names
    assert "Branch B Product" not in names

    forbidden = await client.get(
        f"{settings.API_V1_STR}/inventory/products",
        params={"branch_id": str(branch_b.id)},
        headers=employee_headers,
    )
    assert forbidden.status_code == 403
    assert forbidden.json()["detail"] == "Not authorized for this branch"


@pytest.mark.asyncio
async def test_super_admin_analytics_supports_all_and_branch_specific_modes(
    client: AsyncClient,
    db_session: AsyncSession,
):
    gym, branch_a = await TenancyService.ensure_default_gym_and_branch(db_session)
    await db_session.commit()
    branch_b = await _create_secondary_branch(db_session, gym_id=gym.id)

    admin = await _create_user(
        db_session,
        email=f"branch_analytics_admin_{uuid.uuid4().hex[:8]}@gym.com",
        password="password123",
        role=Role.ADMIN,
        gym_id=gym.id,
        home_branch_id=branch_a.id,
    )
    super_admin = await _create_user(
        db_session,
        email=f"branch_analytics_super_{uuid.uuid4().hex[:8]}@gym.com",
        password="password123",
        role=Role.SUPER_ADMIN,
        gym_id=gym.id,
        home_branch_id=branch_a.id,
    )

    admin_headers = await _login_headers(client, email=admin.email, password="password123")
    super_headers = await _login_headers(client, email=super_admin.email, password="password123")

    tx_a = await client.post(
        f"{settings.API_V1_STR}/finance/transactions",
        json={
            "amount": 300.0,
            "type": "INCOME",
            "category": "OTHER_INCOME",
            "description": "A income",
            "payment_method": "CASH",
            "branch_id": str(branch_a.id),
        },
        headers=admin_headers,
    )
    assert tx_a.status_code == 200

    tx_b = await client.post(
        f"{settings.API_V1_STR}/finance/transactions",
        json={
            "amount": 50.0,
            "type": "INCOME",
            "category": "OTHER_INCOME",
            "description": "B income",
            "payment_method": "CASH",
            "branch_id": str(branch_b.id),
        },
        headers=admin_headers,
    )
    assert tx_b.status_code == 200

    dashboard_all = await client.get(f"{settings.API_V1_STR}/analytics/dashboard", headers=super_headers)
    assert dashboard_all.status_code == 200
    assert dashboard_all.json()["data"]["monthly_revenue"] == 350.0

    dashboard_a = await client.get(
        f"{settings.API_V1_STR}/analytics/dashboard",
        params={"branch_id": str(branch_a.id)},
        headers=super_headers,
    )
    assert dashboard_a.status_code == 200
    assert dashboard_a.json()["data"]["monthly_revenue"] == 300.0

    comparison_all = await client.get(f"{settings.API_V1_STR}/analytics/branch-comparison", headers=super_headers)
    assert comparison_all.status_code == 200
    payload_all = comparison_all.json()["data"]
    compared_branch_ids = {row["branch_id"] for row in payload_all["branches"]}
    assert str(branch_a.id) in compared_branch_ids
    assert str(branch_b.id) in compared_branch_ids

    comparison_b = await client.get(
        f"{settings.API_V1_STR}/analytics/branch-comparison",
        params={"branch_id": str(branch_b.id)},
        headers=super_headers,
    )
    assert comparison_b.status_code == 200
    payload_b = comparison_b.json()["data"]
    assert payload_b["total_branches"] == 1
    assert payload_b["top_branch"]["branch_id"] == str(branch_b.id)
