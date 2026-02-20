import asyncio
import logging
from datetime import datetime, timedelta, timezone, date
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models.user import User
from app.models.enums import Role
from app.models.access import Subscription, SubscriptionStatus
from app.models.hr import Contract, ContractType
from app.auth.security import get_password_hash

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# SEED_SPEC.md Data
USERS = [
    # 2.1 Admin
    {
        "email": "admin@gym-erp.com",
        "full_name": "System Administrator",
        "role": Role.ADMIN,
        "password": "GymPass123!",
    },
    # 2.2 Coaches
    {
        "email": "coach.mike@gym-erp.com",
        "full_name": "Coach Mike",
        "role": Role.COACH,
        "password": "GymPass123!",
    },
    {
        "email": "coach.sara@gym-erp.com",
        "full_name": "Coach Sara",
        "role": Role.COACH,
        "password": "GymPass123!",
    },
    # 2.3 Operational Staff
    {
        "email": "cleaner.john@gym-erp.com",
        "full_name": "John Cleaner",
        "role": Role.EMPLOYEE,
        "password": "GymPass123!",
    },
    # 2.4 Customers
    {
        "email": "alice@client.com",
        "full_name": "Alice Customer",
        "role": Role.CUSTOMER,
        "password": "GymPass123!",
        "subscription": {
            "plan_name": "Gold Membership",
            "start_date": -30,
            "end_date": 30,
            "status": SubscriptionStatus.ACTIVE
        }
    },
    {
        "email": "bob@client.com",
        "full_name": "Bob Customer",
        "role": Role.CUSTOMER,
        "password": "GymPass123!",
        "subscription": {
            "plan_name": "Standard",
            "start_date": -30,
            "end_date": 30,
            "status": SubscriptionStatus.FROZEN
        }
    },
    {
        "email": "charlie@client.com",
        "full_name": "Charlie Customer",
        "role": Role.CUSTOMER,
        "password": "GymPass123!",
    },
    {
        "email": "dana@client.com",
        "full_name": "Dana Customer",
        "role": Role.CUSTOMER,
        "password": "GymPass123!",
    },
    {
        "email": "expired.eddy@client.com",
        "full_name": "Expired Eddy",
        "role": Role.CUSTOMER,
        "password": "GymPass123!",
        "subscription": {
            "plan_name": "Student Plan",
            "start_date": -60,
            "end_date": -1,
            "status": SubscriptionStatus.EXPIRED 
        }
    },
]

async def seed_data():
    async with AsyncSessionLocal() as session:
        for user_data in USERS:
            stmt = select(User).where(User.email == user_data["email"])
            result = await session.execute(stmt)
            existing_user = result.scalar_one_or_none()
            
            user = existing_user
            if not existing_user:
                new_user = User(
                    email=user_data["email"],
                    full_name=user_data["full_name"],
                    hashed_password=get_password_hash(user_data["password"]),
                    role=user_data["role"],
                    is_active=True,
                )
                session.add(new_user)
                await session.flush() # Get ID
                user = new_user
                logger.info(f"Created user: {user_data['email']}")
            else:
                logger.info(f"User already exists: {user_data['email']}")
            
            assert user is not None
            
            # Seed Subscription if configured
            if "subscription" in user_data:
                sub_data = user_data["subscription"]
                stmt_sub = select(Subscription).where(Subscription.user_id == user.id)
                result_sub = await session.execute(stmt_sub)
                existing_sub = result_sub.scalar_one_or_none()
                
                if not existing_sub:
                    now = datetime.now(timezone.utc)
                    start = now + timedelta(days=sub_data["start_date"])
                    end = now + timedelta(days=sub_data["end_date"])
                    
                    new_sub = Subscription(
                        user_id=user.id,
                        plan_name=sub_data["plan_name"],
                        start_date=start,
                        end_date=end,
                        status=sub_data["status"]
                    )
                    session.add(new_sub)
                    logger.info(f"Created subscription for {user_data['email']}")
            
            # Seed Contract for Coach Mike
            if user.email == "coach.mike@gym-erp.com":
                stmt_contract = select(Contract).where(Contract.user_id == user.id)
                result_contract = await session.execute(stmt_contract)
                if not result_contract.scalar_one_or_none():
                     new_contract = Contract(
                         user_id=user.id,
                         start_date=date.today(),
                         base_salary=5000.0, # Monthly
                         contract_type=ContractType.FULL_TIME,
                         standard_hours=160
                     )
                     session.add(new_contract)
                     logger.info(f"Created contract for {user.email}")

        await session.commit()
    logger.info("Seeding complete.")

if __name__ == "__main__":
    loop = asyncio.get_event_loop()
    loop.run_until_complete(seed_data())
