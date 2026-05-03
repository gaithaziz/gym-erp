import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import text

from app.config import settings
from app.database import AsyncSessionLocal
from app.services.payroll_automation_service import PayrollAutomationService
from app.services.subscription_automation_service import SubscriptionAutomationService

logger = logging.getLogger(__name__)

PAYROLL_SCHEDULER_LOCK_KEY = 995311042
SUBSCRIPTION_SCHEDULER_LOCK_KEY = 995311043

payroll_scheduler_task: asyncio.Task | None = None
subscription_scheduler_task: asyncio.Task | None = None


def background_tasks_enabled() -> bool:
    is_test_context = settings.APP_ENV == "test" or bool(os.environ.get("PYTEST_CURRENT_TEST"))
    return not is_test_context or settings.BACKGROUND_TASKS_ENABLED_IN_TESTS


def _payroll_scheduler_tz() -> ZoneInfo:
    tz_name = settings.PAYROLL_AUTO_TZ or settings.GYM_TIMEZONE
    try:
        return ZoneInfo(tz_name)
    except Exception:
        logger.warning("Invalid payroll scheduler timezone '%s'; falling back to UTC", tz_name)
        return ZoneInfo("UTC")


def _seconds_until_next_run(now_utc: datetime) -> float:
    tz = _payroll_scheduler_tz()
    now_local = now_utc.astimezone(tz)
    target_local = now_local.replace(
        hour=settings.PAYROLL_AUTO_HOUR_LOCAL,
        minute=settings.PAYROLL_AUTO_MINUTE_LOCAL,
        second=0,
        microsecond=0,
    )
    if now_local >= target_local:
        target_local += timedelta(days=1)
    return max((target_local.astimezone(timezone.utc) - now_utc).total_seconds(), 1.0)


async def _run_payroll_scheduler_once() -> None:
    async with AsyncSessionLocal() as db:
        locked = bool(
            (
                await db.execute(
                    text("SELECT pg_try_advisory_lock(:key)"),
                    {"key": PAYROLL_SCHEDULER_LOCK_KEY},
                )
            ).scalar()
        )
        if not locked:
            logger.info("Payroll scheduler lock busy; skipping this cycle")
            return
        try:
            summary = await PayrollAutomationService.run(db, reason="scheduled_daily")
            logger.info(
                "Payroll scheduler run complete: users=%s periods=%s created=%s updated=%s skipped_paid=%s errors=%s",
                summary["users_scanned"],
                summary["periods_scanned"],
                summary["created"],
                summary["updated"],
                summary["skipped_paid"],
                len(summary["errors"]),
            )
        finally:
            await db.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": PAYROLL_SCHEDULER_LOCK_KEY})
            await db.commit()


async def _payroll_scheduler_loop() -> None:
    while True:
        delay = _seconds_until_next_run(datetime.now(timezone.utc))
        await asyncio.sleep(delay)
        try:
            await _run_payroll_scheduler_once()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Payroll scheduler iteration failed")


async def _subscription_scheduler_loop() -> None:
    interval_seconds = max(settings.SUBSCRIPTION_AUTO_INTERVAL_HOURS, 1) * 60 * 60
    while True:
        try:
            await _run_subscription_scheduler_once()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Subscription scheduler iteration failed")

        await asyncio.sleep(interval_seconds)


async def _run_subscription_scheduler_once() -> None:
    async with AsyncSessionLocal() as db:
        locked = bool(
            (
                await db.execute(
                    text("SELECT pg_try_advisory_lock(:key)"),
                    {"key": SUBSCRIPTION_SCHEDULER_LOCK_KEY},
                )
            ).scalar()
        )
        if not locked:
            logger.info("Subscription scheduler lock busy; skipping this cycle")
            return
        try:
            summary = await SubscriptionAutomationService.run(db)
            if summary["locked"] > 0 or summary["unlocked"] > 0:
                logger.info(
                    "Subscription scheduler: locked=%s, unlocked=%s",
                    summary["locked"],
                    summary["unlocked"],
                )
        finally:
            await db.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": SUBSCRIPTION_SCHEDULER_LOCK_KEY})
            await db.commit()


def start_background_schedulers() -> list[asyncio.Task]:
    global payroll_scheduler_task, subscription_scheduler_task

    tasks: list[asyncio.Task] = []
    if not background_tasks_enabled():
        logger.info("Background schedulers disabled in test environment")
        return tasks

    if settings.SUBSCRIPTION_AUTO_ENABLED:
        if subscription_scheduler_task and not subscription_scheduler_task.done():
            logger.info("Subscription scheduler already running")
        else:
            subscription_scheduler_task = asyncio.create_task(_subscription_scheduler_loop())
            logger.info(
                "Subscription scheduler started (interval_hours=%s)",
                settings.SUBSCRIPTION_AUTO_INTERVAL_HOURS,
            )
        tasks.append(subscription_scheduler_task)
    else:
        logger.info("Subscription scheduler disabled by config")

    if settings.PAYROLL_AUTO_ENABLED:
        if payroll_scheduler_task and not payroll_scheduler_task.done():
            logger.info("Payroll scheduler already running")
        else:
            payroll_scheduler_task = asyncio.create_task(_payroll_scheduler_loop())
            logger.info(
                "Payroll scheduler started (hour=%s minute=%s tz=%s)",
                settings.PAYROLL_AUTO_HOUR_LOCAL,
                settings.PAYROLL_AUTO_MINUTE_LOCAL,
                settings.PAYROLL_AUTO_TZ or settings.GYM_TIMEZONE,
            )
        tasks.append(payroll_scheduler_task)
    else:
        logger.info("Payroll auto scheduler disabled by config")

    return [task for task in tasks if task is not None]


async def stop_background_schedulers(tasks: list[asyncio.Task] | None = None) -> None:
    global payroll_scheduler_task, subscription_scheduler_task

    targets = [payroll_scheduler_task, subscription_scheduler_task] if tasks is None else tasks
    for task in targets:
        if task and not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

    if payroll_scheduler_task and payroll_scheduler_task.done():
        payroll_scheduler_task = None
    if subscription_scheduler_task and subscription_scheduler_task.done():
        subscription_scheduler_task = None
