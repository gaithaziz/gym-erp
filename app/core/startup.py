import logging

from sqlalchemy import select

from app.auth.security import get_password_hash
from app.config import settings
from app.database import AsyncSessionLocal, set_rls_context
from app.models.enums import Role
from app.models.system import SystemConfig
from app.models.user import User
from app.services.tenancy_service import TenancyService

logger = logging.getLogger(__name__)

LOCAL_ADMIN_EMAIL = "admin@gym-erp.com"
LOCAL_ADMIN_PASSWORD = "GymPass123!"
DEMO_SEED_MARKER_KEY = "demo_seed_classes_v1_completed"


async def ensure_local_admin_user() -> None:
    if settings.APP_ENV != "development":
        return

    async with AsyncSessionLocal() as db:
        await set_rls_context(db, role="SUPER_ADMIN")
        gym, branch = await TenancyService.ensure_default_gym_and_branch(db)
        await set_rls_context(db, role="SUPER_ADMIN", gym_id=str(gym.id), branch_id=str(branch.id))
        existing = (await db.execute(select(User).where(User.email == LOCAL_ADMIN_EMAIL))).scalar_one_or_none()
        if existing is None:
            db.add(
                User(
                    gym_id=gym.id,
                    email=LOCAL_ADMIN_EMAIL,
                    hashed_password=get_password_hash(LOCAL_ADMIN_PASSWORD),
                    full_name="System Admin",
                    role=Role.ADMIN,
                    is_active=True,
                    home_branch_id=branch.id,
                )
            )
            logger.info("Created local development admin user: %s", LOCAL_ADMIN_EMAIL)
        else:
            existing.gym_id = gym.id
            existing.full_name = existing.full_name or "System Admin"
            existing.role = Role.ADMIN
            existing.is_active = True
            existing.home_branch_id = branch.id
            if settings.RESET_LOCAL_ADMIN_ON_STARTUP:
                existing.hashed_password = get_password_hash(LOCAL_ADMIN_PASSWORD)
                logger.info("Reset local development admin password for: %s", LOCAL_ADMIN_EMAIL)
            else:
                logger.info("Preserved local development admin password for: %s", LOCAL_ADMIN_EMAIL)

        await db.commit()
        existing = (await db.execute(select(User).where(User.email == LOCAL_ADMIN_EMAIL))).scalar_one()
        await TenancyService.ensure_user_branch_access(db, user_id=existing.id, gym_id=gym.id, branch_id=branch.id)
        await db.commit()


async def ensure_demo_classes_seed() -> None:
    if settings.APP_ENV != "development" or not settings.DEMO_SEED_ON_STARTUP:
        return

    async with AsyncSessionLocal() as db:
        marker = (
            await db.execute(select(SystemConfig).where(SystemConfig.key == DEMO_SEED_MARKER_KEY))
        ).scalar_one_or_none()
        if marker and marker.value_bool:
            return

    from app.seed_demo_data import seed_demo_data

    logger.info("Seeding demo classes and related sample data for development")
    await seed_demo_data()

    async with AsyncSessionLocal() as db:
        marker = (
            await db.execute(select(SystemConfig).where(SystemConfig.key == DEMO_SEED_MARKER_KEY))
        ).scalar_one_or_none()
        if marker is None:
            db.add(SystemConfig(key=DEMO_SEED_MARKER_KEY, value_bool=True))
        else:
            marker.value_bool = True
        await db.commit()
