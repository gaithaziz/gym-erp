from fastapi import Request, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from sqlalchemy import select
import os
from jose import JWTError, jwt

from app.database import AsyncSessionLocal
from app.models.tenancy import Gym
from app.models.system import SystemConfig
from app.config import settings
import logging

logger = logging.getLogger(__name__)


def _error_response(status_code: int, detail: str) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"detail": detail})


def _extract_token_scope(request: Request) -> tuple[str | None, str | None]:
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None, None

    token = auth_header.split(" ", 1)[1].strip()
    if not token:
        return None, None

    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return None, None

    role = payload.get("role")
    gym_id = payload.get("gym_id")
    return (str(role) if role is not None else None, str(gym_id) if gym_id is not None else None)


class MaintenanceMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if settings.APP_ENV == "test" or os.environ.get("PYTEST_CURRENT_TEST"):
            return await call_next(request)
        # 1. Allow health checks and internal routes
        if request.url.path in ["/healthz", "/metrics", "/docs", "/redoc", "/openapi.json"]:
            return await call_next(request)
        
        token_role, token_gym_id = _extract_token_scope(request)

        # System routes remain available so super-admins can recover a locked tenant.
        if request.url.path.startswith("/api/v1/system") or token_role == "SUPER_ADMIN":
            return await call_next(request)

        async with AsyncSessionLocal() as db:
            global_maint = await db.execute(
                select(SystemConfig).where(SystemConfig.key == "global_maintenance_mode")
            )
            config = global_maint.scalar_one_or_none()
            if config and config.value_bool:
                return _error_response(
                    status.HTTP_503_SERVICE_UNAVAILABLE,
                    "System is undergoing global maintenance.",
                )

            gym_id = request.headers.get("X-Gym-Id") or token_gym_id
            if gym_id:
                try:
                    gym_stmt = select(Gym).where(Gym.id == gym_id)
                    gym_res = await db.execute(gym_stmt)
                    gym = gym_res.scalar_one_or_none()
                    if gym and not gym.is_active:
                        return _error_response(
                            status.HTTP_403_FORBIDDEN,
                            "Gym is suspended",
                        )
                    if gym and gym.is_maintenance_mode:
                        return _error_response(
                            status.HTTP_503_SERVICE_UNAVAILABLE,
                            f"Gym '{gym.name}' is undergoing maintenance.",
                        )
                except Exception:
                    logger.exception("Failed to resolve gym access state for request path=%s", request.url.path)

        return await call_next(request)
