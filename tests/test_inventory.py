import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings
from app.models.user import User
from app.models.enums import Role
from app.auth.security import get_password_hash


@pytest.mark.asyncio
async def test_pos_sale_idempotency_prevents_duplicate_stock_deduction(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    admin = User(email="admin_inventory@gym.com", hashed_password=hashed, role=Role.ADMIN, full_name="Inventory Admin")
    db_session.add(admin)
    await db_session.commit()

    login_resp = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": "admin_inventory@gym.com", "password": password}
    )
    token = login_resp.json()["data"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    create_product_resp = await client.post(
        f"{settings.API_V1_STR}/inventory/products",
        json={
            "name": "Protein Bar",
            "category": "OTHER",
            "price": 2.5,
            "stock_quantity": 10,
            "low_stock_threshold": 2,
        },
        headers=headers,
    )
    assert create_product_resp.status_code == 200
    product_id = create_product_resp.json()["data"]["id"]

    sale_payload = {
        "product_id": product_id,
        "quantity": 2,
        "payment_method": "CASH",
        "idempotency_key": "sale-001",
    }

    invalid_quantity = await client.post(
        f"{settings.API_V1_STR}/inventory/pos/sell",
        json={"product_id": product_id, "quantity": 0, "payment_method": "CASH"},
        headers=headers,
    )
    assert invalid_quantity.status_code == 422

    first_sale = await client.post(f"{settings.API_V1_STR}/inventory/pos/sell", json=sale_payload, headers=headers)
    assert first_sale.status_code == 200
    first_data = first_sale.json()["data"]
    assert first_data["remaining_stock"] == 8

    second_sale = await client.post(f"{settings.API_V1_STR}/inventory/pos/sell", json=sale_payload, headers=headers)
    assert second_sale.status_code == 200
    second_data = second_sale.json()["data"]
    assert second_data["remaining_stock"] == 8
    assert second_data["transaction_id"] == first_data["transaction_id"]


@pytest.mark.asyncio
async def test_low_stock_ack_snooze_and_restock_target_flow(client: AsyncClient, db_session: AsyncSession):
    password = "password123"
    hashed = get_password_hash(password)
    admin = User(email="admin_low_stock@gym.com", hashed_password=hashed, role=Role.ADMIN, full_name="Low Stock Admin")
    db_session.add(admin)
    await db_session.commit()

    login_resp = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": "admin_low_stock@gym.com", "password": password}
    )
    token = login_resp.json()["data"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    create_product_resp = await client.post(
        f"{settings.API_V1_STR}/inventory/products",
        json={
            "name": "Electrolyte Drink",
            "category": "DRINK",
            "price": 1.5,
            "stock_quantity": 1,
            "low_stock_threshold": 3,
        },
        headers=headers,
    )
    assert create_product_resp.status_code == 200
    product_id = create_product_resp.json()["data"]["id"]

    low_stock_before = await client.get(f"{settings.API_V1_STR}/inventory/products/low-stock", headers=headers)
    assert low_stock_before.status_code == 200
    ids_before = [p["id"] for p in low_stock_before.json()["data"]]
    assert product_id in ids_before

    ack_resp = await client.post(f"{settings.API_V1_STR}/inventory/products/{product_id}/low-stock/ack", headers=headers)
    assert ack_resp.status_code == 200
    assert ack_resp.json()["data"]["low_stock_acknowledged_at"] is not None

    snooze_resp = await client.post(
        f"{settings.API_V1_STR}/inventory/products/{product_id}/low-stock/snooze",
        json={"hours": 2},
        headers=headers,
    )
    assert snooze_resp.status_code == 200
    assert snooze_resp.json()["data"]["low_stock_snoozed_until"] is not None

    low_stock_after_snooze = await client.get(f"{settings.API_V1_STR}/inventory/products/low-stock", headers=headers)
    assert low_stock_after_snooze.status_code == 200
    ids_after_snooze = [p["id"] for p in low_stock_after_snooze.json()["data"]]
    assert product_id not in ids_after_snooze

    restock_target_resp = await client.put(
        f"{settings.API_V1_STR}/inventory/products/{product_id}/low-stock-target",
        json={"target_quantity": 12},
        headers=headers,
    )
    assert restock_target_resp.status_code == 200
    assert restock_target_resp.json()["data"]["low_stock_restock_target"] == 12
