import asyncio
import logging
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import FastAPI, HTTPException, status
from fastapi import Request
from fastapi.exceptions import RequestValidationError
from sqlalchemy.exc import IntegrityError
from sqlalchemy import text
from app.config import settings
from app.auth import router as auth_router
from app.routers.access import router as access_router
from app.routers.hr import router as hr_router
from app.routers.finance import router as finance_router
from app.routers.fitness import router as fitness_router
from app.routers.analytics import router as analytics_router
from app.routers.gamification import router as gamification_router
from app.routers.inventory import router as inventory_router
from app.routers.users import router as users_router
from app.routers.audit import router as audit_router
from app.routers.notifications import router as notifications_router
from app.routers.chat import router as chat_router
from app.routers.lost_found import router as lost_found_router
from app.routers.support import router as support_router
from app.core import exceptions
from fastapi.staticfiles import StaticFiles
import os
import uuid
from app.database import AsyncSessionLocal
from app.services.payroll_automation_service import PayrollAutomationService

from fastapi.middleware.cors import CORSMiddleware

logger = logging.getLogger(__name__)
PAYROLL_SCHEDULER_LOCK_KEY = 995311042
payroll_scheduler_task: asyncio.Task | None = None

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# Mount static files for profile pictures
os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

# CORS must be added before other middleware
configured_origins = [str(origin).rstrip("/") for origin in settings.BACKEND_CORS_ORIGINS]
default_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
]
allow_origins = configured_origins if settings.APP_ENV == "production" else list(dict.fromkeys([*default_origins, *configured_origins]))
allow_methods = ["*"] if settings.CORS_ALLOW_ALL_METHODS else settings.CORS_ALLOW_METHODS
allow_headers = ["*"] if settings.CORS_ALLOW_ALL_HEADERS else settings.CORS_ALLOW_HEADERS

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=allow_methods,
    allow_headers=allow_headers,
)


@app.middleware("http")
async def attach_request_id(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response

# Exception Handlers
app.add_exception_handler(RequestValidationError, exceptions.validation_exception_handler)  # type: ignore
app.add_exception_handler(IntegrityError, exceptions.integrity_exception_handler)  # type: ignore

# Routers
app.include_router(auth_router.router, prefix=f"{settings.API_V1_STR}/auth", tags=["Auth"])
app.include_router(access_router, prefix=f"{settings.API_V1_STR}/access", tags=["Access"])
app.include_router(hr_router, prefix=f"{settings.API_V1_STR}/hr", tags=["HR"])
app.include_router(finance_router, prefix=f"{settings.API_V1_STR}/finance", tags=["Finance"])
app.include_router(fitness_router, prefix=f"{settings.API_V1_STR}/fitness", tags=["Fitness"])
app.include_router(analytics_router, prefix=f"{settings.API_V1_STR}/analytics", tags=["Analytics"])
app.include_router(gamification_router, prefix=f"{settings.API_V1_STR}/gamification", tags=["Gamification"])
app.include_router(inventory_router, prefix=f"{settings.API_V1_STR}/inventory", tags=["Inventory"])
app.include_router(users_router, prefix=f"{settings.API_V1_STR}/users", tags=["Users"])
app.include_router(audit_router, prefix=f"{settings.API_V1_STR}/audit", tags=["Audit"])
app.include_router(notifications_router, prefix=f"{settings.API_V1_STR}/admin/notifications", tags=["Notifications"])
app.include_router(chat_router, prefix=f"{settings.API_V1_STR}/chat", tags=["Chat"])
app.include_router(lost_found_router, prefix=f"{settings.API_V1_STR}/lost-found", tags=["LostFound"])
app.include_router(support_router, prefix=f"{settings.API_V1_STR}/support", tags=["Support"])

@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.get("/healthz")
async def healthz():
    try:
        async with AsyncSessionLocal() as db:
            await db.execute(text("SELECT 1"))
    except Exception as exc:
        logger.exception("Health check failed")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="database unavailable",
        ) from exc
    return {"status": "ok", "database": "ok"}

@app.get("/")
async def root():
    return {"message": "Welcome to the Gym ERP API", "docs": "/docs"}

@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    from fastapi.responses import Response
    return Response(content=b"", media_type="image/x-icon")


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
        locked = bool((await db.execute(text("SELECT pg_try_advisory_lock(:key)"), {"key": PAYROLL_SCHEDULER_LOCK_KEY})).scalar())
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


@app.on_event("startup")
async def startup_payroll_scheduler() -> None:
    global payroll_scheduler_task
    _validate_security_settings()
    if not settings.PAYROLL_AUTO_ENABLED:
        logger.info("Payroll auto scheduler disabled by config")
        return
    if payroll_scheduler_task and not payroll_scheduler_task.done():
        return
    payroll_scheduler_task = asyncio.create_task(_payroll_scheduler_loop())
    logger.info(
        "Payroll scheduler started (hour=%s minute=%s tz=%s)",
        settings.PAYROLL_AUTO_HOUR_LOCAL,
        settings.PAYROLL_AUTO_MINUTE_LOCAL,
        settings.PAYROLL_AUTO_TZ or settings.GYM_TIMEZONE,
    )


@app.on_event("shutdown")
async def shutdown_payroll_scheduler() -> None:
    global payroll_scheduler_task
    if payroll_scheduler_task and not payroll_scheduler_task.done():
        payroll_scheduler_task.cancel()
        try:
            await payroll_scheduler_task
        except asyncio.CancelledError:
            pass
    payroll_scheduler_task = None


def _validate_security_settings() -> None:
    if settings.APP_ENV != "production":
        return

    errors: list[str] = []
    if len(settings.SECRET_KEY.strip()) < 24:
        errors.append("SECRET_KEY must be at least 24 characters in production.")
    if not settings.KIOSK_SIGNING_KEY or len(settings.KIOSK_SIGNING_KEY.strip()) < 24:
        errors.append("KIOSK_SIGNING_KEY must be set to a strong value in production.")
    if not settings.BACKEND_CORS_ORIGINS:
        errors.append("BACKEND_CORS_ORIGINS must be explicitly configured in production.")

    if errors:
        raise RuntimeError("; ".join(errors))
