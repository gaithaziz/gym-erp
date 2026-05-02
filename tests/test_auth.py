import pytest
import json
from datetime import date, timedelta, datetime, timezone
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.auth import security
from app.models.membership import PolicyDocument, PolicySignature
from app.models.user import User
from app.models.enums import Role
from app.config import settings

@pytest.mark.asyncio
async def test_login_success(client: AsyncClient, db_session: AsyncSession):
    # Create a user
    email = "test@example.com"
    password = "password123"
    hashed_password = security.get_password_hash(password)
    user = User(email=email, hashed_password=hashed_password, role=Role.CUSTOMER)
    db_session.add(user)
    await db_session.commit()

    response = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": email, "password": password}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "access_token" in data["data"]
    assert "refresh_token" in data["data"]
    assert data["data"]["token_type"] == "bearer"

@pytest.mark.asyncio
async def test_login_invalid_credentials(client: AsyncClient, db_session: AsyncSession):
    response = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": "wrong@example.com", "password": "wrongpassword"}
    )
    assert response.status_code == 401

@pytest.mark.asyncio
async def test_refresh_token_success(client: AsyncClient, db_session: AsyncSession):
    # Create user
    email = "refresh@example.com"
    password = "password123"
    hashed_password = security.get_password_hash(password)
    user = User(email=email, hashed_password=hashed_password, role=Role.CUSTOMER)
    db_session.add(user)
    await db_session.commit()

    # Login to get a tracked refresh token
    login_response = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": email, "password": password}
    )
    assert login_response.status_code == 200
    refresh_token = login_response.json()["data"]["refresh_token"]
    
    # Use refresh token
    response = await client.post(
        f"{settings.API_V1_STR}/auth/refresh",
        headers={"Authorization": f"Bearer {refresh_token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "access_token" in data["data"]
    assert "refresh_token" in data["data"]


@pytest.mark.asyncio
async def test_refresh_token_rotation_revokes_old_token(client: AsyncClient, db_session: AsyncSession):
    email = "rotation@example.com"
    password = "password123"
    hashed_password = security.get_password_hash(password)
    user = User(email=email, hashed_password=hashed_password, role=Role.CUSTOMER)
    db_session.add(user)
    await db_session.commit()

    login_response = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": email, "password": password}
    )
    assert login_response.status_code == 200
    first_refresh = login_response.json()["data"]["refresh_token"]

    rotate_response = await client.post(
        f"{settings.API_V1_STR}/auth/refresh",
        headers={"Authorization": f"Bearer {first_refresh}"}
    )
    assert rotate_response.status_code == 200
    second_refresh = rotate_response.json()["data"]["refresh_token"]
    assert second_refresh != first_refresh

    reuse_old_response = await client.post(
        f"{settings.API_V1_STR}/auth/refresh",
        headers={"Authorization": f"Bearer {first_refresh}"}
    )
    assert reuse_old_response.status_code == 401

@pytest.mark.asyncio
async def test_refresh_token_invalid(client: AsyncClient):
    response = await client.post(
        f"{settings.API_V1_STR}/auth/refresh",
        headers={"Authorization": "Bearer invalid_token"}
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_login_rate_limit_triggers(client: AsyncClient):
    for _ in range(5):
        response = await client.post(
            f"{settings.API_V1_STR}/auth/login",
            json={"email": "wrong@example.com", "password": "wrongpassword"},
        )
        assert response.status_code == 401

    blocked = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": "wrong@example.com", "password": "wrongpassword"},
    )
    assert blocked.status_code == 429
    assert "retry" in blocked.json()["detail"].lower()


@pytest.mark.asyncio
async def test_refresh_rate_limit_triggers(client: AsyncClient):
    for _ in range(10):
        response = await client.post(
            f"{settings.API_V1_STR}/auth/refresh",
            headers={"Authorization": "Bearer invalid_token"},
        )
        assert response.status_code == 401

    blocked = await client.post(
        f"{settings.API_V1_STR}/auth/refresh",
        headers={"Authorization": "Bearer invalid_token"},
    )
    assert blocked.status_code == 429


@pytest.mark.asyncio
async def test_update_me_profile_validation(client: AsyncClient, db_session: AsyncSession):
    email = "validate@example.com"
    password = "password123"
    hashed_password = security.get_password_hash(password)
    user = User(email=email, hashed_password=hashed_password, role=Role.CUSTOMER)
    db_session.add(user)
    await db_session.commit()

    login_response = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": email, "password": password}
    )
    token = login_response.json()["data"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    invalid_phone_response = await client.put(
        f"{settings.API_V1_STR}/auth/me",
        json={"phone_number": "abc-invalid"},
        headers=headers,
    )
    assert invalid_phone_response.status_code == 422
    assert "request_id" in invalid_phone_response.json()
    assert "x-request-id" in invalid_phone_response.headers

    future_dob = (date.today() + timedelta(days=1)).isoformat()
    invalid_dob_response = await client.put(
        f"{settings.API_V1_STR}/auth/me",
        json={"date_of_birth": future_dob},
        headers=headers,
    )
    assert invalid_dob_response.status_code == 422
    assert "request_id" in invalid_dob_response.json()

    too_long_bio_response = await client.put(
        f"{settings.API_V1_STR}/auth/me",
        json={"bio": "x" * 501},
        headers=headers,
    )
    assert too_long_bio_response.status_code == 422
    assert "request_id" in too_long_bio_response.json()


@pytest.mark.asyncio
async def test_mobile_bootstrap_returns_customer_foundation_payload(client: AsyncClient, db_session: AsyncSession):
    email = "mobile-customer@example.com"
    password = "password123"
    user = User(
        email=email,
        hashed_password=security.get_password_hash(password),
        role=Role.CUSTOMER,
        full_name="Mobile Customer",
    )
    db_session.add(user)
    await db_session.commit()

    login_response = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": email, "password": password},
    )
    token = login_response.json()["data"]["access_token"]

    response = await client.get(
        f"{settings.API_V1_STR}/mobile/bootstrap",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["role"] == "CUSTOMER"
    assert payload["user"]["email"] == email
    assert payload["subscription"]["status"] == "NONE"
    assert payload["subscription"]["is_blocked"] is True
    assert payload["policy"]["current_policy_version"] == "1.0"
    assert payload["policy"]["requires_signature"] is True
    assert payload["gym"]["gym_name"] == settings.GYM_NAME
    assert "scan_gym_qr" in payload["capabilities"]
    assert "renew_subscription" in payload["capabilities"]
    assert "pay_invoice" not in payload["capabilities"]
    assert "home" in payload["enabled_modules"]
    assert payload["notification_settings"]["push_enabled"] is True


@pytest.mark.asyncio
async def test_mobile_bootstrap_returns_staff_capabilities_without_subscription_block(client: AsyncClient, db_session: AsyncSession):
    email = "mobile-admin@example.com"
    password = "password123"
    user = User(
        email=email,
        hashed_password=security.get_password_hash(password),
        role=Role.ADMIN,
        full_name="Mobile Admin",
    )
    db_session.add(user)
    await db_session.commit()

    login_response = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": email, "password": password},
    )
    token = login_response.json()["data"]["access_token"]

    response = await client.get(
        f"{settings.API_V1_STR}/mobile/bootstrap",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["role"] == "ADMIN"
    assert payload["subscription"]["status"] == "ACTIVE"
    assert payload["subscription"]["is_blocked"] is False
    assert payload["policy"]["current_policy_version"] == "1.0"
    assert payload["policy"]["requires_signature"] is False
    assert "view_audit_summary" in payload["capabilities"]
    assert "manage_inventory" in payload["capabilities"]
    assert "audit" in payload["enabled_modules"]
    assert "finance" in payload["enabled_modules"]


@pytest.mark.asyncio
async def test_mobile_bootstrap_marks_signed_customer_policy_as_complete(client: AsyncClient, db_session: AsyncSession):
    email = "mobile-policy-signed@example.com"
    password = "password123"
    user = User(
        email=email,
        hashed_password=security.get_password_hash(password),
        role=Role.CUSTOMER,
        full_name="Policy Signed Customer",
    )
    db_session.add(user)
    await db_session.flush()
    db_session.add(
        PolicyDocument(
            gym_id=user.gym_id,
            locale="en",
            version="2.0",
            title="Updated Policy",
            effective_date=datetime.now(timezone.utc),
            intro="Updated contract",
            sections_json=json.dumps([{"title": "Intro", "points": ["One"]}]),
            footer_note="Footer",
            created_by_user_id=user.id,
        )
    )
    db_session.add(
        PolicySignature(
            gym_id=user.gym_id,
            user_id=user.id,
            locale="en",
            policy_version="2.0",
            signer_name="Policy Signed Customer",
            accepted=True,
            signed_at=datetime.now(timezone.utc),
        )
    )
    await db_session.commit()

    login_response = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": email, "password": password},
    )
    token = login_response.json()["data"]["access_token"]

    response = await client.get(
        f"{settings.API_V1_STR}/mobile/bootstrap",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["policy"]["current_policy_version"] == "2.0"
    assert payload["policy"]["requires_signature"] is False


@pytest.mark.asyncio
async def test_policy_save_syncs_version_across_locales_and_invalidates_signatures(client: AsyncClient, db_session: AsyncSession):
    admin_email = "policy-admin@example.com"
    admin_password = "password123"
    customer_email = "policy-customer@example.com"
    customer_password = "password123"

    admin = User(
        email=admin_email,
        hashed_password=security.get_password_hash(admin_password),
        role=Role.ADMIN,
        full_name="Policy Admin",
    )
    customer = User(
        email=customer_email,
        hashed_password=security.get_password_hash(customer_password),
        role=Role.CUSTOMER,
        full_name="Policy Customer",
    )
    db_session.add_all([admin, customer])
    await db_session.flush()
    db_session.add_all(
        [
            PolicyDocument(
                gym_id=admin.gym_id,
                locale="en",
                version="1.0",
                title="Policy EN",
                effective_date=datetime.now(timezone.utc),
                intro="English policy",
                sections_json=json.dumps([{"title": "Intro", "points": ["EN"]}]),
                footer_note="EN footer",
                created_by_user_id=admin.id,
            ),
            PolicyDocument(
                gym_id=admin.gym_id,
                locale="ar",
                version="1.0",
                title="Policy AR",
                effective_date=datetime.now(timezone.utc),
                intro="Arabic policy",
                sections_json=json.dumps([{"title": "Intro", "points": ["AR"]}]),
                footer_note="AR footer",
                created_by_user_id=admin.id,
            ),
            PolicySignature(
                gym_id=admin.gym_id,
                user_id=customer.id,
                locale="en",
                policy_version="1.0",
                signer_name="Policy Customer",
                accepted=True,
                signed_at=datetime.now(timezone.utc),
            ),
        ]
    )
    await db_session.commit()

    admin_login = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": admin_email, "password": admin_password},
    )
    admin_token = admin_login.json()["data"]["access_token"]

    save_response = await client.put(
        f"{settings.API_V1_STR}/membership/policy",
        params={"locale": "en"},
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "title": "Policy EN Updated",
            "effectiveDate": datetime.now(timezone.utc).isoformat(),
            "updatedAt": datetime.now(timezone.utc).isoformat(),
            "intro": "Updated English policy",
            "sections": [{"title": "Intro", "points": ["Updated"]}],
            "footerNote": "Updated footer",
        },
    )
    assert save_response.status_code == 200

    versions = {
        row.locale: row.version
        for row in (await db_session.execute(
            select(PolicyDocument).where(PolicyDocument.gym_id == admin.gym_id)
        )).scalars().all()
    }
    assert versions == {"en": "1.1", "ar": "1.1"}

    remaining_signatures = (
        await db_session.execute(
            select(PolicySignature).where(PolicySignature.gym_id == admin.gym_id)
        )
    ).scalars().all()
    assert remaining_signatures == []

    customer_login = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"email": customer_email, "password": customer_password},
    )
    customer_token = customer_login.json()["data"]["access_token"]

    sign_response = await client.post(
        f"{settings.API_V1_STR}/membership/policy/signature",
        params={"locale": "ar"},
        headers={"Authorization": f"Bearer {customer_token}"},
        json={"signerName": "Policy Customer", "accepted": True},
    )
    assert sign_response.status_code == 200
    assert sign_response.json()["data"]["version"] == "1.1"

    me_response = await client.get(
        f"{settings.API_V1_STR}/membership/policy/signature/me",
        params={"locale": "en"},
        headers={"Authorization": f"Bearer {customer_token}"},
    )
    assert me_response.status_code == 200
    assert me_response.json()["data"]["version"] == "1.1"
