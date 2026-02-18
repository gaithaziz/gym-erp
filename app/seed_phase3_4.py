import asyncio
import logging
import uuid
from datetime import datetime, timezone
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models.user import User
from app.models.fitness import DietPlan, WorkoutPlan
from app.models.workout_log import WorkoutLog

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def seed_phase3_4():
    async with AsyncSessionLocal() as session:
        # Get Coach Mike
        stmt = select(User).where(User.email == "coach.mike@gym-erp.com")
        result = await session.execute(stmt)
        coach = result.scalar_one_or_none()
        
        if not coach:
            logger.error("Coach Mike not found! Run initial seed first.")
            return

        # Get Bob (Customer)
        stmt = select(User).where(User.email == "bob@client.com")
        result = await session.execute(stmt)
        bob = result.scalar_one_or_none()

        if not bob:
            logger.error("Bob not found! Run initial seed first.")
            return

        # 1. Create Diet Plan
        logger.info("Creating Diet Plan...")
        diet = DietPlan(
            name="Weight Loss Phase 1",
            description="Low carb, high protein for 4 weeks",
            id=uuid.uuid4(),
            creator_id=coach.id,
            member_id=bob.id,
            content="Breakfast: 3 eggs, spinach. Lunch: Chicken salad. Dinner: Salmon, broccoli."
        )
        session.add(diet)
        
        # 2. Get existing workout plan to log against
        stmt = select(WorkoutPlan).where(WorkoutPlan.creator_id == coach.id)
        result = await session.execute(stmt)
        plan = result.scalars().first()
        
        if not plan:
            logger.info("Creating Workout Plan for testing...")
            plan = WorkoutPlan(
                name="Full Body Blas 1",
                description="High intensity interval training",
                creator_id=coach.id,
                id=uuid.uuid4()
            )
            session.add(plan)
            await session.flush() # Get ID

        logger.info(f"Logging workout feedback for plan: {plan.name}")
        # 3. Create Workout Log
        log = WorkoutLog(
            member_id=bob.id,
            plan_id=plan.id,
            completed=True,
            difficulty_rating=4,
            comment="Great workout but the unexpected burpees were brutal!",
            date=datetime.now(timezone.utc).replace(tzinfo=None)
        )
        session.add(log)

        await session.commit()
        logger.info("Phase 3 & 4 Seed Data Created Successfully!")

if __name__ == "__main__":
    loop = asyncio.get_event_loop()
    loop.run_until_complete(seed_phase3_4())
