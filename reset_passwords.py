import asyncio
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models.user import User
from app.auth.security import get_password_hash

async def reset_passwords():
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User))
        users = result.scalars().all()
        for u in users:
            u.hashed_password = get_password_hash("GymPass123!")
            print(f"Reset password for {u.email}")
        await session.commit()
    print("All passwords reset to GymPass123!")

if __name__ == "__main__":
    asyncio.run(reset_passwords())
