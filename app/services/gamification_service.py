"""Gamification service — Streak tracking and badge awarding logic."""
from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete, select, func
import uuid

from app.models.gamification import Badge, AttendanceStreak
from app.models.access import AccessLog


# Badge definitions: { badge_type: (name, description, threshold or condition) }
STREAK_BADGES = [
    (3,  "STREAK_3",  "🔥 3-Day Streak",   "Visited 3 days in a row"),
    (7,  "STREAK_7",  "🔥 Weekly Warrior",  "Visited 7 days in a row"),
    (14, "STREAK_14", "🔥 Fortnight Force", "Visited 14 days in a row"),
    (30, "STREAK_30", "🔥 Monthly Machine", "Visited 30 days in a row"),
]

VISIT_MILESTONES = [
    (10,  "VISITS_10",  "🏅 10 Club Visits",  "Checked in 10 times"),
    (25,  "VISITS_25",  "🏅 25 Club Visits",  "Checked in 25 times"),
    (50,  "VISITS_50",  "🏅 50 Club Visits",  "Checked in 50 times"),
    (100, "VISITS_100", "🏅 100 Club",        "Checked in 100 times"),
    (250, "VISITS_250", "🏅 250 Club Legend", "Checked in 250 times"),
]

SPECIAL_BADGES = {
    "EARLY_BIRD": ("🌅 Early Bird", "Checked in before 7 AM"),
    "NIGHT_OWL":  ("🦉 Night Owl",  "Checked in after 9 PM"),
}


def _normalize_scan_time(scan_time: datetime) -> datetime:
    if scan_time.tzinfo is None:
        return scan_time.replace(tzinfo=timezone.utc)
    return scan_time.astimezone(timezone.utc)


def _compute_streaks_from_visit_dates(visit_dates: list[datetime.date]) -> tuple[int, int]:
    if not visit_dates:
        return 0, 0

    current_streak = 1
    running_streak = 1
    best_streak = 1

    for previous, current in zip(visit_dates, visit_dates[1:]):
        if current == previous:
            continue
        if current == previous + timedelta(days=1):
            running_streak += 1
        else:
            running_streak = 1
        best_streak = max(best_streak, running_streak)
        current_streak = running_streak

    return current_streak, best_streak


async def update_streak(user_id: uuid.UUID, db: AsyncSession) -> AttendanceStreak:
    """Called after a successful check-in. Updates streak and awards badges."""
    stmt = select(AttendanceStreak).where(AttendanceStreak.user_id == user_id)
    result = await db.execute(stmt)
    streak = result.scalar_one_or_none()

    now = datetime.now(timezone.utc)
    today = now.date()

    if not streak:
        streak = AttendanceStreak(user_id=user_id, current_streak=1, best_streak=1, last_visit_date=now)
        db.add(streak)
    else:
        last_date = streak.last_visit_date.date() if streak.last_visit_date else None

        if last_date == today:
            # Already visited today — no change
            return streak
        elif last_date == today - timedelta(days=1):
            # Consecutive day
            streak.current_streak += 1
        else:
            # Streak broken
            streak.current_streak = 1

        if streak.current_streak > streak.best_streak:
            streak.best_streak = streak.current_streak

        streak.last_visit_date = now

    # Check for streak badges
    await _check_streak_badges(user_id, streak.current_streak, db)

    # Check for total visit milestones
    await _check_visit_milestones(user_id, db)

    return streak


async def _check_streak_badges(user_id: uuid.UUID, current_streak: int, db: AsyncSession):
    """Award streak badges if thresholds are met and not already earned."""
    for threshold, badge_type, name, desc in STREAK_BADGES:
        if current_streak >= threshold:
            existing = await db.execute(
                select(Badge).where(Badge.user_id == user_id, Badge.badge_type == badge_type)
            )
            if not existing.scalar_one_or_none():
                db.add(Badge(user_id=user_id, badge_type=badge_type, badge_name=name, badge_description=desc))


async def _check_visit_milestones(user_id: uuid.UUID, db: AsyncSession):
    """Award milestone badges based on total granted access logs."""
    count_stmt = select(func.count()).select_from(AccessLog).where(
        AccessLog.user_id == user_id, AccessLog.status == "GRANTED"
    )
    result = await db.execute(count_stmt)
    total_visits = result.scalar() or 0

    for threshold, badge_type, name, desc in VISIT_MILESTONES:
        if total_visits >= threshold:
            existing = await db.execute(
                select(Badge).where(Badge.user_id == user_id, Badge.badge_type == badge_type)
            )
            if not existing.scalar_one_or_none():
                db.add(Badge(user_id=user_id, badge_type=badge_type, badge_name=name, badge_description=desc))


async def check_time_based_badge(user_id: uuid.UUID, scan_time: datetime, db: AsyncSession):
    """Award Early Bird or Night Owl badges based on check-in time."""
    hour = scan_time.hour

    if hour < 7:
        badge_type = "EARLY_BIRD"
    elif hour >= 21:
        badge_type = "NIGHT_OWL"
    else:
        return

    name, desc = SPECIAL_BADGES[badge_type]
    existing = await db.execute(
        select(Badge).where(Badge.user_id == user_id, Badge.badge_type == badge_type)
    )
    if not existing.scalar_one_or_none():
        db.add(Badge(user_id=user_id, badge_type=badge_type, badge_name=name, badge_description=desc))


async def get_user_badges(user_id: uuid.UUID, db: AsyncSession) -> list[Badge]:
    """Get all badges for a user."""
    result = await db.execute(
        select(Badge).where(Badge.user_id == user_id).order_by(Badge.earned_at.desc())
    )
    return list(result.scalars().all())


