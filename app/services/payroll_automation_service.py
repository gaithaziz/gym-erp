from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import logging
from zoneinfo import ZoneInfo
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.audit import AuditLog
from app.models.hr import Contract, Payroll, PayrollStatus
from app.services.payroll_service import PayrollService

logger = logging.getLogger(__name__)


@dataclass
class AutomationRunSummary:
    started_at: str
    finished_at: str
    duration_seconds: float
    users_scanned: int
    periods_scanned: int
    created: int
    updated: int
    skipped_paid: int
    errors: list[str]
    dry_run: bool
    reason: str


class PayrollAutomationService:
    _last_run: dict = {
        "last_run_at": None,
        "last_success_at": None,
        "last_error": None,
        "last_summary": None,
    }

    @staticmethod
    def _timezone() -> ZoneInfo:
        tz_name = settings.PAYROLL_AUTO_TZ or settings.GYM_TIMEZONE
        try:
            return ZoneInfo(tz_name)
        except Exception:
            logger.warning("Invalid PAYROLL_AUTO_TZ/GYM_TIMEZONE '%s', falling back to UTC", tz_name)
            return ZoneInfo("UTC")

    @staticmethod
    async def _get_cutoff_day(db: AsyncSession) -> int:
        return await PayrollService._get_cutoff_day(db)

    @staticmethod
    def _next_period(month: int, year: int) -> tuple[int, int]:
        return (1, year + 1) if month == 12 else (month + 1, year)

    @staticmethod
    def _prev_period(month: int, year: int) -> tuple[int, int]:
        return (12, year - 1) if month == 1 else (month - 1, year)

    @staticmethod
    def _period_for_local_date(day: datetime, cutoff_day: int) -> tuple[int, int]:
        if cutoff_day == 1:
            return day.month, day.year
        if day.day >= cutoff_day:
            return PayrollAutomationService._next_period(day.month, day.year)
        return day.month, day.year

    @staticmethod
    async def get_current_previous_periods(db: AsyncSession, *, now_utc: datetime | None = None) -> list[tuple[int, int]]:
        now_utc = now_utc or datetime.now(timezone.utc)
        local_now = now_utc.astimezone(PayrollAutomationService._timezone())
        cutoff_day = await PayrollAutomationService._get_cutoff_day(db)
        current = PayrollAutomationService._period_for_local_date(local_now, cutoff_day)
        previous = PayrollAutomationService._prev_period(*current)
        return [current, previous]

    @staticmethod
    async def periods_from_date_range(
        db: AsyncSession,
        *,
        start_date: datetime,
        end_date: datetime,
    ) -> set[tuple[int, int]]:
        tz = PayrollAutomationService._timezone()
        cutoff_day = await PayrollAutomationService._get_cutoff_day(db)
        start_local = start_date.astimezone(tz)
        end_local = end_date.astimezone(tz)

        periods: set[tuple[int, int]] = set()
        cursor = datetime(start_local.year, start_local.month, start_local.day, tzinfo=tz)
        end_cursor = datetime(end_local.year, end_local.month, end_local.day, tzinfo=tz)
        while cursor <= end_cursor:
            periods.add(PayrollAutomationService._period_for_local_date(cursor, cutoff_day))
            cursor += timedelta(days=1)
        return periods

    @staticmethod
    async def recalc_user_for_periods(
        db: AsyncSession,
        *,
        user_id: uuid.UUID,
        periods: list[tuple[int, int]],
        dry_run: bool = False,
    ) -> dict:
        created = 0
        updated = 0
        skipped_paid = 0
        errors: list[str] = []

        for month, year in periods:
            existing_stmt = select(Payroll).where(
                Payroll.user_id == user_id,
                Payroll.month == month,
                Payroll.year == year,
            )
            existing = (await db.execute(existing_stmt)).scalar_one_or_none()
            if existing and existing.status == PayrollStatus.PAID:
                skipped_paid += 1
                continue

            if dry_run:
                if existing:
                    updated += 1
                else:
                    created += 1
                continue

            try:
                await PayrollService.calculate_payroll(
                    user_id=user_id,
                    month=month,
                    year=year,
                    sales_volume=0.0,
                    db=db,
                    allow_paid_recalc=False,
                )
                if existing:
                    updated += 1
                else:
                    created += 1
            except Exception as exc:
                errors.append(f"{user_id}:{month}/{year}: {exc}")

        return {
            "created": created,
            "updated": updated,
            "skipped_paid": skipped_paid,
            "errors": errors,
        }

    @staticmethod
    async def run(
        db: AsyncSession,
        *,
        month: int | None = None,
        year: int | None = None,
        user_id: uuid.UUID | None = None,
        dry_run: bool = False,
        reason: str = "manual",
    ) -> dict:
        started = datetime.now(timezone.utc)

        if month is not None and year is not None:
            periods = [(month, year)]
        else:
            periods = await PayrollAutomationService.get_current_previous_periods(db)

        if user_id is not None:
            target_user_ids = [user_id]
        else:
            users_stmt = select(Contract.user_id)
            users_res = await db.execute(users_stmt)
            target_user_ids = list(dict.fromkeys(users_res.scalars().all()))

        created = 0
        updated = 0
        skipped_paid = 0
        errors: list[str] = []

        for uid in target_user_ids:
            stats = await PayrollAutomationService.recalc_user_for_periods(
                db,
                user_id=uid,
                periods=periods,
                dry_run=dry_run,
            )
            created += stats["created"]
            updated += stats["updated"]
            skipped_paid += stats["skipped_paid"]
            errors.extend(stats["errors"])

        finished = datetime.now(timezone.utc)
        summary = AutomationRunSummary(
            started_at=started.isoformat(),
            finished_at=finished.isoformat(),
            duration_seconds=round((finished - started).total_seconds(), 3),
            users_scanned=len(target_user_ids),
            periods_scanned=len(periods),
            created=created,
            updated=updated,
            skipped_paid=skipped_paid,
            errors=errors[:100],
            dry_run=dry_run,
            reason=reason,
        )

        PayrollAutomationService._last_run["last_run_at"] = finished.isoformat()
        PayrollAutomationService._last_run["last_summary"] = summary.__dict__
        if errors:
            PayrollAutomationService._last_run["last_error"] = errors[0]
        else:
            PayrollAutomationService._last_run["last_success_at"] = finished.isoformat()
            PayrollAutomationService._last_run["last_error"] = None

        db.add(
            AuditLog(
                user_id=None,
                action="PAYROLL_AUTOMATION_RUN",
                target_id=None,
                details=(
                    f"reason={reason}, users={summary.users_scanned}, periods={summary.periods_scanned}, "
                    f"created={summary.created}, updated={summary.updated}, skipped_paid={summary.skipped_paid}, "
                    f"errors={len(summary.errors)}"
                ),
                timestamp=finished,
            )
        )
        await db.commit()

        return summary.__dict__

    @staticmethod
    def status() -> dict:
        return {
            "enabled": settings.PAYROLL_AUTO_ENABLED,
            "schedule": {
                "hour_local": settings.PAYROLL_AUTO_HOUR_LOCAL,
                "minute_local": settings.PAYROLL_AUTO_MINUTE_LOCAL,
                "timezone": settings.PAYROLL_AUTO_TZ or settings.GYM_TIMEZONE,
            },
            **PayrollAutomationService._last_run,
        }
