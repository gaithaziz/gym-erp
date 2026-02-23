import asyncio
import os
from sqlalchemy.ext.asyncio import create_async_engine
from app.config import settings
from app.models.chat import Base as ChatBase
from app.database import Base
from sqlalchemy import text

async def main():
    engine = create_async_engine(str(settings.SQLALCHEMY_DATABASE_URI))
    async with engine.begin() as conn:
        print("Dropping old chat tables...")
        await conn.execute(text("DROP TABLE IF EXISTS messages CASCADE"))
        await conn.execute(text("DROP TABLE IF EXISTS conversations CASCADE"))
        await conn.execute(text("DROP TABLE IF EXISTS chat_read_receipts CASCADE"))
        await conn.execute(text("DROP TABLE IF EXISTS chat_messages CASCADE"))
        await conn.execute(text("DROP TABLE IF EXISTS chat_threads CASCADE"))
        
        print("Fixing alembic_version...")
        # Get the latest revision from alembic/versions
        versions = os.listdir("alembic/versions")
        versions.sort()
        # Find the actual head in the python files... wait, alembic stamp head is easier.
        await conn.execute(text("DELETE FROM alembic_version"))
    
    # Re-create tables from the new models
    async with engine.begin() as conn:
        print("Creating new chat tables...")
        await conn.run_sync(Base.metadata.create_all)

    await engine.dispose()
    print("Done")

if __name__ == "__main__":
    asyncio.run(main())