async def get_user_streak(user_id: uuid.UUID, db: AsyncSession) -> dict:
    """Get current streak info for a user."""
    result = await db.execute(
        select(AttendanceStreak).where(AttendanceStreak.user_id == user_id)
    )
    streak = result.scalar_one_or_none()

    if not streak:
        return {"current_streak": 0, "best_streak": 0, "last_visit_date": None}

    return {
        "current_streak": streak.current_streak,
        "best_streak": streak.best_streak,
        "last_visit_date": streak.last_visit_date.isoformat() if streak.last_visit_date else None,
    }


async def get_user_stats(user_id: uuid.UUID, db: AsyncSession) -> dict:
    """Get gamification stats: total visits, streak, badges."""
    count_stmt = select(func.count()).select_from(AccessLog).where(
        AccessLog.user_id == user_id, AccessLog.status == "GRANTED"
    )
    result = await db.execute(count_stmt)
    total_visits = result.scalar() or 0

    streak_info = await get_user_streak(user_id, db)
    badges = await get_user_badges(user_id, db)

    # Weekly Progress
    now = datetime.now(timezone.utc)
    today = now.date()
    start_of_week = today - timedelta(days=today.weekday()) # Monday
    
    # Count distinct days visited this week
    # Note: Postgres specific date truncation/casting might be needed if straight date() doesn't work, 
    # but SQLAlchemy func.date() usually handles it.
    weekly_stmt = select(func.count(func.distinct(func.date(AccessLog.scan_time)))).where(
        AccessLog.user_id == user_id,
        AccessLog.status == "GRANTED",
        AccessLog.scan_time >= start_of_week
    )
    weekly_visits = (await db.execute(weekly_stmt)).scalar() or 0

    return {
        "total_visits": total_visits,
        "streak": streak_info,
        "weekly_progress": {
            "current": weekly_visits,
            "goal": 3
        },
        "badges": [
            {
                "id": str(b.id),
                "badge_type": b.badge_type,
                "badge_name": b.badge_name,
                "badge_description": b.badge_description,
                "earned_at": b.earned_at.isoformat() if b.earned_at else None,
            }
            for b in badges
        ],
    }


async def rebuild_user_gamification(user_id: uuid.UUID, db: AsyncSession) -> dict:
    """Recompute a user's streak and badges from historical granted access logs."""
    result = await db.execute(
        select(AccessLog)
        .where(AccessLog.user_id == user_id, AccessLog.status == "GRANTED")
        .order_by(AccessLog.scan_time.asc(), AccessLog.id.asc())
    )
    access_logs = list(result.scalars().all())

    await db.execute(delete(Badge).where(Badge.user_id == user_id))
    await db.execute(delete(AttendanceStreak).where(AttendanceStreak.user_id == user_id))

    if not access_logs:
        await db.flush()
        return {
            "user_id": str(user_id),
            "total_visits": 0,
            "current_streak": 0,
            "best_streak": 0,
            "badge_types": [],
        }

    normalized_logs = [_normalize_scan_time(log.scan_time) for log in access_logs]
    visit_dates = sorted({scan_time.date() for scan_time in normalized_logs})
    current_streak, best_streak = _compute_streaks_from_visit_dates(visit_dates)
    latest_visit = normalized_logs[-1]

    db.add(
        AttendanceStreak(
            user_id=user_id,
            current_streak=current_streak,
            best_streak=best_streak,
            last_visit_date=latest_visit,
        )
    )

    badge_types: list[str] = []

    for threshold, badge_type, name, desc in STREAK_BADGES:
        if best_streak >= threshold:
            db.add(Badge(user_id=user_id, badge_type=badge_type, badge_name=name, badge_description=desc))
            badge_types.append(badge_type)

    total_visits = len(normalized_logs)
    for threshold, badge_type, name, desc in VISIT_MILESTONES:
        if total_visits >= threshold:
            db.add(Badge(user_id=user_id, badge_type=badge_type, badge_name=name, badge_description=desc))
            badge_types.append(badge_type)

    first_early_bird = next((scan_time for scan_time in normalized_logs if scan_time.hour < 7), None)
    if first_early_bird is not None:
        name, desc = SPECIAL_BADGES["EARLY_BIRD"]
        db.add(Badge(user_id=user_id, badge_type="EARLY_BIRD", badge_name=name, badge_description=desc, earned_at=first_early_bird))
        badge_types.append("EARLY_BIRD")

    first_night_owl = next((scan_time for scan_time in normalized_logs if scan_time.hour >= 21), None)
    if first_night_owl is not None:
        name, desc = SPECIAL_BADGES["NIGHT_OWL"]
        db.add(Badge(user_id=user_id, badge_type="NIGHT_OWL", badge_name=name, badge_description=desc, earned_at=first_night_owl))
        badge_types.append("NIGHT_OWL")

    await db.flush()

    return {
        "user_id": str(user_id),
        "total_visits": total_visits,
        "current_streak": current_streak,
        "best_streak": best_streak,
        "badge_types": sorted(badge_types),
    }


async def rebuild_all_gamification(db: AsyncSession) -> list[dict]:
    """Recompute gamification for every user with access or gamification records."""
    user_ids = {
        *(
            user_id
            for user_id in (
                await db.execute(select(AccessLog.user_id).distinct())
            ).scalars().all()
            if user_id is not None
        ),
        *(
            user_id
            for user_id in (
                await db.execute(select(AttendanceStreak.user_id).distinct())
            ).scalars().all()
            if user_id is not None
        ),
        *(
            user_id
            for user_id in (
                await db.execute(select(Badge.user_id).distinct())
            ).scalars().all()
            if user_id is not None
        ),
    }

    results: list[dict] = []
    for user_id in sorted(user_ids, key=str):
        results.append(await rebuild_user_gamification(user_id, db))
    return results
