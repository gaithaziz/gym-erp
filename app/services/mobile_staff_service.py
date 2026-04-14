from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
import uuid

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import security
from app.models.access import AccessLog, AttendanceLog, Subscription
from app.models.enums import Role
from app.models.finance import Transaction, TransactionCategory, TransactionType
from app.models.fitness import BiometricLog, DietPlan, WorkoutPlan
from app.models.hr import LeaveRequest
from app.models.inventory import Product
from app.models.lost_found import LostFoundItem, LostFoundStatus
from app.models.notification import MobileNotificationPreference
from app.models.support import SupportTicket, TicketStatus
from app.models.user import User
from app.models.workout_log import DietFeedback, GymFeedback, WorkoutLog, WorkoutSession
from app.services.audit_service import AuditService
from app.services.mobile_bootstrap_service import MobileBootstrapService


def _as_float(value: Decimal | float | int | None) -> float:
    if value is None:
        return 0.0
    return float(value)


def _start_of_today() -> datetime:
    now = datetime.utcnow()
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


class MobileStaffService:
    @staticmethod
    async def list_members(*, current_user: User, db: AsyncSession, query: str | None = None) -> list[dict]:
        stmt = select(User).where(User.role == Role.CUSTOMER)

        if query:
            search = f"%{query.strip()}%"
            stmt = stmt.where(
                or_(
                    User.full_name.ilike(search),
                    User.email.ilike(search),
                    User.phone_number.ilike(search),
                )
            )

        result = await db.execute(stmt.order_by(User.full_name.asc()).limit(50))
        members = result.scalars().all()
        return [await MobileStaffService._serialize_member_summary(member=member, db=db) for member in members]

    @staticmethod
    async def get_member_detail(*, current_user: User, member_id: uuid.UUID, db: AsyncSession) -> dict:
        member = await db.get(User, member_id)
        if not member or member.role != Role.CUSTOMER:
            raise ValueError("Member not found")

        user_payload = await MobileBootstrapService.build_user_response(current_user=member, db=db)

        workout_stmt = select(WorkoutPlan).where(
            WorkoutPlan.member_id == member.id,
            WorkoutPlan.status != "ARCHIVED",
        )
        diet_stmt = select(DietPlan).where(
            DietPlan.member_id == member.id,
            DietPlan.status != "ARCHIVED",
        )

        workout_plans = (await db.execute(workout_stmt.order_by(WorkoutPlan.published_at.desc().nullslast(), WorkoutPlan.name.asc()))).scalars().all()
        diet_plans = (await db.execute(diet_stmt.order_by(DietPlan.published_at.desc().nullslast(), DietPlan.name.asc()))).scalars().all()

        latest_biometric = (
            await db.execute(
                select(BiometricLog)
                .where(BiometricLog.member_id == member.id)
                .order_by(BiometricLog.date.desc())
                .limit(1)
            )
        ).scalar_one_or_none()

        recent_attendance = (
            await db.execute(
                select(AccessLog)
                .where(AccessLog.user_id == member.id)
                .order_by(AccessLog.scan_time.desc())
                .limit(10)
            )
        ).scalars().all()

        biometrics = (
            await db.execute(
                select(BiometricLog)
                .where(BiometricLog.member_id == member.id)
                .order_by(BiometricLog.date.desc())
                .limit(8)
            )
        ).scalars().all()

        workout_sessions_stmt = (
            select(WorkoutSession, WorkoutPlan.name)
            .join(WorkoutPlan, WorkoutPlan.id == WorkoutSession.plan_id)
            .where(WorkoutSession.member_id == member.id)
            .order_by(WorkoutSession.performed_at.desc())
            .limit(8)
        )
        workout_sessions = (await db.execute(workout_sessions_stmt)).all()

        workout_feedback_stmt = (
            select(WorkoutLog, WorkoutPlan.name)
            .join(WorkoutPlan, WorkoutPlan.id == WorkoutLog.plan_id)
            .where(
                WorkoutLog.member_id == member.id,
                or_(WorkoutLog.comment.is_not(None), WorkoutLog.difficulty_rating.is_not(None)),
            )
            .order_by(WorkoutLog.date.desc())
            .limit(8)
        )
        workout_feedback_rows = (await db.execute(workout_feedback_stmt)).all()

        diet_feedback_stmt = (
            select(DietFeedback, DietPlan.name)
            .join(DietPlan, DietPlan.id == DietFeedback.diet_plan_id)
            .where(DietFeedback.member_id == member.id)
            .order_by(DietFeedback.created_at.desc())
            .limit(8)
        )
        diet_feedback_rows = (await db.execute(diet_feedback_stmt)).all()

        gym_feedback_rows = (
            await db.execute(
                select(GymFeedback)
                .where(GymFeedback.member_id == member.id)
                .order_by(GymFeedback.created_at.desc())
                .limit(8)
            )
        ).scalars().all()

        return {
            "member": user_payload.model_dump(mode="json"),
            "subscription": await MobileStaffService._subscription_snapshot(member_id=member.id, db=db),
            "active_workout_plans": [
                {
                    "id": str(plan.id),
                    "name": plan.name,
                    "status": plan.status,
                    "creator_id": str(plan.creator_id),
                    "published_at": plan.published_at.isoformat() if plan.published_at else None,
                }
                for plan in workout_plans
            ],
            "active_diet_plans": [
                {
                    "id": str(plan.id),
                    "name": plan.name,
                    "status": plan.status,
                    "creator_id": str(plan.creator_id),
                    "published_at": plan.published_at.isoformat() if plan.published_at else None,
                }
                for plan in diet_plans
            ],
            "latest_biometric": (
                {
                    "id": str(latest_biometric.id),
                    "date": latest_biometric.date.isoformat(),
                    "weight_kg": latest_biometric.weight_kg,
                    "height_cm": latest_biometric.height_cm,
                    "body_fat_pct": latest_biometric.body_fat_pct,
                    "muscle_mass_kg": latest_biometric.muscle_mass_kg,
                }
                if latest_biometric
                else None
            ),
            "recent_attendance": [
                {
                    "id": str(item.id),
                    "scan_time": item.scan_time.isoformat(),
                    "status": item.status,
                    "reason": item.reason,
                    "kiosk_id": item.kiosk_id,
                }
                for item in recent_attendance
            ],
            "biometrics": [
                {
                    "id": str(item.id),
                    "date": item.date.isoformat(),
                    "weight_kg": item.weight_kg,
                    "height_cm": item.height_cm,
                    "body_fat_pct": item.body_fat_pct,
                    "muscle_mass_kg": item.muscle_mass_kg,
                }
                for item in biometrics
            ],
            "recent_workout_sessions": [
                {
                    "id": str(session.id),
                    "plan_id": str(session.plan_id),
                    "plan_name": plan_name,
                    "performed_at": session.performed_at.isoformat(),
                    "duration_minutes": session.duration_minutes,
                    "notes": session.notes,
                }
                for session, plan_name in workout_sessions
            ],
            "workout_feedback": [
                {
                    "id": str(feedback.id),
                    "plan_id": str(feedback.plan_id),
                    "plan_name": plan_name,
                    "date": feedback.date.isoformat(),
                    "completed": feedback.completed,
                    "difficulty_rating": feedback.difficulty_rating,
                    "comment": feedback.comment,
                }
                for feedback, plan_name in workout_feedback_rows
            ],
            "diet_feedback": [
                {
                    "id": str(feedback.id),
                    "member_id": str(feedback.member_id),
                    "member_name": member.full_name,
                    "diet_plan_id": str(feedback.diet_plan_id),
                    "diet_plan_name": plan_name,
                    "rating": feedback.rating,
                    "comment": feedback.comment,
                    "created_at": feedback.created_at.isoformat(),
                }
                for feedback, plan_name in diet_feedback_rows
            ],
            "gym_feedback": [
                {
                    "id": str(feedback.id),
                    "member_id": str(feedback.member_id),
                    "member_name": member.full_name,
                    "category": feedback.category,
                    "rating": feedback.rating,
                    "comment": feedback.comment,
                    "created_at": feedback.created_at.isoformat(),
                }
                for feedback in gym_feedback_rows
            ],
        }

    @staticmethod
    async def lookup_members(*, current_user: User, db: AsyncSession, query: str) -> dict:
        items = await MobileStaffService.list_members(current_user=current_user, db=db, query=query)
        return {"query": query, "items": items}

    @staticmethod
    async def register_member(
        *,
        current_user: User,
        db: AsyncSession,
        email: str,
        full_name: str,
        password: str,
        phone_number: str | None = None,
    ) -> dict:
        if current_user.role not in {Role.ADMIN, Role.MANAGER, Role.RECEPTION, Role.FRONT_DESK}:
            raise ValueError("Not allowed")

        existing = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if existing:
            raise ValueError("The user with this email already exists in the system.")

        member = User(
            email=email,
            hashed_password=security.get_password_hash(password),
            full_name=full_name,
            phone_number=phone_number,
            role=Role.CUSTOMER,
            is_active=True,
        )
        db.add(member)
        await db.flush()
        await AuditService.log_action(
            db=db,
            user_id=current_user.id,
            action="MOBILE_REGISTER_MEMBER",
            target_id=str(member.id),
            details=f"Registered mobile customer {member.email}",
        )
        await db.commit()
        await db.refresh(member)
        return await MobileStaffService._serialize_member_summary(member=member, db=db)

    @staticmethod
    async def process_check_in(
        *,
        current_user: User,
        db: AsyncSession,
        member_id: uuid.UUID,
        kiosk_id: str,
    ) -> dict:
        from app.services.access_service import AccessService

        if current_user.role not in {Role.ADMIN, Role.MANAGER, Role.COACH, Role.RECEPTION, Role.FRONT_DESK}:
            raise ValueError("Not allowed")

        member = await db.get(User, member_id)
        if not member or member.role != Role.CUSTOMER:
            raise ValueError("Member not found")

        result = await AccessService.process_session_check_in(member.id, kiosk_id, db)
        return {
            "member_id": str(member.id),
            "member_name": member.full_name,
            "status": result.get("status"),
            "reason": result.get("reason"),
            "kiosk_id": result.get("kiosk_id"),
            "scan_time": result.get("scan_time"),
        }

    @staticmethod
    async def get_finance_summary(*, current_user: User, db: AsyncSession) -> dict:
        if current_user.role not in {Role.ADMIN, Role.MANAGER, Role.CASHIER}:
            raise ValueError("Not allowed")

        today = _start_of_today()
        total_sales = (
            await db.execute(
                select(func.sum(Transaction.amount))
                .where(
                    Transaction.category == TransactionCategory.POS_SALE,
                    Transaction.date >= today,
                )
            )
        ).scalar()
        total_count = (
            await db.execute(
                select(func.count(Transaction.id)).where(
                    Transaction.category == TransactionCategory.POS_SALE,
                    Transaction.date >= today,
                )
            )
        ).scalar()
        recent_transactions = await MobileStaffService.get_recent_transactions(current_user=current_user, db=db, limit=5)
        low_stock = (
            await db.execute(
                select(func.count(Product.id)).where(
                    Product.is_active.is_(True),
                    Product.stock_quantity <= Product.low_stock_threshold,
                )
            )
        ).scalar()
        return {
            "today_sales_total": _as_float(total_sales),
            "today_sales_count": int(total_count or 0),
            "low_stock_count": int(low_stock or 0),
            "recent_transactions": recent_transactions,
        }

    @staticmethod
    async def get_recent_transactions(*, current_user: User, db: AsyncSession, limit: int = 20) -> list[dict]:
        if current_user.role not in {Role.ADMIN, Role.MANAGER, Role.CASHIER}:
            raise ValueError("Not allowed")

        stmt = (
            select(Transaction, User.full_name)
            .outerjoin(User, User.id == Transaction.user_id)
            .where(Transaction.category == TransactionCategory.POS_SALE)
            .order_by(Transaction.date.desc())
            .limit(limit)
        )
        rows = (await db.execute(stmt)).all()
        return [
            {
                "id": str(transaction.id),
                "date": transaction.date.isoformat(),
                "amount": _as_float(transaction.amount),
                "category": transaction.category.value if hasattr(transaction.category, "value") else str(transaction.category),
                "payment_method": transaction.payment_method.value if hasattr(transaction.payment_method, "value") else str(transaction.payment_method),
                "description": transaction.description or "POS sale",
                "member_name": member_name,
            }
            for transaction, member_name in rows
        ]

    @staticmethod
    async def get_home_summary(*, current_user: User, db: AsyncSession) -> dict:
        role = current_user.role
        if role == Role.COACH:
            members = await MobileStaffService.list_members(current_user=current_user, db=db)
            workout_total = (
                await db.execute(
                    select(func.count(WorkoutPlan.id)).where(
                        WorkoutPlan.creator_id == current_user.id,
                        WorkoutPlan.member_id.is_not(None),
                        WorkoutPlan.status != "ARCHIVED",
                    )
                )
            ).scalar()
            diet_total = (
                await db.execute(
                    select(func.count(DietPlan.id)).where(
                        DietPlan.creator_id == current_user.id,
                        DietPlan.member_id.is_not(None),
                        DietPlan.status != "ARCHIVED",
                    )
                )
            ).scalar()
            feedback_total = (
                await db.execute(
                    select(func.count(DietFeedback.id)).where(DietFeedback.coach_id == current_user.id)
                )
            ).scalar()
            pending_sessions = (
                await db.execute(
                    select(func.count(WorkoutSession.id))
                    .join(WorkoutPlan, WorkoutPlan.id == WorkoutSession.plan_id)
                    .where(
                        WorkoutPlan.creator_id == current_user.id,
                        WorkoutSession.performed_at >= _start_of_today(),
                    )
                )
            ).scalar()
            return {
                "role": role.value,
                "headline": "Coach control center",
                "stats": {
                    "members": len(members),
                    "active_workout_plans": int(workout_total or 0),
                    "active_diet_plans": int(diet_total or 0),
                    "feedback_items": int(feedback_total or 0),
                    "today_sessions": int(pending_sessions or 0),
                },
                "quick_actions": [
                    {"id": "shift_qr", "label": "Shift QR", "route": "/(tabs)/qr"},
                    {"id": "feedback", "label": "Feedback", "route": "/coach-feedback"},
                    {"id": "leaves", "label": "Leaves", "route": "/leaves"},
                    {"id": "chat", "label": "Chat", "route": "/chat"},
                ],
                "items": members[:6],
            }

        if role in {Role.RECEPTION, Role.FRONT_DESK}:
            members = await MobileStaffService.list_members(current_user=current_user, db=db)
            open_tickets = (
                await db.execute(
                    select(func.count(SupportTicket.id)).where(SupportTicket.status.in_([TicketStatus.OPEN, TicketStatus.IN_PROGRESS]))
                )
            ).scalar()
            open_lost_found = (
                await db.execute(
                    select(func.count(LostFoundItem.id)).where(
                        LostFoundItem.status.in_(
                            [
                                LostFoundStatus.REPORTED,
                                LostFoundStatus.UNDER_REVIEW,
                                LostFoundStatus.READY_FOR_PICKUP,
                            ]
                        )
                    )
                )
            ).scalar()
            recent_scans = (
                await db.execute(
                    select(AccessLog, User.full_name)
                    .join(User, User.id == AccessLog.user_id)
                    .order_by(AccessLog.scan_time.desc())
                    .limit(5)
                )
            ).all()
            return {
                "role": role.value,
                "headline": "Front desk overview",
                "stats": {
                    "members": len(members),
                    "open_support_tickets": int(open_tickets or 0),
                    "open_lost_found": int(open_lost_found or 0),
                    "recent_scans": len(recent_scans),
                },
                "quick_actions": [
                    {"id": "checkin", "label": "Check-in", "route": "/(tabs)/qr"},
                    {"id": "members", "label": "Members", "route": "/(tabs)/members"},
                    {"id": "support", "label": "Support", "route": "/support"},
                ],
                "items": [
                    {
                        "id": str(log.id),
                        "title": full_name or "Member",
                        "subtitle": log.status,
                        "meta": log.scan_time.isoformat(),
                    }
                    for log, full_name in recent_scans
                ],
            }

        if role == Role.CASHIER:
            finance = await MobileStaffService.get_finance_summary(current_user=current_user, db=db)
            return {
                "role": role.value,
                "headline": "Cashier sales desk",
                "stats": {
                    "today_sales_total": finance["today_sales_total"],
                    "today_sales_count": finance["today_sales_count"],
                    "low_stock_count": finance["low_stock_count"],
                },
                "quick_actions": [
                    {"id": "pos", "label": "POS", "route": "/(tabs)/finance"},
                    {"id": "transactions", "label": "Transactions", "route": "/(tabs)/operations"},
                ],
                "items": finance["recent_transactions"],
            }

        attendance_open = (
            await db.execute(
                select(AttendanceLog)
                .where(AttendanceLog.user_id == current_user.id, AttendanceLog.check_out_time.is_(None))
                .order_by(AttendanceLog.check_in_time.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        leave_total = (
            await db.execute(
                select(func.count(LeaveRequest.id)).where(
                    LeaveRequest.user_id == current_user.id,
                    LeaveRequest.start_date >= date.today(),
                )
            )
        ).scalar()
        lost_found_allowed = current_user.role in {Role.EMPLOYEE, Role.ADMIN, Role.MANAGER, Role.RECEPTION, Role.FRONT_DESK}
        return {
            "role": role.value,
            "headline": "Personal operations",
            "stats": {
                "clocked_in": 1 if attendance_open else 0,
                "upcoming_leaves": int(leave_total or 0),
                "lost_found_enabled": 1 if lost_found_allowed else 0,
            },
            "quick_actions": [
                {"id": "qr", "label": "QR", "route": "/(tabs)/qr"},
                {"id": "tasks", "label": "Tasks", "route": "/(tabs)/operations"},
                {"id": "profile", "label": "Profile", "route": "/profile"},
            ],
            "items": [
                {
                    "id": "attendance",
                    "title": "Attendance",
                    "subtitle": "Clocked in" if attendance_open else "Not clocked in",
                    "meta": attendance_open.check_in_time.isoformat() if attendance_open else None,
                }
            ],
        }

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
    async def get_coach_feedback_summary(*, current_user: User, db: AsyncSession) -> dict:
        if current_user.role != Role.COACH:
            raise ValueError("Not allowed")

        workout_rows = (
            await db.execute(
                select(WorkoutLog, WorkoutPlan.name, User.full_name)
                .join(WorkoutPlan, WorkoutPlan.id == WorkoutLog.plan_id)
                .join(User, User.id == WorkoutLog.member_id)
                .where(
                    WorkoutPlan.creator_id == current_user.id,
                    or_(WorkoutLog.comment.is_not(None), WorkoutLog.difficulty_rating.is_not(None)),
                )
                .order_by(WorkoutLog.date.desc())
                .limit(20)
            )
        ).all()
        diet_rows = (
            await db.execute(
                select(DietFeedback, DietPlan.name, User.full_name)
                .join(DietPlan, DietPlan.id == DietFeedback.diet_plan_id)
                .join(User, User.id == DietFeedback.member_id)
                .where(DietPlan.creator_id == current_user.id)
                .order_by(DietFeedback.created_at.desc())
                .limit(20)
            )
        ).all()
        gym_rows = (
            await db.execute(
                select(GymFeedback, User.full_name)
                .join(User, User.id == GymFeedback.member_id)
                .where(
                    GymFeedback.member_id.in_(
                        select(WorkoutPlan.member_id).where(
                            WorkoutPlan.creator_id == current_user.id,
                            WorkoutPlan.member_id.is_not(None),
                        )
                    )
                )
                .order_by(GymFeedback.created_at.desc())
                .limit(20)
            )
        ).all()

        return {
            "stats": {
                "workout_feedback": len(workout_rows),
                "diet_feedback": len(diet_rows),
                "gym_feedback": len(gym_rows),
            },
            "workout_feedback": [
                {
                    "id": str(feedback.id),
                    "member_id": str(feedback.member_id),
                    "member_name": member_name,
                    "plan_id": str(feedback.plan_id),
                    "plan_name": plan_name,
                    "date": feedback.date.isoformat(),
                    "completed": feedback.completed,
                    "difficulty_rating": feedback.difficulty_rating,
                    "comment": feedback.comment,
                }
                for feedback, plan_name, member_name in workout_rows
            ],
            "diet_feedback": [
                {
                    "id": str(feedback.id),
                    "member_id": str(feedback.member_id),
                    "member_name": member_name,
                    "diet_plan_id": str(feedback.diet_plan_id),
                    "diet_plan_name": plan_name,
                    "rating": feedback.rating,
                    "comment": feedback.comment,
                    "created_at": feedback.created_at.isoformat(),
                }
                for feedback, plan_name, member_name in diet_rows
            ],
            "gym_feedback": [
                {
                    "id": str(feedback.id),
                    "member_id": str(feedback.member_id),
                    "member_name": member_name,
                    "category": feedback.category,
                    "rating": feedback.rating,
                    "comment": feedback.comment,
                    "created_at": feedback.created_at.isoformat(),
                }
                for feedback, member_name in gym_rows
            ],
        }

    @staticmethod
    async def get_coach_plans_summary(*, current_user: User, db: AsyncSession) -> dict:
        if current_user.role != Role.COACH:
            raise ValueError("Not allowed")

        workout_rows = (
            await db.execute(
                select(WorkoutPlan, User.full_name)
                .outerjoin(User, User.id == WorkoutPlan.member_id)
                .where(WorkoutPlan.creator_id == current_user.id)
                .options(selectinload(WorkoutPlan.exercises))
                .order_by(WorkoutPlan.published_at.desc().nullslast(), WorkoutPlan.archived_at.desc().nullslast(), WorkoutPlan.name.asc())
            )
        ).all()
        diet_rows = (
            await db.execute(
                select(DietPlan, User.full_name)
                .outerjoin(User, User.id == DietPlan.member_id)
                .where(DietPlan.creator_id == current_user.id)
                .order_by(DietPlan.published_at.desc().nullslast(), DietPlan.archived_at.desc().nullslast(), DietPlan.name.asc())
            )
        ).all()

        return {
            "workouts": [
                {
                    "id": str(plan.id),
                    "name": plan.name,
                    "description": plan.description,
                    "status": plan.status,
                    "member_id": str(plan.member_id) if plan.member_id else None,
                    "member_name": member_name,
                    "is_template": plan.is_template,
                    "expected_sessions_per_30d": plan.expected_sessions_per_30d,
                    "published_at": plan.published_at.isoformat() if plan.published_at else None,
                    "archived_at": plan.archived_at.isoformat() if plan.archived_at else None,
                    "exercises": [
                        {
                            "id": str(exercise.id),
                            "section_name": exercise.section_name,
                            "exercise_name": exercise.exercise_name,
                            "sets": exercise.sets,
                            "reps": exercise.reps,
                            "order": exercise.order,
                        }
                        for exercise in sorted(plan.exercises, key=lambda item: item.order)
                    ],
                }
                for plan, member_name in workout_rows
            ],
            "diets": [
                {
                    "id": str(plan.id),
                    "name": plan.name,
                    "description": plan.description,
                    "content": plan.content,
                    "status": plan.status,
                    "member_id": str(plan.member_id) if plan.member_id else None,
                    "member_name": member_name,
                    "is_template": plan.is_template,
                    "published_at": plan.published_at.isoformat() if plan.published_at else None,
                    "archived_at": plan.archived_at.isoformat() if plan.archived_at else None,
                    "content_structured": plan.content_structured,
                }
                for plan, member_name in diet_rows
            ],
        }

    @staticmethod
    async def _serialize_member_summary(*, member: User, db: AsyncSession) -> dict:
        subscription = await MobileStaffService._subscription_snapshot(member_id=member.id, db=db)
        biometric = (
            await db.execute(
                select(BiometricLog)
                .where(BiometricLog.member_id == member.id)
                .order_by(BiometricLog.date.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        return {
            "id": str(member.id),
            "full_name": member.full_name,
            "email": member.email,
            "phone_number": member.phone_number,
            "profile_picture_url": member.profile_picture_url,
            "subscription": subscription,
            "latest_biometric_date": biometric.date.isoformat() if biometric else None,
        }

    @staticmethod
    async def _subscription_snapshot(*, member_id: uuid.UUID, db: AsyncSession) -> dict:
        sub = (
            await db.execute(
                select(Subscription).where(Subscription.user_id == member_id).order_by(Subscription.end_date.desc()).limit(1)
            )
        ).scalar_one_or_none()
        if not sub:
            return {"status": "NONE", "end_date": None, "plan_name": None}
        return {
            "status": sub.status.value if hasattr(sub.status, "value") else str(sub.status),
            "end_date": sub.end_date.isoformat() if sub.end_date else None,
            "plan_name": sub.plan_name,
        }
