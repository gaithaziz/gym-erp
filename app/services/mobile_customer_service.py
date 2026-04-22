from __future__ import annotations

from contextlib import asynccontextmanager
import json
import uuid
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import set_rls_context
from app.models.access import AccessLog
from app.models.chat import ChatMessage, ChatReadReceipt, ChatThread
from app.models.finance import Transaction
from app.models.fitness import BiometricLog, DietPlan, WorkoutPlan
from app.models.enums import Role
from app.models.support import SupportTicket, TicketStatus
from app.models.user import User
from app.models.notification import MobileNotificationPreference, PushDeliveryLog, WhatsAppDeliveryLog
from app.models.access import RenewalRequestStatus, Subscription, SubscriptionRenewalRequest
from app.models.workout_log import WorkoutSession, WorkoutSessionEntry
from app.models.classes import ClassReservation, ClassReservationStatus, ClassSession, ClassTemplate
from app.models.workout_log import DietFeedback, GymFeedback, WorkoutLog
from app.services.mobile_bootstrap_service import MobileBootstrapService


def _parse_set_details(value: str | None) -> list[dict]:
    if not value:
        return []
    try:
        parsed = json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return []
    return parsed if isinstance(parsed, list) else []


def _entry_volume(entry: WorkoutSessionEntry) -> float:
    set_details = _parse_set_details(entry.set_details)
    if set_details:
        total = 0.0
        for row in set_details:
            if not isinstance(row, dict):
                continue
            try:
                reps = float(row.get("reps", 0) or 0)
                weight = float(row.get("weightKg", 0) or 0)
            except (TypeError, ValueError):
                continue
            total += max(reps, 0.0) * max(weight, 0.0)
        if total > 0:
            return total
    if entry.skipped:
        return 0.0
    sets_completed = max(float(entry.sets_completed or 0), 1.0)
    reps_completed = max(float(entry.reps_completed or 0), 0.0)
    weight_kg = max(float(entry.weight_kg or 0), 0.0)
    return sets_completed * reps_completed * weight_kg


def _session_volume(session: WorkoutSession) -> float:
    return sum(_entry_volume(entry) for entry in sorted(session.entries or [], key=lambda item: item.order))


def _parse_progress_date_range(date_from: str | None, date_to: str | None) -> tuple[datetime | None, datetime | None]:
    start = datetime.combine(date.fromisoformat(date_from), time.min) if date_from else None
    end = None
    if date_to:
        end = datetime.combine(date.fromisoformat(date_to), time.min) + timedelta(days=1)
    return start, end


