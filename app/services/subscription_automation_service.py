import logging
from datetime import datetime, timezone, timedelta
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.tenancy import Gym
from app.models.audit import AuditLog
from app.database import set_rls_context
from app.models.enums import Role

logger = logging.getLogger(__name__)

class SubscriptionAutomationService:
    @staticmethod
    async def run(db: AsyncSession):
        """
        Scans for expired gym subscriptions and enforces maintenance mode.
        """
        # Bypass RLS to see all gyms
        await set_rls_context(db, role=Role.SUPER_ADMIN.value)
        
        now = datetime.now(timezone.utc)
        
        # 1. Find gyms that should be locked
        # Expiry + Grace Period < Now
        lock_stmt = select(Gym).where(
            and_(
                Gym.subscription_expires_at != None,
                Gym.is_maintenance_mode == False,
                Gym.is_active == True,
                # Using a manual calculation here as SQLAlchemy/DB intervals can be tricky across dialects
                # We'll just fetch all with expiry and filter in Python for safety, 
                # or use a raw SQL comparison if performance is an issue.
            )
        )
        
        res = await db.execute(lock_stmt)
        gyms = res.scalars().all()
        
        locked_count = 0
        for gym in gyms:
            if gym.subscription_expires_at is None:
                continue
                
            deadline = gym.subscription_expires_at + timedelta(days=gym.grace_period_days)
            if now > deadline:
                logger.info(f"Locking gym {gym.name} (ID: {gym.id}) due to expired subscription.")
                gym.is_maintenance_mode = True
                
                # Log to global audit
                db.add(AuditLog(
                    gym_id=gym.id,
                    action="GYM_AUTO_LOCKED",
                    target_id=str(gym.id),
                    details=f"Gym auto-locked due to subscription expiry ({gym.subscription_expires_at.date()})."
                ))
                locked_count += 1
                
        # 2. Find gyms that were renewed and should be unlocked
        # This is more for self-healing if a Super-Admin extends the date
        unlock_stmt = select(Gym).where(
            and_(
                Gym.is_maintenance_mode == True,
                Gym.subscription_expires_at != None,
                Gym.is_active == True
            )
        )
        
        res = await db.execute(unlock_stmt)
        gyms_to_unlock = res.scalars().all()
        
        unlocked_count = 0
        for gym in gyms_to_unlock:
            if gym.subscription_expires_at is None:
                continue
                
            deadline = gym.subscription_expires_at + timedelta(days=gym.grace_period_days)
            if now <= deadline:
                logger.info(f"Unlocking gym {gym.name} (ID: {gym.id}) - subscription renewed.")
                gym.is_maintenance_mode = False
                
                db.add(AuditLog(
                    gym_id=gym.id,
                    action="GYM_AUTO_UNLOCKED",
                    target_id=str(gym.id),
                    details="Gym auto-unlocked following subscription renewal."
                ))
                unlocked_count += 1
                
        if locked_count > 0 or unlocked_count > 0:
            await db.commit()
            
        return {
            "locked": locked_count,
            "unlocked": unlocked_count
        }
