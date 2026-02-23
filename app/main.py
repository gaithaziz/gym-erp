from fastapi import FastAPI
from fastapi import Request
from fastapi.exceptions import RequestValidationError
from sqlalchemy.exc import IntegrityError
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

from fastapi.middleware.cors import CORSMiddleware

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
allow_origins = list(dict.fromkeys([*default_origins, *configured_origins]))

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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

@app.get("/")
async def root():
    return {"message": "Welcome to the Gym ERP API", "docs": "/docs"}

@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    from fastapi.responses import Response
    return Response(content=b"", media_type="image/x-icon")
