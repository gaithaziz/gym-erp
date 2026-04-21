from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.auth.security import get_password_hash
from app.models.access import AccessLog
from app.models.gamification import AttendanceStreak, Badge
from app.models.user import User
from app.services import gamification_service


@pytest.mark.asyncio
async def test_rebuild_user_gamification_restores_missing_visit_milestones(db_session):
    user = User(
        email="gamification_rebuild@test.com",
        hashed_password=get_password_hash("password"),
        full_name="Gamification Repair",
        role="CUSTOMER",
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()

    start = datetime(2026, 4, 1, 6, 30, tzinfo=timezone.utc)

    for visit_index in range(80):
        db_session.add(
            AccessLog(
                user_id=user.id,
                scan_time=start + timedelta(minutes=visit_index),
                kiosk_id="repair-kiosk",
                status="GRANTED",
                reason=None,
            )
        )

    for day_offset in range(1, 5):
        db_session.add(
            AccessLog(
                user_id=user.id,
                scan_time=start + timedelta(days=day_offset, hours=12),
                kiosk_id="repair-kiosk",
                status="GRANTED",
                reason=None,
            )
        )

    db_session.add(
        AttendanceStreak(
            user_id=user.id,
            current_streak=0,
            best_streak=0,
            last_visit_date=None,
        )
    )
    db_session.add(Badge(user_id=user.id, badge_type="VISITS_10", badge_name="Old 10", badge_description="stale"))
    db_session.add(Badge(user_id=user.id, badge_type="VISITS_25", badge_name="Old 25", badge_description="stale"))
    await db_session.commit()

    result = await gamification_service.rebuild_user_gamification(user.id, db_session)
    await db_session.commit()

    assert result["total_visits"] == 84
    assert result["current_streak"] == 5
    assert result["best_streak"] == 5
    assert "VISITS_50" in result["badge_types"]

    streak = (await db_session.execute(select(AttendanceStreak).where(AttendanceStreak.user_id == user.id))).scalar_one()
    badge_types = list(
        (
            await db_session.execute(select(Badge.badge_type).where(Badge.user_id == user.id).order_by(Badge.badge_type))
        ).scalars().all()
    )

    assert streak.current_streak == 5
    assert streak.best_streak == 5
    assert badge_types == ["EARLY_BIRD", "STREAK_3", "VISITS_10", "VISITS_25", "VISITS_50"]


@pytest.mark.asyncio
async def test_rebuild_user_gamification_clears_stale_rows_without_access_logs(db_session):
    user = User(
        email="gamification_empty@test.com",
        hashed_password=get_password_hash("password"),
        full_name="Empty Repair",
        role="CUSTOMER",
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()

    db_session.add(
        AttendanceStreak(
            user_id=user.id,
            current_streak=9,
            best_streak=12,
            last_visit_date=datetime.now(timezone.utc),
        )
    )
    db_session.add(Badge(user_id=user.id, badge_type="VISITS_50", badge_name="50 Club Visits", badge_description="stale"))
    await db_session.commit()

    result = await gamification_service.rebuild_user_gamification(user.id, db_session)
    await db_session.commit()

    assert result == {
        "user_id": str(user.id),
        "total_visits": 0,
        "current_streak": 0,
        "best_streak": 0,
        "badge_types": [],
    }

    streak = (await db_session.execute(select(AttendanceStreak).where(AttendanceStreak.user_id == user.id))).scalar_one_or_none()
    badges = list((await db_session.execute(select(Badge).where(Badge.user_id == user.id))).scalars().all())

    assert streak is None
    assert badges == []
