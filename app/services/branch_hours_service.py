from __future__ import annotations

from datetime import datetime, time, timezone
from typing import Any, Sequence
from zoneinfo import ZoneInfo

from app.models.branch_hours import BranchOperatingHour
from app.models.tenancy import Branch


DAY_LABELS = {
    "en": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    "ar": ["الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت", "الأحد"],
}


def parse_clock_value(value: str | None) -> time | None:
    if value is None:
        return None
    return time.fromisoformat(value)


def format_clock_value(value: time | None) -> str | None:
    return value.strftime("%H:%M") if value is not None else None


def weekday_label(weekday: int, locale: str) -> str:
    labels = DAY_LABELS["ar" if locale == "ar" else "en"]
    if weekday < 0 or weekday >= len(labels):
        return str(weekday)
    return labels[weekday]


def normalize_hours_rows(rows: Sequence[BranchOperatingHour | dict[str, Any]]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for row in rows:
        if isinstance(row, dict):
            weekday = int(row.get("weekday", 0))
            normalized.append(
                {
                    "weekday": weekday,
                    "is_closed": bool(row.get("is_closed", False)),
                    "open_time": row.get("open_time"),
                    "close_time": row.get("close_time"),
                    "note": row.get("note"),
                }
            )
            continue
        normalized.append(
            {
                "weekday": int(row.weekday),
                "is_closed": bool(row.is_closed),
                "open_time": format_clock_value(row.open_time),
                "close_time": format_clock_value(row.close_time),
                "note": row.note,
            }
        )
    return sorted(normalized, key=lambda item: item["weekday"])


def branch_hours_changed(
    current_rows: Sequence[BranchOperatingHour],
    incoming_rows: Sequence[dict[str, Any]],
) -> bool:
    return normalize_hours_rows(current_rows) != normalize_hours_rows(incoming_rows)


def serialize_branch_hours(branch: Branch, rows: Sequence[BranchOperatingHour]) -> dict[str, Any]:
    row_map = {int(row.weekday): row for row in rows}
    try:
        branch_tz = ZoneInfo(branch.timezone or "UTC")
    except Exception:
        branch_tz = ZoneInfo("UTC")
    now_local = datetime.now(branch_tz)
    current_weekday = now_local.weekday()
    current_time = now_local.time()

    def _is_open_now(row: BranchOperatingHour | None) -> bool:
        if row is None or row.is_closed or row.open_time is None or row.close_time is None:
            return False
        open_time = row.open_time
        close_time = row.close_time
        if open_time < close_time:
            return open_time <= current_time < close_time
        if open_time > close_time:
            return current_time >= open_time or current_time < close_time
        return False

    def _serialize_day(weekday: int, row: BranchOperatingHour | None) -> dict[str, Any]:
        return {
            "weekday": weekday,
            "is_closed": bool(row.is_closed) if row is not None else True,
            "open_time": format_clock_value(row.open_time) if row is not None else None,
            "close_time": format_clock_value(row.close_time) if row is not None else None,
            "note": row.note if row is not None else None,
        }

    days = [_serialize_day(weekday, row_map.get(weekday)) for weekday in range(7)]
    current_row = row_map.get(current_weekday)
    latest_updated_at = max((row.updated_at for row in rows), default=None)

    return {
        "branch": {
            "id": str(branch.id),
            "gym_id": str(branch.gym_id),
            "name": branch.name,
            "display_name": branch.display_name,
            "code": branch.code,
            "slug": branch.slug,
            "timezone": branch.timezone,
        },
        "summary": {
            "current_weekday": current_weekday,
            "current_is_closed": not _is_open_now(current_row),
            "current_open_time": format_clock_value(current_row.open_time) if current_row is not None else None,
            "current_close_time": format_clock_value(current_row.close_time) if current_row is not None else None,
            "current_note": current_row.note if current_row is not None else None,
            "updated_at": latest_updated_at.isoformat() if latest_updated_at else None,
        },
        "days": days,
    }


def format_hours_announcement(branch: Branch, rows: Sequence[dict[str, Any]], locale: str) -> tuple[str, str]:
    lang = "ar" if locale == "ar" else "en"
    day_labels = DAY_LABELS[lang]
    parts: list[str] = []
    for row in sorted(rows, key=lambda item: int(item["weekday"])):
        weekday = int(row["weekday"])
        label = day_labels[weekday] if 0 <= weekday < len(day_labels) else str(weekday)
        if row.get("is_closed"):
            parts.append(f"{label}: {'مغلق' if lang == 'ar' else 'Closed'}")
            continue
        open_time = row.get("open_time") or "--:--"
        close_time = row.get("close_time") or "--:--"
        parts.append(
            f"{label}: {open_time} - {close_time}"
            if lang == "en"
            else f"{label}: {open_time} - {close_time}"
        )
    branch_name = branch.display_name or branch.name
    title = "تم تحديث ساعات العمل" if lang == "ar" else "Working hours updated"
    body_prefix = f"{branch_name}: " if lang == "en" else f"{branch_name} : "
    body = body_prefix + "؛ ".join(parts) if lang == "ar" else body_prefix + "; ".join(parts)
    return title, body
