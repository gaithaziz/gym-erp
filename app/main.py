from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from sqlalchemy.exc import IntegrityError
from app.config import settings
from app.auth import router as auth_router
from app.routers.access import router as access_router
from app.routers.hr import router as hr_router
from app.routers.finance import router as finance_router
from app.routers.fitness import router as fitness_router
from app.routers.analytics import router as analytics_router
from app.core import exceptions

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# CORS must be added before other middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Exception Handlers
app.add_exception_handler(RequestValidationError, exceptions.validation_exception_handler)
app.add_exception_handler(IntegrityError, exceptions.integrity_exception_handler)

# Routers
app.include_router(auth_router.router, prefix=f"{settings.API_V1_STR}/auth", tags=["Auth"])
app.include_router(access_router, prefix=f"{settings.API_V1_STR}/access", tags=["Access"])
app.include_router(hr_router, prefix=f"{settings.API_V1_STR}/hr", tags=["HR"])
app.include_router(finance_router, prefix=f"{settings.API_V1_STR}/finance", tags=["Finance"])
app.include_router(fitness_router, prefix=f"{settings.API_V1_STR}/fitness", tags=["Fitness"])
app.include_router(analytics_router, prefix=f"{settings.API_V1_STR}/analytics", tags=["Analytics"])

@app.get("/health")
async def health_check():
    return {"status": "ok"}
