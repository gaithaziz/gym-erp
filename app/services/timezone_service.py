from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.config import settings


def get_gym_timezone() -> ZoneInfo:
    try:
        return ZoneInfo(settings.GYM_TIMEZONE)
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


def now_in_gym_tz() -> datetime:
    return datetime.now(get_gym_timezone())
