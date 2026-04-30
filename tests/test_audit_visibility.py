import uuid

import pytest
from sqlalchemy import select

from app.auth.security import get_password_hash
from app.database import set_rls_context
from app.models.audit import AuditLog
from app.models.enums import Role
from app.models.tenancy import Branch, UserBranchAccess
from app.models.user import User


async def _login_headers(client, email: str, password: str) -> dict[str, str]:
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200
    token = response.json()["data"]["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_admin_and_manager_can_view_audit_logs(client, db_session, admin_token_headers):
    admin = (
        await db_session.execute(select(User).where(User.email == "admin@test.com"))
    ).scalar_one()
    branch = (
        await db_session.execute(select(Branch).where(Branch.gym_id == admin.gym_id).order_by(Branch.created_at.asc()))
    ).scalars().first()
    assert branch is not None

    manager_email = f"manager-audit-{uuid.uuid4().hex[:8]}@gym.com"
    manager = User(
        gym_id=admin.gym_id,
        email=manager_email,
        hashed_password=get_password_hash("password"),
        full_name="Manager User",
        role=Role.MANAGER,
        is_active=True,
        home_branch_id=branch.id,
    )
    db_session.add(manager)
    await db_session.flush()
    db_session.add(
        UserBranchAccess(
            user_id=manager.id,
            gym_id=admin.gym_id,
            branch_id=branch.id,
        )
    )
    await db_session.commit()

    await set_rls_context(db_session, user_id=str(admin.id), role=Role.ADMIN.value, gym_id=str(admin.gym_id), branch_id=str(branch.id))
    db_session.add(
        AuditLog(
            gym_id=admin.gym_id,
            branch_id=branch.id,
            user_id=admin.id,
            action="BRANCH_AUDIT_EVENT",
            target_id=str(branch.id),
            details="branch scoped event",
        )
    )
    await db_session.flush()

    await set_rls_context(db_session, user_id=str(admin.id), role=Role.ADMIN.value, gym_id=str(admin.gym_id), branch_id="")
    db_session.add(
        AuditLog(
            gym_id=admin.gym_id,
            user_id=admin.id,
            action="GLOBAL_AUDIT_EVENT",
            target_id=None,
            details="global event",
        )
    )
    await db_session.flush()
    await db_session.commit()

    await set_rls_context(db_session, user_id=str(admin.id), role=Role.ADMIN.value, gym_id=str(admin.gym_id), branch_id=str(branch.id))

    admin_logs = await client.get("/api/v1/audit/logs", headers=admin_token_headers)
    assert admin_logs.status_code == 200
    admin_actions = {item["action"] for item in admin_logs.json()["data"]}
    assert "BRANCH_AUDIT_EVENT" in admin_actions
    assert "GLOBAL_AUDIT_EVENT" in admin_actions

    manager_headers = await _login_headers(client, manager_email, "password")
    manager_logs = await client.get("/api/v1/audit/logs", headers=manager_headers)
    assert manager_logs.status_code == 200
    manager_actions = {item["action"] for item in manager_logs.json()["data"]}
    assert "BRANCH_AUDIT_EVENT" in manager_actions
    assert "GLOBAL_AUDIT_EVENT" in manager_actions
