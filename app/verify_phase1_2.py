import asyncio
import logging
from app.database import AsyncSessionLocal
from app.models.user import User
from app.models.access import Subscription, AccessLog
from sqlalchemy import select
from app.auth import security

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("VerifyPhase1_2")

async def verify():
    async with AsyncSessionLocal() as session:
        logger.info("--- Verifying Phase 1: Auth ---")
        # Check Admin User
        stmt = select(User).where(User.email == "admin@gym-erp.com")
        result = await session.execute(stmt)
        admin = result.scalar_one_or_none()
        
        if admin:
            logger.info("✅ Admin User found.")
            # Verify Password
            if security.verify_password("GymPass123!", admin.hashed_password):
                 logger.info("✅ Admin Password verified.")
            else:
                 logger.error("❌ Admin Password mismatch.")
        else:
            logger.error("❌ Admin User NOT found.")
            
        logger.info("--- Verifying Phase 2: Access ---")
        # Check Subscription
        stmt_sub = select(Subscription).limit(1)
        result_sub = await session.execute(stmt_sub)
        sub = result_sub.scalar_one_or_none()
        if sub:
             logger.info(f"✅ Found at least one subscription: {sub.plan_name} (Status: {sub.status})")
        else:
             logger.warning("⚠️ No subscriptions found.")
             
        logger.info("Verification Complete.")

if __name__ == "__main__":
    asyncio.run(verify())
