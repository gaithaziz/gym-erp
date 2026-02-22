from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.access import Subscription
from app.models.subscription_enums import SubscriptionStatus

SubscriptionStatusValue = Literal["ACTIVE", "FROZEN", "EXPIRED", "NONE"]
BlockReason = Literal["SUBSCRIPTION_EXPIRED", "SUBSCRIPTION_FROZEN", "NO_ACTIVE_SUBSCRIPTION"] | None


@dataclass
class SubscriptionAccessState:
    subscription_status: SubscriptionStatusValue
    subscription_end_date: datetime | None
    subscription_plan_name: str | None
    is_subscription_blocked: bool
    block_reason: BlockReason


class SubscriptionStatusService:
    @staticmethod
    async def get_user_subscription_state(user_id: uuid.UUID, db: AsyncSession) -> SubscriptionAccessState:
        stmt = select(Subscription).where(Subscription.user_id == user_id)
        result = await db.execute(stmt)
        subscription = result.scalar_one_or_none()

        if not subscription:
            return SubscriptionAccessState(
                subscription_status="NONE",
                subscription_end_date=None,
                subscription_plan_name=None,
                is_subscription_blocked=True,
                block_reason="NO_ACTIVE_SUBSCRIPTION",
            )

        end_date = subscription.end_date
        if end_date.tzinfo is None:
            end_date = end_date.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)

        if end_date < now:
            return SubscriptionAccessState(
                subscription_status="EXPIRED",
                subscription_end_date=end_date,
                subscription_plan_name=subscription.plan_name,
                is_subscription_blocked=True,
                block_reason="SUBSCRIPTION_EXPIRED",
            )

        if subscription.status == SubscriptionStatus.FROZEN:
            return SubscriptionAccessState(
                subscription_status="FROZEN",
                subscription_end_date=end_date,
                subscription_plan_name=subscription.plan_name,
                is_subscription_blocked=True,
                block_reason="SUBSCRIPTION_FROZEN",
            )

        if subscription.status != SubscriptionStatus.ACTIVE:
            return SubscriptionAccessState(
                subscription_status="NONE",
                subscription_end_date=end_date,
                subscription_plan_name=subscription.plan_name,
                is_subscription_blocked=True,
                block_reason="NO_ACTIVE_SUBSCRIPTION",
            )

        return SubscriptionAccessState(
            subscription_status="ACTIVE",
            subscription_end_date=end_date,
            subscription_plan_name=subscription.plan_name,
            is_subscription_blocked=False,
            block_reason=None,
        )
