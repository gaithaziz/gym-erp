import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import set_rls_context
from app.models.audit import AuditLog
from app.models.enums import Role
from app.models.lost_found import LostFoundItem, LostFoundStatus
from app.models.support import SupportTicket, TicketCategory, TicketStatus
from app.models.user import User


def _postgres_only(db_session: AsyncSession) -> None:
    bind = db_session.bind
    dialect = bind.dialect.name if bind is not None else ""
    if dialect != "postgresql":
        pytest.skip("RLS enforcement tests require PostgreSQL")


async def _fetch_scalars_with_rls(
    db_session: AsyncSession,
    *,
    sql: str,
    user_id: str,
    role: str,
) -> list[str]:
    bind = db_session.bind
    assert bind is not None
    async with bind.connect() as conn:
        session = AsyncSession(bind=conn, expire_on_commit=False)
        try:
            await set_rls_context(session, user_id=user_id, role=role)
            rows = await session.execute(text(sql))
            return list(rows.scalars().all())
        finally:
            await session.close()


async def _add_with_rls_context(
    db_session: AsyncSession,
    *,
    user_id: str,
    role: str,
    model: object,
) -> None:
    await set_rls_context(db_session, user_id=user_id, role=role)
    db_session.add(model)
    await db_session.flush()


@pytest.mark.asyncio
async def test_support_ticket_rls_filters_rows_by_current_user(db_session: AsyncSession):
    _postgres_only(db_session)

    customer_a = User(email=f"rls_support_a_{uuid.uuid4().hex[:8]}@gym.com", hashed_password="x", role=Role.CUSTOMER, is_active=True)
    customer_b = User(email=f"rls_support_b_{uuid.uuid4().hex[:8]}@gym.com", hashed_password="x", role=Role.CUSTOMER, is_active=True)
    admin = User(email=f"rls_support_admin_{uuid.uuid4().hex[:8]}@gym.com", hashed_password="x", role=Role.ADMIN, is_active=True)
    db_session.add_all([customer_a, customer_b, admin])
    await db_session.flush()

    await _add_with_rls_context(
        db_session,
        user_id=str(customer_a.id),
        role=Role.CUSTOMER.value,
        model=SupportTicket(
            customer_id=customer_a.id,
            subject="A only",
            category=TicketCategory.GENERAL,
            status=TicketStatus.OPEN,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        ),
    )
    await _add_with_rls_context(
        db_session,
        user_id=str(customer_b.id),
        role=Role.CUSTOMER.value,
        model=SupportTicket(
            customer_id=customer_b.id,
            subject="B only",
            category=TicketCategory.GENERAL,
            status=TicketStatus.OPEN,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        ),
    )
    await db_session.commit()

    subjects = await _fetch_scalars_with_rls(
        db_session,
        sql="SELECT subject FROM support_tickets ORDER BY subject",
        user_id=str(customer_a.id),
        role=Role.CUSTOMER.value,
    )
    assert "A only" in subjects
    assert "B only" not in subjects

    subjects = await _fetch_scalars_with_rls(
        db_session,
        sql="SELECT subject FROM support_tickets ORDER BY subject",
        user_id=str(admin.id),
        role=Role.ADMIN.value,
    )
    assert "A only" in subjects
    assert "B only" in subjects


@pytest.mark.asyncio
async def test_lost_found_rls_filters_rows_by_reporter(db_session: AsyncSession):
    _postgres_only(db_session)

    customer_a = User(email=f"rls_lf_a_{uuid.uuid4().hex[:8]}@gym.com", hashed_password="x", role=Role.CUSTOMER, is_active=True)
    customer_b = User(email=f"rls_lf_b_{uuid.uuid4().hex[:8]}@gym.com", hashed_password="x", role=Role.CUSTOMER, is_active=True)
    reception = User(email=f"rls_lf_reception_{uuid.uuid4().hex[:8]}@gym.com", hashed_password="x", role=Role.RECEPTION, is_active=True)
    db_session.add_all([customer_a, customer_b, reception])
    await db_session.flush()

    await _add_with_rls_context(
        db_session,
        user_id=str(customer_a.id),
        role=Role.CUSTOMER.value,
        model=LostFoundItem(
            reporter_id=customer_a.id,
            assignee_id=None,
            status=LostFoundStatus.REPORTED,
            title="Wallet A",
            description="A item",
            category="personal",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        ),
    )
    await _add_with_rls_context(
        db_session,
        user_id=str(customer_b.id),
        role=Role.CUSTOMER.value,
        model=LostFoundItem(
            reporter_id=customer_b.id,
            assignee_id=None,
            status=LostFoundStatus.REPORTED,
            title="Wallet B",
            description="B item",
            category="personal",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        ),
    )
    await db_session.commit()

    titles = await _fetch_scalars_with_rls(
        db_session,
        sql="SELECT title FROM lost_found_items ORDER BY title",
        user_id=str(customer_a.id),
        role=Role.CUSTOMER.value,
    )
    assert "Wallet A" in titles
    assert "Wallet B" not in titles

    titles = await _fetch_scalars_with_rls(
        db_session,
        sql="SELECT title FROM lost_found_items ORDER BY title",
        user_id=str(reception.id),
        role=Role.RECEPTION.value,
    )
    assert "Wallet A" in titles
    assert "Wallet B" in titles


@pytest.mark.asyncio
async def test_audit_log_rls_is_admin_only(db_session: AsyncSession):
    _postgres_only(db_session)

    admin = User(email=f"rls_audit_admin_{uuid.uuid4().hex[:8]}@gym.com", hashed_password="x", role=Role.ADMIN, is_active=True)
    customer = User(email=f"rls_audit_customer_{uuid.uuid4().hex[:8]}@gym.com", hashed_password="x", role=Role.CUSTOMER, is_active=True)
    db_session.add_all([admin, customer])
    await db_session.flush()

    await _add_with_rls_context(
        db_session,
        user_id=str(admin.id),
        role=Role.ADMIN.value,
        model=AuditLog(user_id=admin.id, action="ADMIN_ACTION", target_id=str(admin.id), details="admin"),
    )
    await _add_with_rls_context(
        db_session,
        user_id=str(customer.id),
        role=Role.CUSTOMER.value,
        model=AuditLog(user_id=customer.id, action="CUSTOMER_ACTION", target_id=str(customer.id), details="customer"),
    )
    await db_session.commit()

    actions = await _fetch_scalars_with_rls(
        db_session,
        sql="SELECT action FROM audit_logs ORDER BY action",
        user_id=str(customer.id),
        role=Role.CUSTOMER.value,
    )
    assert "ADMIN_ACTION" not in actions
    assert "CUSTOMER_ACTION" not in actions

    actions = await _fetch_scalars_with_rls(
        db_session,
        sql="SELECT action FROM audit_logs ORDER BY action",
        user_id=str(admin.id),
        role=Role.ADMIN.value,
    )
    assert "ADMIN_ACTION" in actions
    assert "CUSTOMER_ACTION" in actions
