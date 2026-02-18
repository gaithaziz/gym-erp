import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings
from app.models.user import User
from app.models.enums import Role
from app.auth.security import get_password_hash

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
    assert dash_data["estimated_monthly_revenue"] == 100.0 # Current month filter applies, we just added it with default=now()
    assert dash_data["total_expenses_to_date"] == 40.0
