import argparse
import asyncio
import logging

from sqlalchemy import select

from app.database import AsyncSessionLocal, set_rls_context
from app.models.enums import Role
from app.models.user import User
from app.services import gamification_service

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def backfill_gamification(email: str | None = None) -> None:
    async with AsyncSessionLocal() as session:
        await set_rls_context(session, role=Role.ADMIN.value)

        if email:
            user = (await session.execute(select(User).where(User.email == email))).scalar_one_or_none()
            if not user:
                raise SystemExit(f"User not found: {email}")
            results = [await gamification_service.rebuild_user_gamification(user.id, session)]
        else:
            results = await gamification_service.rebuild_all_gamification(session)

        await session.commit()

        for result in results:
            logger.info(
                "Backfilled %s visits=%s current_streak=%s best_streak=%s badges=%s",
                result["user_id"],
                result["total_visits"],
                result["current_streak"],
                result["best_streak"],
                ",".join(result["badge_types"]) or "-",
            )

        logger.info("Gamification backfill complete for %s user(s).", len(results))


def main() -> None:
    parser = argparse.ArgumentParser(description="Rebuild gamification state from historical access logs.")
    parser.add_argument("--email", help="Recompute gamification for a single user email.")
    args = parser.parse_args()
    asyncio.run(backfill_gamification(email=args.email))


if __name__ == "__main__":
    main()
