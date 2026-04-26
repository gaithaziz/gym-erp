from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.services.mobile_customer_service import MobileCustomerService


def test_progress_cache_round_trip_and_invalidate():
    user_id = uuid4()
    payload = {"range_summary": {"workouts": 3}}

    MobileCustomerService._set_progress_cache(
        user_id=user_id,
        date_from="2026-01-01",
        date_to="2026-01-31",
        payload=payload,
    )

    assert MobileCustomerService._get_progress_cache(
        user_id=user_id,
        date_from="2026-01-01",
        date_to="2026-01-31",
    ) == payload

    MobileCustomerService.invalidate_progress_cache(user_id=user_id)

    assert MobileCustomerService._get_progress_cache(
        user_id=user_id,
        date_from="2026-01-01",
        date_to="2026-01-31",
    ) is None


@pytest.mark.asyncio
async def test_refresh_progress_cache_warms_default_range(monkeypatch):
    current_user = SimpleNamespace(id=uuid4())
    seen: dict[str, str | None] = {}

    async def fake_warm_progress_cache(*, current_user, db, date_from=None, date_to=None):
        seen["date_from"] = date_from
        seen["date_to"] = date_to
        return {"ok": True}

    monkeypatch.setattr(MobileCustomerService, "_default_progress_date_range", staticmethod(lambda: ("2026-01-01", "2026-01-31")))
    monkeypatch.setattr(MobileCustomerService, "warm_progress_cache", fake_warm_progress_cache)

    result = await MobileCustomerService.refresh_progress_cache(current_user=current_user, db=None)

    assert result == {"ok": True}
    assert seen == {"date_from": "2026-01-01", "date_to": "2026-01-31"}
