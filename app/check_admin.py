import asyncio
from app.database import AsyncSessionLocal
from app.models.user import User
from app.auth.security import get_password_hash, verify_password
from sqlalchemy import select

async def check_admin():
    async with AsyncSessionLocal() as session:
        print("Checking for admin user...")
        stmt = select(User).where(User.email == "admin@gym-erp.com")
        result = await session.execute(stmt)
        user = result.scalar_one_or_none()
        
        if user:
            print(f"Admin user found: {user.email}")
            # Verify password
            if verify_password("password123", user.hashed_password):
                print("Password 'password123' is CORRECT.")
            else:
                print("Password 'password123' is INCORRECT.")
                print("Resetting password to 'password123'...")
                user.hashed_password = get_password_hash("password123")
                await session.commit()
                print("Password reset to 'password123'.")
        else:
            print("Admin user NOT found.")
            print("Creating admin user...")
            new_admin = User(
                email="admin@gym-erp.com",
                hashed_password=get_password_hash("password123"),
                full_name="System Admin",
                role="ADMIN",
                is_active=True
            )
            session.add(new_admin)
            await session.commit()
            print("Admin user created with password 'password123'.")

if __name__ == "__main__":
    asyncio.run(check_admin())
