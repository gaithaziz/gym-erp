from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.access import AccessLog
from app.models.chat import ChatMessage, ChatReadReceipt, ChatThread
from app.models.finance import Transaction
from app.models.fitness import BiometricLog, DietPlan, WorkoutPlan
from app.models.enums import Role
from app.models.support import SupportTicket, TicketStatus
from app.models.user import User
from app.models.notification import WhatsAppDeliveryLog
from app.models.notification import MobileNotificationPreference
from app.models.access import RenewalRequestStatus, Subscription, SubscriptionRenewalRequest
from app.models.workout_log import WorkoutSession, WorkoutSessionEntry
from app.models.workout_log import DietFeedback, GymFeedback, WorkoutLog
from app.services.mobile_bootstrap_service import MobileBootstrapService


class MobileCustomerService:
    @staticmethod
    async def list_relevant_chat_coaches(*, current_user: User, db: AsyncSession) -> list[dict]:
        coach_ids: set[uuid.UUID] = set()

        workout_creator_ids = (
            await db.execute(
                select(WorkoutPlan.creator_id).where(
                    WorkoutPlan.member_id == current_user.id,
                    WorkoutPlan.status != "ARCHIVED",
                )
            )
        ).scalars().all()
        coach_ids.update(workout_creator_ids)

        diet_creator_ids = (
            await db.execute(
                select(DietPlan.creator_id).where(
                    DietPlan.member_id == current_user.id,
                    DietPlan.status != "ARCHIVED",
                )
            )
        ).scalars().all()
        coach_ids.update(diet_creator_ids)

        thread_coach_ids = (
            await db.execute(select(ChatThread.coach_id).where(ChatThread.customer_id == current_user.id))
        ).scalars().all()
        coach_ids.update(thread_coach_ids)

        feedback_coach_ids = (
            await db.execute(
                select(DietFeedback.coach_id).where(
                    DietFeedback.member_id == current_user.id,
                    DietFeedback.coach_id.is_not(None),
                )
            )
        ).scalars().all()
        coach_ids.update([coach_id for coach_id in feedback_coach_ids if coach_id is not None])

        if not coach_ids:
            coaches = (
                await db.execute(
                    select(User).where(User.role == Role.COACH, User.is_active.is_(True)).order_by(User.full_name.asc())
                )
            ).scalars().all()
        else:
            coaches = (
                await db.execute(
                    select(User)
                    .where(User.id.in_(coach_ids), User.is_active.is_(True))
                    .order_by(User.full_name.asc())
                )
            ).scalars().all()

        return [
            {
                "id": str(coach.id),
                "full_name": coach.full_name,
                "email": coach.email,
                "role": coach.role.value if hasattr(coach.role, "value") else str(coach.role),
                "profile_picture_url": coach.profile_picture_url,
            }
            for coach in coaches
        ]

    @staticmethod
    async def get_home_summary(*, current_user: User, db: AsyncSession) -> dict:
        subscription = await MobileBootstrapService.get_subscription_snapshot(current_user=current_user, db=db)

        active_workout_plans = int(
            (
                await db.execute(
                    select(func.count(WorkoutPlan.id)).where(
                        WorkoutPlan.member_id == current_user.id,
                        WorkoutPlan.status != "ARCHIVED",
                    )
                )
            ).scalar()
            or 0
        )
        active_diet_plans = int(
            (
                await db.execute(
                    select(func.count(DietPlan.id)).where(
                        DietPlan.member_id == current_user.id,
                        DietPlan.status != "ARCHIVED",
                    )
                )
            ).scalar()
            or 0
        )
        open_support_tickets = int(
            (
                await db.execute(
                    select(func.count(SupportTicket.id)).where(
                        SupportTicket.customer_id == current_user.id,
                        SupportTicket.status.in_([TicketStatus.OPEN, TicketStatus.IN_PROGRESS]),
                    )
                )
            ).scalar()
            or 0
        )
        unread_chat_messages = await MobileCustomerService.get_unread_chat_count(current_user_id=current_user.id, db=db)

        thirty_days_ago = datetime.utcnow() - timedelta(days=30)
        recent_check_ins = int(
            (
                await db.execute(
                    select(func.count(AccessLog.id)).where(
                        AccessLog.user_id == current_user.id,
                        AccessLog.status == "GRANTED",
                        AccessLog.scan_time >= thirty_days_ago,
                    )
                )
            ).scalar()
            or 0
        )

        latest_biometric = (
            await db.execute(
                select(BiometricLog)
                .where(BiometricLog.member_id == current_user.id)
                .order_by(BiometricLog.date.desc())
                .limit(1)
            )
        ).scalar_one_or_none()

        recent_receipts = await MobileCustomerService.list_receipts(current_user=current_user, db=db, limit=3)

        return {
            "subscription": subscription.model_dump(mode="json"),
            "quick_stats": {
                "active_workout_plans": active_workout_plans,
                "active_diet_plans": active_diet_plans,
                "recent_check_ins": recent_check_ins,
                "open_support_tickets": open_support_tickets,
                "unread_chat_messages": unread_chat_messages,
            },
            "latest_biometric": MobileCustomerService._serialize_biometric(latest_biometric) if latest_biometric else None,
            "recent_receipts": recent_receipts,
        }

    @staticmethod
    async def get_unread_chat_count(*, current_user_id: uuid.UUID, db: AsyncSession) -> int:
        unread_stmt = (
            select(func.count(ChatMessage.id))
            .select_from(ChatMessage)
            .join(ChatThread, ChatMessage.thread_id == ChatThread.id)
            .outerjoin(
                ChatReadReceipt,
                and_(
                    ChatReadReceipt.thread_id == ChatThread.id,
                    ChatReadReceipt.user_id == current_user_id,
                ),
            )
            .where(ChatThread.customer_id == current_user_id)
            .where(ChatMessage.sender_id != current_user_id)
            .where(
                or_(
                    ChatReadReceipt.last_read_at.is_(None),
                    ChatMessage.created_at > ChatReadReceipt.last_read_at,
                )
            )
        )
        return int((await db.execute(unread_stmt)).scalar() or 0)

    @staticmethod
    async def list_receipts(*, current_user: User, db: AsyncSession, limit: int = 20) -> list[dict]:
        stmt = (
            select(Transaction)
            .where(Transaction.user_id == current_user.id)
            .order_by(Transaction.date.desc())
            .limit(limit)
        )
        transactions = (await db.execute(stmt)).scalars().all()
        return [MobileCustomerService._serialize_receipt(tx) for tx in transactions]

    @staticmethod
    async def get_receipt_detail(*, current_user: User, transaction_id: uuid.UUID, db: AsyncSession) -> dict:
        transaction = (
            await db.execute(
                select(Transaction).where(
                    Transaction.id == transaction_id,
                    Transaction.user_id == current_user.id,
                )
            )
        ).scalar_one_or_none()
        if transaction is None:
            raise ValueError("Receipt not found")

        detail = MobileCustomerService._serialize_receipt(transaction)
        detail["receipt_url"] = f"/api/v1/finance/transactions/{transaction.id}/receipt"
        detail["receipt_print_url"] = f"/api/v1/finance/transactions/{transaction.id}/receipt/print"
        detail["receipt_export_url"] = f"/api/v1/finance/transactions/{transaction.id}/receipt/export"
        detail["receipt_export_pdf_url"] = f"/api/v1/finance/transactions/{transaction.id}/receipt/export-pdf"
        return detail

    @staticmethod
    async def get_billing_overview(*, current_user: User, db: AsyncSession) -> dict:
        subscription = await MobileBootstrapService.get_subscription_snapshot(current_user=current_user, db=db)
        receipts = await MobileCustomerService.list_receipts(current_user=current_user, db=db)
        renewal_requests = await MobileCustomerService.list_renewal_requests(current_user=current_user, db=db)

        offers = [
            {
                "code": "MONTHLY_30",
                "title": "Monthly Membership",
                "description": "30-day gym membership renewal",
                "duration_days": 30,
                "amount": None,
                "currency": None,
            },
            {
                "code": "QUARTERLY_90",
                "title": "Quarterly Membership",
                "description": "90-day gym membership renewal",
                "duration_days": 90,
                "amount": None,
                "currency": None,
            },
        ]

        payable_items: list[dict] = []
        if subscription.is_blocked:
            payable_items.append(
                {
                    "code": "SUBSCRIPTION_RENEWAL",
                    "title": "Subscription renewal required",
                    "description": f"Current subscription status: {subscription.status}",
                    "amount_due": None,
                    "currency": None,
                }
            )
        elif subscription.end_date:
            end_date = subscription.end_date
            if isinstance(end_date, str):
                end_date_dt = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
            else:
                end_date_dt = end_date
            if end_date_dt.tzinfo is None:
                end_date_dt = end_date_dt.replace(tzinfo=timezone.utc)
            if end_date_dt <= datetime.now(timezone.utc) + timedelta(days=7):
                payable_items.append(
                    {
                        "code": "UPCOMING_RENEWAL",
                        "title": "Upcoming renewal",
                        "description": f"Subscription ends on {end_date_dt.date().isoformat()}",
                        "amount_due": None,
                        "currency": None,
                    }
                )

        return {
            "subscription": subscription.model_dump(mode="json"),
            "renewal_offers": offers,
            "renewal_requests": renewal_requests,
            "payable_items": payable_items,
            "receipts": receipts,
            "payment_policy": {
                "provider": "external_gym_payment",
                "store_billing_used": False,
                "notes": "Submit a renewal request in the app, pay the gym directly, then wait for staff approval.",
            },
        }

    @staticmethod
    async def list_renewal_requests(*, current_user: User, db: AsyncSession, limit: int = 20) -> list[dict]:
        requests = (
            await db.execute(
                select(SubscriptionRenewalRequest)
                .where(SubscriptionRenewalRequest.user_id == current_user.id)
                .order_by(SubscriptionRenewalRequest.requested_at.desc())
                .limit(limit)
            )
        ).scalars().all()
        return [MobileCustomerService._serialize_renewal_request(item) for item in requests]

    @staticmethod
    async def create_renewal_request(
        *,
        current_user: User,
        db: AsyncSession,
        offer_code: str,
        duration_days: int,
        customer_note: str | None,
    ) -> dict:
        offers = {
            "MONTHLY_30": {"plan_name": "Monthly Membership", "duration_days": 30},
            "QUARTERLY_90": {"plan_name": "Quarterly Membership", "duration_days": 90},
        }
        offer = offers.get(offer_code)
        if offer is None:
            raise ValueError("Invalid renewal offer")
        if offer["duration_days"] != duration_days:
            raise ValueError("Duration does not match the selected renewal offer")

        existing_pending = (
            await db.execute(
                select(SubscriptionRenewalRequest).where(
                    SubscriptionRenewalRequest.user_id == current_user.id,
                    SubscriptionRenewalRequest.status == RenewalRequestStatus.PENDING,
                )
            )
        ).scalar_one_or_none()
        if existing_pending is not None:
            raise ValueError("A renewal request is already pending gym approval")

        renewal_request = SubscriptionRenewalRequest(
            user_id=current_user.id,
            offer_code=offer_code,
            plan_name=offer["plan_name"],
            duration_days=duration_days,
            customer_note=customer_note,
        )
        db.add(renewal_request)
        await db.commit()
        await db.refresh(renewal_request)
        return MobileCustomerService._serialize_renewal_request(renewal_request)

    @staticmethod
    async def get_plans(*, current_user: User, db: AsyncSession) -> dict:
        workout_plans = (
            await db.execute(
                select(WorkoutPlan)
                .where(
                    WorkoutPlan.member_id == current_user.id,
                    WorkoutPlan.status != "ARCHIVED",
                )
                .order_by(WorkoutPlan.published_at.desc(), WorkoutPlan.name.asc())
            )
        ).scalars().all()
        diet_plans = (
            await db.execute(
                select(DietPlan)
                .where(
                    DietPlan.member_id == current_user.id,
                    DietPlan.status != "ARCHIVED",
                )
                .order_by(DietPlan.published_at.desc(), DietPlan.name.asc())
            )
        ).scalars().all()

        return {
            "workout_plans": [
                {
                    "id": str(plan.id),
                    "name": plan.name,
                    "description": plan.description,
                    "status": plan.status,
                    "version": plan.version,
                    "expected_sessions_per_30d": plan.expected_sessions_per_30d,
                    "published_at": plan.published_at.isoformat() if plan.published_at else None,
                }
                for plan in workout_plans
            ],
            "diet_plans": [
                {
                    "id": str(plan.id),
                    "name": plan.name,
                    "description": plan.description,
                    "status": plan.status,
                    "version": plan.version,
                    "published_at": plan.published_at.isoformat() if plan.published_at else None,
                }
                for plan in diet_plans
            ],
        }

    @staticmethod
    async def get_progress(*, current_user: User, db: AsyncSession) -> dict:
        biometric_logs = (
            await db.execute(
                select(BiometricLog)
                .where(BiometricLog.member_id == current_user.id)
                .order_by(BiometricLog.date.asc())
                .limit(100)
            )
        ).scalars().all()
        access_logs = (
            await db.execute(
                select(AccessLog)
                .where(AccessLog.user_id == current_user.id)
                .order_by(AccessLog.scan_time.desc())
                .limit(20)
            )
        ).scalars().all()
        workout_sessions = (
            await db.execute(
                select(WorkoutSession)
                .where(WorkoutSession.member_id == current_user.id)
                .order_by(WorkoutSession.performed_at.desc())
                .limit(10)
            )
        ).scalars().all()

        thirty_days_ago = datetime.utcnow() - timedelta(days=30)
        workout_stats_rows = (
            await db.execute(
                select(func.date(WorkoutSession.performed_at).label("day"), func.count(WorkoutSession.id).label("count"))
                .where(
                    WorkoutSession.member_id == current_user.id,
                    WorkoutSession.performed_at >= thirty_days_ago,
                )
                .group_by("day")
                .order_by("day")
            )
        ).all()
        pr_entries = (
            await db.execute(
                select(WorkoutSessionEntry, WorkoutSession, WorkoutPlan.name)
                .join(WorkoutSession, WorkoutSessionEntry.session_id == WorkoutSession.id)
                .join(WorkoutPlan, WorkoutSession.plan_id == WorkoutPlan.id)
                .where(WorkoutSession.member_id == current_user.id, WorkoutSessionEntry.is_pr.is_(True))
                .order_by(WorkoutSession.performed_at.desc(), WorkoutSessionEntry.order.asc())
                .limit(20)
            )
        ).all()

        return {
            "biometrics": [MobileCustomerService._serialize_biometric(log) for log in biometric_logs],
            "attendance_history": [
                {
                    "id": str(log.id),
                    "scan_time": log.scan_time.isoformat(),
                    "status": log.status,
                    "reason": log.reason,
                    "kiosk_id": log.kiosk_id,
                }
                for log in access_logs
            ],
            "recent_workout_sessions": [
                {
                    "id": str(session.id),
                    "plan_id": str(session.plan_id),
                    "performed_at": session.performed_at.isoformat(),
                    "duration_minutes": session.duration_minutes,
                    "notes": session.notes,
                }
                for session in workout_sessions
            ],
            "workout_stats": [
                {"date": str(row.day), "workouts": int(row.count or 0)}
                for row in workout_stats_rows
            ],
            "personal_records": [
                {
                    "id": str(entry.id),
                    "session_id": str(session.id),
                    "plan_id": str(session.plan_id),
                    "plan_name": plan_name,
                    "exercise_name": entry.exercise_name,
                    "pr_type": entry.pr_type,
                    "pr_value": entry.pr_value,
                    "pr_notes": entry.pr_notes,
                    "weight_kg": entry.weight_kg,
                    "sets_completed": entry.sets_completed,
                    "reps_completed": entry.reps_completed,
                    "performed_at": session.performed_at.isoformat(),
                }
                for entry, session, plan_name in pr_entries
            ],
        }

    @staticmethod
    async def get_feedback_history(*, current_user: User, db: AsyncSession, limit: int = 20) -> dict:
        workout_logs = (
            await db.execute(
                select(WorkoutLog, WorkoutPlan.name)
                .join(WorkoutPlan, WorkoutLog.plan_id == WorkoutPlan.id)
                .where(WorkoutLog.member_id == current_user.id)
                .order_by(WorkoutLog.date.desc())
                .limit(limit)
            )
        ).all()
        diet_feedback = (
            await db.execute(
                select(DietFeedback, DietPlan.name)
                .join(DietPlan, DietFeedback.diet_plan_id == DietPlan.id)
                .where(DietFeedback.member_id == current_user.id)
                .order_by(DietFeedback.created_at.desc())
                .limit(limit)
            )
        ).all()
        gym_feedback = (
            await db.execute(
                select(GymFeedback)
                .where(GymFeedback.member_id == current_user.id)
                .order_by(GymFeedback.created_at.desc())
                .limit(limit)
            )
        ).scalars().all()

        return {
            "workout_feedback": [
                {
                    "id": str(log.id),
                    "plan_id": str(log.plan_id),
                    "plan_name": plan_name,
                    "date": log.date.isoformat(),
                    "completed": log.completed,
                    "difficulty_rating": log.difficulty_rating,
                    "comment": log.comment,
                }
                for log, plan_name in workout_logs
            ],
            "diet_feedback": [
                {
                    "id": str(feedback.id),
                    "diet_plan_id": str(feedback.diet_plan_id),
                    "diet_plan_name": diet_name,
                    "coach_id": str(feedback.coach_id) if feedback.coach_id else None,
                    "rating": feedback.rating,
                    "comment": feedback.comment,
                    "created_at": feedback.created_at.isoformat(),
                }
                for feedback, diet_name in diet_feedback
            ],
            "gym_feedback": [
                {
                    "id": str(feedback.id),
                    "category": feedback.category,
                    "rating": feedback.rating,
                    "comment": feedback.comment,
                    "created_at": feedback.created_at.isoformat(),
                }
                for feedback in gym_feedback
            ],
        }

    @staticmethod
    async def get_notifications(*, current_user: User, db: AsyncSession, limit: int = 20) -> list[dict]:
        logs = (
            await db.execute(
                select(WhatsAppDeliveryLog)
                .where(WhatsAppDeliveryLog.user_id == current_user.id)
                .order_by(WhatsAppDeliveryLog.created_at.desc())
                .limit(limit)
            )
        ).scalars().all()
        return [
            {
                "id": str(log.id),
                "title": log.trigger_name if hasattr(log, "trigger_name") else log.event_type.replace("_", " ").title(),
                "body": log.template_key.replace("_", " ").title(),
                "event_type": log.event_type,
                "status": log.status,
                "created_at": log.created_at.isoformat() if log.created_at else None,
            }
            for log in logs
        ]

    @staticmethod
    async def get_notification_preferences(*, current_user: User, db: AsyncSession) -> dict:
        prefs = await MobileBootstrapService.get_notification_preferences(current_user=current_user, db=db)
        return prefs.model_dump()

    @staticmethod
    async def update_notification_preferences(
        *,
        current_user: User,
        db: AsyncSession,
        push_enabled: bool,
        chat_enabled: bool,
        support_enabled: bool,
        billing_enabled: bool,
        announcements_enabled: bool,
    ) -> dict:
        pref = await db.get(MobileNotificationPreference, current_user.id)
        if pref is None:
            pref = MobileNotificationPreference(user_id=current_user.id)
            db.add(pref)
        pref.push_enabled = push_enabled
        pref.chat_enabled = chat_enabled
        pref.support_enabled = support_enabled
        pref.billing_enabled = billing_enabled
        pref.announcements_enabled = announcements_enabled
        pref.updated_at = datetime.utcnow()
        await db.commit()
        return {
            "push_enabled": pref.push_enabled,
            "chat_enabled": pref.chat_enabled,
            "support_enabled": pref.support_enabled,
            "billing_enabled": pref.billing_enabled,
            "announcements_enabled": pref.announcements_enabled,
        }

    @staticmethod
    def _serialize_receipt(transaction: Transaction) -> dict:
        amount = transaction.amount
        if isinstance(amount, Decimal):
            amount_value = float(amount)
        else:
            amount_value = float(amount)
        return {
            "id": str(transaction.id),
            "receipt_no": str(transaction.id).split("-")[0].upper(),
            "date": transaction.date.isoformat(),
            "amount": amount_value,
            "type": transaction.type.value,
            "category": transaction.category.value,
            "payment_method": transaction.payment_method.value,
            "description": transaction.description or "Gym Service/Item",
            "gym_name": settings.GYM_NAME or settings.PROJECT_NAME,
        }

    @staticmethod
    def _serialize_biometric(log: BiometricLog) -> dict:
        return {
            "id": str(log.id),
            "date": log.date.isoformat(),
            "weight_kg": log.weight_kg,
            "height_cm": log.height_cm,
            "body_fat_pct": log.body_fat_pct,
            "muscle_mass_kg": log.muscle_mass_kg,
        }

    @staticmethod
    def _serialize_renewal_request(item: SubscriptionRenewalRequest) -> dict:
        return {
            "id": str(item.id),
            "offer_code": item.offer_code,
            "plan_name": item.plan_name,
            "duration_days": item.duration_days,
            "status": item.status.value,
            "customer_note": item.customer_note,
            "requested_at": item.requested_at.isoformat(),
            "reviewed_at": item.reviewed_at.isoformat() if item.reviewed_at else None,
            "reviewer_note": item.reviewer_note,
            "payment_method": "CASH",
            "payment_status": "AWAITING_GYM_APPROVAL" if item.status == RenewalRequestStatus.PENDING else item.status.value,
        }
