import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings
from app.models.user import User
from app.models.enums import Role
from app.auth.security import get_password_hash
from app.models.finance import Transaction, TransactionCategory, TransactionType, PaymentMethod
from datetime import datetime, timedelta, timezone

@pytest.mark.asyncio
async def test_finance_flow(client: AsyncClient, db_session: AsyncSession):
    # 1. Setup Admin User
    password = "password123"
    hashed = get_password_hash(password)
    admin = User(email="admin_fin@gym.com", hashed_password=hashed, role=Role.ADMIN, full_name="Fin Admin")
    db_session.add(admin)
    await db_session.flush()
    
    login_resp = await client.post(f"{settings.API_V1_STR}/auth/login", json={"email": "admin_fin@gym.com", "password": password})
    token = login_resp.json()["data"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    invalid_tx_resp = await client.post(
        f"{settings.API_V1_STR}/finance/transactions",
        json={
            "amount": 0,
            "type": "INCOME",
            "category": "OTHER_INCOME",
            "description": "Invalid zero amount",
            "payment_method": "CASH",
        },
        headers=headers,
    )
    assert invalid_tx_resp.status_code == 422
    
    # 2. Log Income (Subscription)
    income_data = {
        "amount": 100.0,
        "type": "INCOME",
        "category": "SUBSCRIPTION",
        "description": "Member A Sub",
        "payment_method": "CASH"
    }
    resp = await client.post(f"{settings.API_V1_STR}/finance/transactions", json=income_data, headers=headers)
    assert resp.status_code == 200
    income_tx_id = resp.json()["data"]["id"]
    
    # 3. Log Expense (Rent)
    expense_data = {
        "amount": 40.0,
        "type": "EXPENSE",
        "category": "RENT",
        "description": "Partial Rent",
        "payment_method": "TRANSFER"
    }
    resp_exp = await client.post(f"{settings.API_V1_STR}/finance/transactions", json=expense_data, headers=headers)
    assert resp_exp.status_code == 200
    
    # 4. Check Financial Summary
    resp_sum = await client.get(f"{settings.API_V1_STR}/finance/summary", headers=headers)
    assert resp_sum.status_code == 200
    data = resp_sum.json()["data"]
    
    assert data["total_income"] == 100.0
    assert data["total_expenses"] == 40.0
    assert data["net_profit"] == 60.0 # 100 - 40
    
    # 5. Check Dashboard Analytics Integration
    resp_dash = await client.get(f"{settings.API_V1_STR}/analytics/dashboard", headers=headers)
    assert resp_dash.status_code == 200
    dash_data = resp_dash.json()["data"]
    
    # Check that it picked up the new real transaction data
    assert dash_data["monthly_revenue"] == 100.0 # Current month filter applies, we just added it with default=now()
    assert dash_data["monthly_expenses"] == 40.0

    # 6. Receipt JSON + printable HTML
    receipt_json = await client.get(f"{settings.API_V1_STR}/finance/transactions/{income_tx_id}/receipt", headers=headers)
    assert receipt_json.status_code == 200

    receipt_print = await client.get(f"{settings.API_V1_STR}/finance/transactions/{income_tx_id}/receipt/print", headers=headers)
    assert receipt_print.status_code == 200
    assert "text/html" in receipt_print.headers["content-type"]


@pytest.mark.asyncio
async def test_finance_date_range_filtering(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    admin = User(email="admin_fin_range@gym.com", hashed_password=hashed, role=Role.ADMIN, full_name="Fin Range Admin")
    db_session.add(admin)
    await db_session.flush()

    now = datetime.now(timezone.utc)
    recent_tx = Transaction(
        amount=150.0,
        type=TransactionType.INCOME,
        category=TransactionCategory.OTHER_INCOME,
        description="Recent income",
        payment_method=PaymentMethod.CASH,
        date=now - timedelta(days=2),
    )
    old_tx = Transaction(
        amount=25.0,
        type=TransactionType.EXPENSE,
        category=TransactionCategory.MAINTENANCE,
        description="Old expense",
        payment_method=PaymentMethod.CASH,
        date=now - timedelta(days=40),
    )
    db_session.add_all([recent_tx, old_tx])
    await db_session.commit()

    login_resp = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": "admin_fin_range@gym.com", "password": password}
    )
    token = login_resp.json()["data"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    start_date = (now - timedelta(days=7)).date().isoformat()
    end_date = now.date().isoformat()

    tx_resp = await client.get(
        f"{settings.API_V1_STR}/finance/transactions",
        params={"start_date": start_date, "end_date": end_date, "limit": 100},
        headers=headers,
    )
    assert tx_resp.status_code == 200
    returned_ids = {tx["id"] for tx in tx_resp.json()["data"]}
    assert str(recent_tx.id) in returned_ids
    assert str(old_tx.id) not in returned_ids

    summary_resp = await client.get(
        f"{settings.API_V1_STR}/finance/summary",
        params={"start_date": start_date, "end_date": end_date},
        headers=headers,
    )
    assert summary_resp.status_code == 200
    summary = summary_resp.json()["data"]
    assert summary["total_income"] == 150.0
    assert summary["total_expenses"] == 0.0


@pytest.mark.asyncio
async def test_finance_transaction_type_filter(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    admin = User(email="admin_fin_type@gym.com", hashed_password=hashed, role=Role.ADMIN, full_name="Fin Type Admin")
    db_session.add(admin)
    await db_session.flush()

    now = datetime.now(timezone.utc)
    income_tx = Transaction(
        amount=220.0,
        type=TransactionType.INCOME,
        category=TransactionCategory.SUBSCRIPTION,
        description="Income only filter",
        payment_method=PaymentMethod.CASH,
        date=now,
    )
    expense_tx = Transaction(
        amount=80.0,
        type=TransactionType.EXPENSE,
        category=TransactionCategory.RENT,
        description="Expense only filter",
        payment_method=PaymentMethod.CASH,
        date=now,
    )
    db_session.add_all([income_tx, expense_tx])
    await db_session.commit()

    login_resp = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": admin.email, "password": password},
    )
    headers = {"Authorization": f"Bearer {login_resp.json()['data']['access_token']}"}

    income_resp = await client.get(
        f"{settings.API_V1_STR}/finance/transactions",
        params={"tx_type": "INCOME", "limit": 100},
        headers=headers,
    )
    assert income_resp.status_code == 200
    income_rows = income_resp.json()["data"]
    assert len(income_rows) >= 1
    assert all(row["type"] == "INCOME" for row in income_rows)

    expense_resp = await client.get(
        f"{settings.API_V1_STR}/finance/transactions",
        params={"tx_type": "EXPENSE", "limit": 100},
        headers=headers,
    )
    assert expense_resp.status_code == 200
    expense_rows = expense_resp.json()["data"]
    assert len(expense_rows) >= 1
    assert all(row["type"] == "EXPENSE" for row in expense_rows)
