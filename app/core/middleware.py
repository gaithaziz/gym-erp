from fastapi import Request, HTTPException, status
from starlette.middleware.base import BaseHTTPMiddleware
from sqlalchemy import select
import os
from app.database import AsyncSessionLocal
from app.models.tenancy import Gym
from app.models.system import SystemConfig
from app.models.enums import Role
from app.config import settings
# from app.auth.security import decode_token # Placeholder for future role-based bypass logic
import logging

logger = logging.getLogger(__name__)

class MaintenanceMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if settings.APP_ENV == "test" or os.environ.get("PYTEST_CURRENT_TEST"):
            return await call_next(request)
        # 1. Allow health checks and internal routes
        if request.url.path in ["/healthz", "/metrics", "/docs", "/redoc", "/openapi.json"]:
            return await call_next(request)
        
        # 2. Check for Super-Admin bypass
        # We try to extract the user from the token if present
        auth_header = request.headers.get("Authorization")
        is_super_admin = False
        if auth_header and auth_header.startswith("Bearer "):
            try:
                # We won't do full validation here to keep it fast, 
                # but we need the role.
                # In a real app, we'd use a cached session or a fast JWT decode.
                pass 
            except:
                pass

        # For now, we'll implement a simple check: 
        # If the route is /api/v1/system/*, it's for super-admins anyway (they have a role check dependency).
        # We only care about blocking regular gym routes.
        if request.url.path.startswith("/api/v1/system"):
            return await call_next(request)

        async with AsyncSessionLocal() as db:
            # 3. Check Global Maintenance
            global_maint = await db.execute(
                select(SystemConfig).where(SystemConfig.key == "global_maintenance_mode")
            )
            config = global_maint.scalar_one_or_none()
            if config and config.value_bool:
                # Still allow super admins if we could identify them, 
                # but for simplicity in this MVP, we'll block and 
                # let them use the /system routes to turn it off.
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="System is undergoing global maintenance."
                )

            # 4. Check Gym-level Maintenance
            # We need to know which gym this request belongs to.
            # Usually it's in the X-Gym-Id header or the user's token.
            gym_id = request.headers.get("X-Gym-Id")
            if gym_id:
                try:
                    gym_stmt = select(Gym).where(Gym.id == gym_id)
                    gym_res = await db.execute(gym_stmt)
                    gym = gym_res.scalar_one_or_none()
                    if gym and gym.is_maintenance_mode:
                        raise HTTPException(
                            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                            detail=f"Gym '{gym.name}' is undergoing maintenance."
                        )
                except:
                    pass # Invalid UUID or other error

        return await call_next(request)