class MobileCustomerService:
    @staticmethod
    def _snapshot_rls_context(db: AsyncSession) -> tuple[object, object, object, object]:
        return (
            db.info.get("rls_user_id", ""),
            db.info.get("rls_user_role", "ANONYMOUS"),
            db.info.get("rls_gym_id", ""),
            db.info.get("rls_branch_id", ""),
        )

    @staticmethod
    async def _restore_rls_context(db: AsyncSession, snapshot: tuple[object, object, object, object]) -> None:
        user_id, role, gym_id, branch_id = snapshot
        await set_rls_context(
            db,
            user_id=user_id,
            role=role,
            gym_id=gym_id,
            branch_id=branch_id,
        )

    @staticmethod
    @asynccontextmanager
    async def _customer_tenant_scope(*, current_user: User, db: AsyncSession):
        if current_user.role != Role.CUSTOMER:
            yield
            return
        snapshot = MobileCustomerService._snapshot_rls_context(db)
        await set_rls_context(
            db,
            user_id=str(current_user.id),
            role=Role.ADMIN.value,
            gym_id=str(current_user.gym_id) if current_user.gym_id else snapshot[2],
            branch_id=str(current_user.home_branch_id) if current_user.home_branch_id else snapshot[3],
        )
        try:
            yield
        finally:
            await MobileCustomerService._restore_rls_context(db, snapshot)

    @staticmethod
    async def list_relevant_chat_coaches(*, current_user: User, db: AsyncSession) -> list[dict]:
        async with MobileCustomerService._customer_tenant_scope(current_user=current_user, db=db):
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
        async with MobileCustomerService._customer_tenant_scope(current_user=current_user, db=db):
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

            # Upcoming classes in next 48h
            upcoming_classes = (
                await db.execute(
                    select(ClassSession, ClassTemplate)
                    .join(ClassReservation, ClassReservation.session_id == ClassSession.id)
                    .join(ClassTemplate, ClassTemplate.id == ClassSession.template_id)
                    .where(
                        ClassReservation.member_id == current_user.id,
                        ClassReservation.status == ClassReservationStatus.RESERVED,
                        ClassSession.starts_at >= datetime.utcnow(),
                        ClassSession.starts_at <= datetime.utcnow() + timedelta(days=2),
                    )
                    .order_by(ClassSession.starts_at.asc())
                    .limit(1)
                )
            ).all()

            next_class = None
            if upcoming_classes:
                session, tmpl = upcoming_classes[0]
                coach_name = None
                if session.coach_id:
                    coach = await db.get(User, session.coach_id)
                    coach_name = coach.full_name if coach else None

                next_class = {
                    "id": str(session.id),
                    "name": tmpl.name,
                    "starts_at": session.starts_at.isoformat(),
                    "ends_at": session.ends_at.isoformat(),
                    "coach_name": coach_name,
                }

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
                "next_class": next_class,
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
        async with MobileCustomerService._customer_tenant_scope(current_user=current_user, db=db):
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
        async with MobileCustomerService._customer_tenant_scope(current_user=current_user, db=db):
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
        async with MobileCustomerService._customer_tenant_scope(current_user=current_user, db=db):
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
        async with MobileCustomerService._customer_tenant_scope(current_user=current_user, db=db):
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
        async with MobileCustomerService._customer_tenant_scope(current_user=current_user, db=db):
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
    async def get_progress(*, current_user: User, db: AsyncSession, date_from: str | None = None, date_to: str | None = None) -> dict:
        async with MobileCustomerService._customer_tenant_scope(current_user=current_user, db=db):
            start_date, end_date = _parse_progress_date_range(date_from, date_to)
            biometric_stmt = select(BiometricLog).where(BiometricLog.member_id == current_user.id)
            if start_date is not None:
                biometric_stmt = biometric_stmt.where(BiometricLog.date >= start_date)
            if end_date is not None:
                biometric_stmt = biometric_stmt.where(BiometricLog.date < end_date)
            biometric_logs = (await db.execute(biometric_stmt.order_by(BiometricLog.date.asc()).limit(100))).scalars().all()
            biometric_count_stmt = select(func.count(BiometricLog.id)).where(BiometricLog.member_id == current_user.id)
            if start_date is not None:
                biometric_count_stmt = biometric_count_stmt.where(BiometricLog.date >= start_date)
            if end_date is not None:
                biometric_count_stmt = biometric_count_stmt.where(BiometricLog.date < end_date)
            biometric_count = int((await db.execute(biometric_count_stmt)).scalar() or 0)

            access_stmt = select(AccessLog).where(AccessLog.user_id == current_user.id)
            if start_date is not None:
                access_stmt = access_stmt.where(AccessLog.scan_time >= start_date)
            if end_date is not None:
                access_stmt = access_stmt.where(AccessLog.scan_time < end_date)
            access_logs = (await db.execute(access_stmt.order_by(AccessLog.scan_time.desc()).limit(20))).scalars().all()
            attendance_count_stmt = select(func.count(AccessLog.id)).where(
                AccessLog.user_id == current_user.id,
                AccessLog.status == "GRANTED",
            )
            if start_date is not None:
                attendance_count_stmt = attendance_count_stmt.where(AccessLog.scan_time >= start_date)
            if end_date is not None:
                attendance_count_stmt = attendance_count_stmt.where(AccessLog.scan_time < end_date)
            attendance_count = int((await db.execute(attendance_count_stmt)).scalar() or 0)

            sessions_stmt = select(WorkoutSession).options(selectinload(WorkoutSession.entries)).where(WorkoutSession.member_id == current_user.id)
            if start_date is not None:
                sessions_stmt = sessions_stmt.where(WorkoutSession.performed_at >= start_date)
            if end_date is not None:
                sessions_stmt = sessions_stmt.where(WorkoutSession.performed_at < end_date)
            workout_sessions = (await db.execute(sessions_stmt.order_by(WorkoutSession.performed_at.desc()).limit(10))).scalars().all()
            workout_count_stmt = select(func.count(WorkoutSession.id)).where(WorkoutSession.member_id == current_user.id)
            if start_date is not None:
                workout_count_stmt = workout_count_stmt.where(WorkoutSession.performed_at >= start_date)
            if end_date is not None:
                workout_count_stmt = workout_count_stmt.where(WorkoutSession.performed_at < end_date)
            workout_count = int((await db.execute(workout_count_stmt)).scalar() or 0)

            workout_stats_start = start_date or (datetime.utcnow() - timedelta(days=30))
            workout_stats_end = end_date
            workout_stats_stmt = (
                select(func.date(WorkoutSession.performed_at).label("day"), func.count(WorkoutSession.id).label("count"))
                .where(WorkoutSession.member_id == current_user.id)
                .where(WorkoutSession.performed_at >= workout_stats_start)
            )
            if workout_stats_end is not None:
                workout_stats_stmt = workout_stats_stmt.where(WorkoutSession.performed_at < workout_stats_end)
            workout_stats_rows = (await db.execute(workout_stats_stmt.group_by("day").order_by("day"))).all()

            pr_stmt = (
                select(WorkoutSessionEntry, WorkoutSession, WorkoutPlan.name)
                .join(WorkoutSession, WorkoutSessionEntry.session_id == WorkoutSession.id)
                .join(WorkoutPlan, WorkoutSession.plan_id == WorkoutPlan.id)
                .where(WorkoutSession.member_id == current_user.id, WorkoutSessionEntry.is_pr.is_(True))
            )
            if start_date is not None:
                pr_stmt = pr_stmt.where(WorkoutSession.performed_at >= start_date)
            if end_date is not None:
                pr_stmt = pr_stmt.where(WorkoutSession.performed_at < end_date)
            pr_entries = (await db.execute(pr_stmt.order_by(WorkoutSession.performed_at.desc(), WorkoutSessionEntry.order.asc()).limit(20))).all()

            return {
                "range_summary": {
                    "biometrics": biometric_count,
                    "attendance": attendance_count,
                    "workouts": workout_count,
                },
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
                        "session_volume": round(_session_volume(session), 2),
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
                        "session_volume": round(_session_volume(session), 2),
                        "entry_volume": round(_entry_volume(entry), 2),
                        "performed_at": session.performed_at.isoformat(),
                    }
                    for entry, session, plan_name in pr_entries
                ],
            }

    @staticmethod
    async def get_feedback_history(*, current_user: User, db: AsyncSession, limit: int = 20) -> dict:
        async with MobileCustomerService._customer_tenant_scope(current_user=current_user, db=db):
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
        async with MobileCustomerService._customer_tenant_scope(current_user=current_user, db=db):
            whatsapp_logs = (
                await db.execute(
                    select(WhatsAppDeliveryLog)
                    .where(WhatsAppDeliveryLog.user_id == current_user.id)
                    .order_by(WhatsAppDeliveryLog.created_at.desc())
                    .limit(limit)
                )
            ).scalars().all()
            push_logs = (
                await db.execute(
                    select(PushDeliveryLog)
                    .where(PushDeliveryLog.user_id == current_user.id)
                    .order_by(PushDeliveryLog.created_at.desc())
                    .limit(limit)
                )
            ).scalars().all()
            items = [
                {
                    "id": str(log.id),
                    "title": log.trigger_name if hasattr(log, "trigger_name") else log.event_type.replace("_", " ").title(),
                    "body": log.template_key.replace("_", " ").title(),
                    "event_type": log.event_type,
                    "status": log.status,
                    "created_at": log.created_at.isoformat() if log.created_at else None,
                }
                for log in whatsapp_logs
            ]
            items.extend(
                {
                    "id": str(log.id),
                    "title": log.title,
                    "body": log.body,
                    "event_type": log.event_type,
                    "status": log.status,
                    "created_at": log.created_at.isoformat() if log.created_at else None,
                }
                for log in push_logs
            )
            items.sort(key=lambda item: item["created_at"] or "", reverse=True)
            return items[:limit]

    @staticmethod
    async def get_notification_preferences(*, current_user: User, db: AsyncSession) -> dict:
        async with MobileCustomerService._customer_tenant_scope(current_user=current_user, db=db):
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
        async with MobileCustomerService._customer_tenant_scope(current_user=current_user, db=db):
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
