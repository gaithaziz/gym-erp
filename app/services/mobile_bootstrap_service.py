from __future__ import annotations

from collections.abc import Iterable
from typing import TypeVar

from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import schemas
from app.config import settings
from app.models.enums import Role
from app.models.notification import MobileNotificationPreference
from app.models.user import User
from app.services.subscription_status_service import SubscriptionAccessState, SubscriptionStatusService

T = TypeVar("T")


class MobileBootstrapService:
    _ROLE_CAPABILITIES: dict[Role, tuple[schemas.CapabilityValue, ...]] = {
        Role.CUSTOMER: (
            "scan_gym_qr",
            "renew_subscription",
            "view_receipts",
            "view_profile",
            "view_notifications",
            "view_chat",
            "view_support",
        ),
        Role.COACH: (
            "view_personal_qr",
            "lookup_members",
            "manage_member_plans",
            "manage_member_diets",
            "view_profile",
            "view_notifications",
            "view_chat",
            "view_support",
        ),
        Role.RECEPTION: (
            "scan_member_qr",
            "lookup_members",
            "handle_support_queue",
            "view_profile",
            "view_notifications",
            "view_support",
        ),
        Role.FRONT_DESK: (
            "scan_member_qr",
            "lookup_members",
            "handle_support_queue",
            "view_profile",
            "view_notifications",
            "view_support",
        ),
        Role.CASHIER: (
            "use_pos",
            "view_finance_summary",
            "view_receipts",
            "view_profile",
            "view_notifications",
        ),
        Role.EMPLOYEE: (
            "view_personal_qr",
            "view_profile",
            "view_notifications",
            "view_support",
        ),
        Role.MANAGER: (
            "scan_member_qr",
            "lookup_members",
            "manage_member_plans",
            "manage_member_diets",
            "view_finance_summary",
            "use_pos",
            "manage_inventory",
            "handle_support_queue",
            "view_profile",
            "view_notifications",
            "view_chat",
            "view_support",
        ),
        Role.ADMIN: (
            "scan_member_qr",
            "lookup_members",
            "manage_member_plans",
            "manage_member_diets",
            "view_finance_summary",
            "use_pos",
            "manage_inventory",
            "handle_support_queue",
            "view_audit_summary",
            "view_profile",
            "view_notifications",
            "view_chat",
            "view_support",
        ),
    }

    _ROLE_MODULES: dict[Role, tuple[schemas.EnabledModuleValue, ...]] = {
        Role.CUSTOMER: ("home", "qr", "plans", "progress", "support", "chat", "profile", "notifications"),
        Role.COACH: ("home", "qr", "members", "plans", "support", "chat", "profile", "notifications"),
        Role.RECEPTION: ("home", "qr", "members", "support", "profile", "notifications"),
        Role.FRONT_DESK: ("home", "qr", "members", "support", "profile", "notifications"),
        Role.CASHIER: ("home", "finance", "operations", "qr", "profile", "notifications"),
        Role.EMPLOYEE: ("home", "qr", "operations", "support", "profile", "notifications"),
        Role.MANAGER: ("home", "members", "operations", "finance", "inventory", "support", "chat", "profile", "notifications"),
        Role.ADMIN: ("home", "members", "operations", "finance", "inventory", "audit", "support", "chat", "profile", "notifications"),
    }

    @classmethod
    async def build_bootstrap(
        cls,
        *,
        current_user: User,
        db: AsyncSession,
    ) -> schemas.MobileBootstrap:
        enriched_user = await cls.build_user_response(current_user=current_user, db=db)
        subscription = await cls.get_subscription_snapshot(current_user=current_user, db=db)

        return schemas.MobileBootstrap(
            user=enriched_user,
            role=current_user.role,
            subscription=subscription,
            gym=schemas.GymBranding(
                gym_name=settings.GYM_NAME or settings.PROJECT_NAME,
                logo_url=settings.GYM_LOGO_URL,
                primary_color=settings.GYM_PRIMARY_COLOR,
                secondary_color=settings.GYM_SECONDARY_COLOR,
                support_email=settings.GYM_SUPPORT_EMAIL,
                support_phone=settings.GYM_SUPPORT_PHONE,
            ),
            capabilities=list(cls._values_for_role(cls._ROLE_CAPABILITIES, current_user.role)),
            enabled_modules=list(cls._values_for_role(cls._ROLE_MODULES, current_user.role)),
            notification_settings=await cls.get_notification_preferences(current_user=current_user, db=db),
        )

    @classmethod
    async def build_user_response(
        cls,
        *,
        current_user: User,
        db: AsyncSession,
    ) -> schemas.UserResponse:
        state = await cls._get_subscription_state(current_user=current_user, db=db)
        return schemas.UserResponse(
            id=current_user.id,
            email=current_user.email,
            full_name=current_user.full_name,
            is_active=current_user.is_active,
            role=current_user.role,
            profile_picture_url=current_user.profile_picture_url,
            phone_number=current_user.phone_number,
            date_of_birth=current_user.date_of_birth,
            emergency_contact=current_user.emergency_contact,
            bio=current_user.bio,
            subscription_status=state.subscription_status,
            subscription_end_date=state.subscription_end_date,
            subscription_plan_name=state.subscription_plan_name,
            is_subscription_blocked=state.is_subscription_blocked,
            block_reason=state.block_reason,
        )

    @classmethod
    async def get_subscription_snapshot(
        cls,
        *,
        current_user: User,
        db: AsyncSession,
    ) -> schemas.SubscriptionSnapshot:
        state = await cls._get_subscription_state(current_user=current_user, db=db)
        return schemas.SubscriptionSnapshot(
            status=state.subscription_status,
            end_date=state.subscription_end_date,
            plan_name=state.subscription_plan_name,
            is_blocked=state.is_subscription_blocked,
            block_reason=state.block_reason,
        )

    @classmethod
    async def get_notification_preferences(
        cls,
        *,
        current_user: User,
        db: AsyncSession,
    ) -> schemas.NotificationPreference:
        pref = await db.get(MobileNotificationPreference, current_user.id)
        if pref is None:
            return schemas.NotificationPreference()
        return schemas.NotificationPreference(
            push_enabled=pref.push_enabled,
            chat_enabled=pref.chat_enabled,
            support_enabled=pref.support_enabled,
            billing_enabled=pref.billing_enabled,
            announcements_enabled=pref.announcements_enabled,
        )

    @staticmethod
    async def _get_subscription_state(
        *,
        current_user: User,
        db: AsyncSession,
    ) -> SubscriptionAccessState:
        if current_user.role == Role.CUSTOMER:
            return await SubscriptionStatusService.get_user_subscription_state(current_user.id, db)

        return SubscriptionAccessState(
            subscription_status="ACTIVE",
            subscription_end_date=None,
            subscription_plan_name=None,
            is_subscription_blocked=False,
            block_reason=None,
        )

    @staticmethod
    def _values_for_role(mapping: dict[Role, tuple[T, ...]], role: Role) -> Iterable[T]:
        return mapping.get(role, ())
