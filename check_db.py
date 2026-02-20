import asyncio
from sqlalchemy import text
from app.database import engine

async def check():
    async with engine.connect() as conn:
        result = await conn.execute(text("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name"))
        tables = [row[0] for row in result]
        print("=== TABLES IN DATABASE ===")
        for t in tables:
            print(f"  - {t}")

asyncio.run(check())
