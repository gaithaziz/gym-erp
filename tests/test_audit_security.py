import pytest
from httpx import AsyncClient

from app.config import settings


@pytest.mark.asyncio
async def test_security_audit_requires_authentication(client: AsyncClient):
    response = await client.get(f"{settings.API_V1_STR}/audit/security")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_security_audit_is_superadmin_only(client: AsyncClient, admin_token_headers):
    response = await client.get(
        f"{settings.API_V1_STR}/audit/security",
        headers=admin_token_headers,
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_security_audit_returns_report_for_superadmin(client: AsyncClient, superadmin_token_headers):
    response = await client.get(
        f"{settings.API_V1_STR}/audit/security",
        headers=superadmin_token_headers,
    )
    assert response.status_code == 200
    payload = response.json()["data"]
    assert "summary" in payload
    assert "checks" in payload
    categories = {check["category"] for check in payload["checks"]}
    assert "rate_limits" in categories
    assert "dependencies" in categories
