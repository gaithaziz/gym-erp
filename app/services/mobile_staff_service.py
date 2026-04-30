from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import uuid

from sqlalchemy import and_, false, func, or_, select, true
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import security
from app.database import set_rls_context
from app.models.access import AccessLog, AttendanceLog, Subscription
from app.models.enums import Role
from app.models.finance import PaymentMethod, POSTransactionItem, Transaction, TransactionCategory, TransactionType
from app.models.fitness import BiometricLog, DietPlan, WorkoutPlan
from app.models.hr import LeaveRequest, LeaveStatus
from app.models.inventory import Product
from app.models.lost_found import LostFoundItem, LostFoundStatus
from app.models.notification import MobileDevice, MobileNotificationPreference
from app.models.roaming import MemberRoamingAccess
from app.models.support import SupportTicket, TicketStatus
from app.models.user import User
from app.models.workout_log import DietFeedback, GymFeedback, WorkoutLog, WorkoutSession, WorkoutSessionEntry
from app.services.audit_service import AuditService
from app.services.mobile_bootstrap_service import MobileBootstrapService
from app.services.tenancy_service import TenancyService


def _as_float(value: Decimal | float | int | None) -> float:
    if value is None:
        return 0.0
    return float(value)


def _start_of_today() -> datetime:
    now = datetime.utcnow()
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


def _receipt_urls(transaction_id: uuid.UUID) -> dict[str, str]:
    base = f"/api/v1/finance/transactions/{transaction_id}/receipt"
    return {
        "receipt_url": base,
        "receipt_print_url": f"{base}/print",
        "receipt_export_url": f"{base}/export",
        "receipt_export_pdf_url": f"{base}/export-pdf",
    }


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


def _session_summary(session: WorkoutSession, plan_name: str | None = None, member_name: str | None = None) -> dict:
    entries = sorted(session.entries or [], key=lambda entry: entry.order)
    skipped_count = sum(1 for entry in entries if entry.skipped)
    pr_count = sum(1 for entry in entries if entry.is_pr)
    return {
        "id": str(session.id),
        "member_id": str(session.member_id),
        "member_name": member_name,
        "plan_id": str(session.plan_id),
        "plan_name": plan_name,
        "performed_at": session.performed_at.isoformat(),
        "duration_minutes": session.duration_minutes,
        "notes": session.notes,
        "rpe": session.rpe,
        "pain_level": session.pain_level,
        "effort_feedback": session.effort_feedback,
        "attachment_url": session.attachment_url,
        "attachment_mime": session.attachment_mime,
        "attachment_size_bytes": session.attachment_size_bytes,
        "review_status": session.review_status,
        "reviewed_at": session.reviewed_at.isoformat() if session.reviewed_at else None,
        "reviewed_by_user_id": str(session.reviewed_by_user_id) if session.reviewed_by_user_id else None,
        "reviewer_note": session.reviewer_note,
        "skipped_count": skipped_count,
        "pr_count": pr_count,
        "session_volume": round(_session_volume(session), 2),
        "entries": [
            {
                "id": str(entry.id),
                "exercise_name": entry.exercise_name,
                "sets_completed": entry.sets_completed,
                "reps_completed": entry.reps_completed,
                "weight_kg": entry.weight_kg,
                "notes": entry.notes,
                "is_pr": entry.is_pr,
                "skipped": entry.skipped,
                "set_details": _parse_set_details(entry.set_details),
                "entry_volume": round(_entry_volume(entry), 2),
                "order": entry.order,
            }
            for entry in entries
        ],
    }


class MobileStaffService:
    @staticmethod
    async def _resolve_effective_branch_id(
        *,
        current_user: User,
        db: AsyncSession,
        branch_id: uuid.UUID | None,
    ) -> uuid.UUID | None:
        if branch_id is not None:
            await TenancyService.require_branch_access(
                db,
                current_user=current_user,
                branch_id=branch_id,
                allow_all_for_admin=True,
            )
            return branch_id
        if current_user.role in {Role.ADMIN, Role.MANAGER}:
            fallback_branch_id = await TenancyService.resolve_user_attribution_branch_id(db, user=current_user)
            if fallback_branch_id is not None:
                return fallback_branch_id
            accessible_branches = await TenancyService.get_accessible_branches(db, user=current_user)
            if accessible_branches:
                return accessible_branches[0].id
            return None
        return current_user.home_branch_id

    @staticmethod
    async def _can_read_member_at_branch(
        *,
        db: AsyncSession,
        member: User,
        branch_id: uuid.UUID | None,
    ) -> bool:
        if branch_id is None:
            return True
        if member.home_branch_id == branch_id:
            return True

        now = datetime.now(timezone.utc)
        active_grant = (
            await db.execute(
                select(MemberRoamingAccess.id).where(
                    MemberRoamingAccess.member_id == member.id,
                    MemberRoamingAccess.branch_id == branch_id,
                    MemberRoamingAccess.revoked_at.is_(None),
                    MemberRoamingAccess.expires_at > now,
                )
            )
        ).scalar_one_or_none()
        return active_grant is not None

    @staticmethod
    async def list_members(
        *,
        current_user: User,
        db: AsyncSession,
        query: str | None = None,
        branch_id: uuid.UUID | None = None,
        apply_branch_scope: bool = True,
    ) -> list[dict]:
        stmt = select(User).where(User.role == Role.CUSTOMER)
        effective_branch_id: uuid.UUID | None = None

        if apply_branch_scope and current_user.role in {Role.ADMIN, Role.MANAGER}:
            effective_branch_id = await MobileStaffService._resolve_effective_branch_id(
                current_user=current_user,
                db=db,
                branch_id=branch_id,
            )
            if effective_branch_id is not None:
                stmt = stmt.where(User.home_branch_id == effective_branch_id)

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
    async def get_member_detail(
        *,
        current_user: User,
        member_id: uuid.UUID,
        db: AsyncSession,
        branch_id: uuid.UUID | None = None,
    ) -> dict:
        member = await db.get(User, member_id)
        if not member or member.role != Role.CUSTOMER:
            raise ValueError("Member not found")

        effective_branch_id = await MobileStaffService._resolve_effective_branch_id(
            current_user=current_user,
            db=db,
            branch_id=branch_id,
        )
        allowed = await MobileStaffService._can_read_member_at_branch(
            db=db,
            member=member,
            branch_id=effective_branch_id,
        )
        if not allowed:
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
            .options(selectinload(WorkoutSession.entries))
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
                _session_summary(session, plan_name=plan_name)
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
    async def lookup_members(
        *,
        current_user: User,
        db: AsyncSession,
        query: str,
        branch_id: uuid.UUID | None = None,
    ) -> dict:
        items = await MobileStaffService.list_members(
            current_user=current_user,
            db=db,
            query=query,
            branch_id=branch_id,
            apply_branch_scope=branch_id is not None,
        )
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
        branch_id: uuid.UUID | None = None,
    ) -> dict:
        from app.services.access_service import AccessService

        if current_user.role not in {Role.ADMIN, Role.MANAGER, Role.COACH, Role.RECEPTION, Role.FRONT_DESK}:
            raise ValueError("Not allowed")

        member = await db.get(User, member_id)
        if not member or member.role != Role.CUSTOMER:
            raise ValueError("Member not found")

        effective_branch_id = await MobileStaffService._resolve_effective_branch_id(
            current_user=current_user,
            db=db,
            branch_id=branch_id,
        )
        result = await AccessService.process_session_check_in(
            member.id,
            kiosk_id,
            db,
            host_branch_id=effective_branch_id,
            granted_by_user_id=current_user.id,
        )
        return {
            "member_id": str(member.id),
            "member_name": member.full_name,
            "status": result.get("status"),
            "reason": result.get("reason"),
            "kiosk_id": result.get("kiosk_id"),
            "scan_time": result.get("scan_time"),
        }

    @staticmethod
    async def get_finance_summary(*, current_user: User, db: AsyncSession, branch_id: uuid.UUID | None = None) -> dict:
        if current_user.role not in {Role.ADMIN, Role.MANAGER, Role.CASHIER}:
            raise ValueError("Not allowed")
        branch_ids = await TenancyService.branch_scope_ids(
            db,
            current_user=current_user,
            branch_id=branch_id,
            allow_all_for_admin=current_user.role == Role.ADMIN,
        )

        today = _start_of_today()
        total_sales = (
            await db.execute(
                select(func.sum(Transaction.amount))
                .where(
                    Transaction.category == TransactionCategory.POS_SALE,
                    Transaction.date >= today,
                    Transaction.branch_id.in_(branch_ids) if branch_ids else false(),
                )
            )
        ).scalar()
        total_count = (
            await db.execute(
                select(func.count(Transaction.id)).where(
                    Transaction.category == TransactionCategory.POS_SALE,
                    Transaction.date >= today,
                    Transaction.branch_id.in_(branch_ids) if branch_ids else false(),
                )
            )
        ).scalar()
        recent_transactions = await MobileStaffService.get_recent_transactions(current_user=current_user, db=db, limit=5, branch_id=branch_id)
        low_stock = (
            await db.execute(
                select(func.count(Product.id)).where(
                    Product.is_active.is_(True),
                    Product.stock_quantity <= Product.low_stock_threshold,
                    Product.branch_id.in_(branch_ids) if branch_ids else false(),
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
    async def get_recent_transactions(*, current_user: User, db: AsyncSession, limit: int = 20, branch_id: uuid.UUID | None = None) -> list[dict]:
        if current_user.role not in {Role.ADMIN, Role.MANAGER, Role.CASHIER}:
            raise ValueError("Not allowed")
        branch_ids = await TenancyService.branch_scope_ids(
            db,
            current_user=current_user,
            branch_id=branch_id,
            allow_all_for_admin=current_user.role == Role.ADMIN,
        )

        stmt = (
            select(Transaction, User.full_name)
            .outerjoin(User, User.id == Transaction.user_id)
            .where(
                Transaction.category == TransactionCategory.POS_SALE,
                Transaction.branch_id.in_(branch_ids) if branch_ids else false(),
            )
            .order_by(Transaction.date.desc())
            .limit(limit)
        )
        rows = (await db.execute(stmt)).all()
        return [
            {
                "id": str(transaction.id),
                "kind": "pos_transaction",
                "date": transaction.date.isoformat(),
                "amount": _as_float(transaction.amount),
                "category": transaction.category.value if hasattr(transaction.category, "value") else str(transaction.category),
                "payment_method": transaction.payment_method.value if hasattr(transaction.payment_method, "value") else str(transaction.payment_method),
                "description": transaction.description or "POS sale",
                "member_name": member_name,
                **_receipt_urls(transaction.id),
            }
            for transaction, member_name in rows
        ]

    @staticmethod
    async def checkout_pos_cart(
        *,
        current_user: User,
        db: AsyncSession,
        items: list[dict],
        payment_method: PaymentMethod,
        member_id: uuid.UUID | None = None,
        idempotency_key: str | None = None,
        branch_id: uuid.UUID | None = None,
    ) -> dict:
        if current_user.role not in {Role.ADMIN, Role.MANAGER, Role.CASHIER}:
            raise ValueError("Not allowed")
        if not items:
            raise ValueError("Cart is empty")
        effective_branch_id = await MobileStaffService._resolve_effective_branch_id(
            current_user=current_user,
            db=db,
            branch_id=branch_id,
        )

        quantities: dict[uuid.UUID, int] = {}
        for item in items:
            product_id = item["product_id"]
            quantity = int(item["quantity"])
            if quantity < 1:
                raise ValueError("Quantity must be at least 1")
            if product_id in quantities:
                raise ValueError("Duplicate products are not allowed")
            quantities[product_id] = quantity

        if idempotency_key:
            existing = (
                await db.execute(
                    select(Transaction)
                    .where(Transaction.idempotency_key == idempotency_key)
                    .options(selectinload(Transaction.pos_items))
                )
            ).scalar_one_or_none()
            if existing:
                return MobileStaffService._serialize_pos_checkout(transaction=existing, line_items=list(existing.pos_items))

        member: User | None = None
        if member_id:
            member = await db.get(User, member_id)
            if not member or member.role != Role.CUSTOMER:
                raise ValueError("Member not found")

        products = (
            await db.execute(
                select(Product)
                .where(
                    Product.id.in_(list(quantities.keys())),
                    Product.branch_id == effective_branch_id if effective_branch_id is not None else true(),
                )
                .with_for_update()
            )
        ).scalars().all()
        products_by_id = {product.id: product for product in products}
        if len(products_by_id) != len(quantities):
            raise ValueError("Product not found")

        line_items: list[POSTransactionItem] = []
        total = Decimal("0")
        remaining_stock: list[dict] = []
        for product_id, quantity in quantities.items():
            product = products_by_id[product_id]
            if not product.is_active:
                raise ValueError(f"{product.name} is no longer available")
            if product.stock_quantity < quantity:
                raise ValueError(f"Insufficient stock for {product.name}. Available: {product.stock_quantity}")

            unit_price = Decimal(str(product.price))
            line_total = unit_price * quantity
            total += line_total
            product.stock_quantity -= quantity
            remaining_stock.append(
                {
                    "product_id": str(product.id),
                    "product_name": product.name,
                    "remaining_stock": product.stock_quantity,
                }
            )
            line_items.append(
                POSTransactionItem(
                    product_id=product.id,
                    product_name=product.name,
                    unit_price=unit_price,
                    quantity=quantity,
                    line_total=line_total,
                )
            )

        item_count = sum(quantities.values())
        description = f"POS cart: {item_count} item{'s' if item_count != 1 else ''}"
        transaction = Transaction(
            amount=total,
            type=TransactionType.INCOME,
            category=TransactionCategory.POS_SALE,
            description=description,
            payment_method=payment_method,
            user_id=member.id if member else None,
            idempotency_key=idempotency_key,
            date=datetime.utcnow(),
            branch_id=effective_branch_id,
            gym_id=current_user.gym_id,
        )
        transaction.pos_items = line_items
        db.add(transaction)
        await db.flush()
        await AuditService.log_action(
            db=db,
            user_id=current_user.id,
            action="MOBILE_POS_CHECKOUT",
            target_id=str(transaction.id),
            details=f"Processed mobile POS cart for {item_count} items, total {total}",
        )
        payload = MobileStaffService._serialize_pos_checkout(transaction=transaction, line_items=line_items)
        payload["remaining_stock"] = remaining_stock
        payload["member_name"] = member.full_name if member else None
        await db.commit()
        return payload

    @staticmethod
    def _serialize_pos_checkout(*, transaction: Transaction, line_items: list[POSTransactionItem]) -> dict:
        return {
            "transaction_id": str(transaction.id),
            "date": transaction.date.isoformat(),
            "total": _as_float(transaction.amount),
            "payment_method": transaction.payment_method.value if hasattr(transaction.payment_method, "value") else str(transaction.payment_method),
            "line_items": [
                {
                    "product_id": str(item.product_id) if item.product_id else None,
                    "product_name": item.product_name,
                    "unit_price": _as_float(item.unit_price),
                    "quantity": item.quantity,
                    "line_total": _as_float(item.line_total),
                }
                for item in line_items
            ],
            "remaining_stock": [],
            **_receipt_urls(transaction.id),
        }

    @staticmethod
    async def get_home_summary(*, current_user: User, db: AsyncSession, branch_id: uuid.UUID | None = None) -> dict:
        role = current_user.role
        if role == Role.COACH:
            branch_ids = await TenancyService.branch_scope_ids(
                db,
                current_user=current_user,
                branch_id=branch_id,
                allow_all_for_admin=True,
            )
            branch_scope = User.home_branch_id.in_(branch_ids) if branch_ids else false()
            members_count = await cls._count(
                db,
                select(func.count(User.id)).where(User.role == Role.CUSTOMER, branch_scope),
            )
            workout_total = (
                await db.execute(
                    select(func.count(WorkoutPlan.id))
                    .join(User, User.id == WorkoutPlan.member_id)
                    .where(
                        WorkoutPlan.creator_id == current_user.id,
                        WorkoutPlan.member_id.is_not(None),
                        WorkoutPlan.status != "ARCHIVED",
                        branch_scope,
                    )
                )
            ).scalar()
            diet_total = (
                await db.execute(
                    select(func.count(DietPlan.id))
                    .join(User, User.id == DietPlan.member_id)
                    .where(
                        DietPlan.creator_id == current_user.id,
                        DietPlan.member_id.is_not(None),
                        DietPlan.status != "ARCHIVED",
                        branch_scope,
                    )
                )
            ).scalar()
            feedback_total = (
                await db.execute(
                    select(func.count(DietFeedback.id))
                    .join(DietPlan, DietPlan.id == DietFeedback.diet_plan_id)
                    .join(User, User.id == DietFeedback.member_id)
                    .where(DietFeedback.coach_id == current_user.id, branch_scope)
                )
            ).scalar()
            pending_sessions = (
                await db.execute(
                    select(func.count(WorkoutSession.id))
                    .join(WorkoutPlan, WorkoutPlan.id == WorkoutSession.plan_id)
                    .join(User, User.id == WorkoutSession.member_id)
                    .where(
                        WorkoutPlan.creator_id == current_user.id,
                        branch_scope,
                        WorkoutSession.performed_at >= _start_of_today(),
                    )
                )
            ).scalar()
            recent_sessions = (
                await db.execute(
                    select(WorkoutSession, WorkoutPlan.name, User.full_name)
                    .join(WorkoutPlan, WorkoutPlan.id == WorkoutSession.plan_id)
                    .join(User, User.id == WorkoutSession.member_id)
                    .where(WorkoutPlan.creator_id == current_user.id, branch_scope)
                    .order_by(WorkoutSession.performed_at.desc())
                    .limit(5)
                )
            ).all()
            recent_feedback = (
                await db.execute(
                    select(DietFeedback, DietPlan.name, User.full_name)
                    .join(DietPlan, DietPlan.id == DietFeedback.diet_plan_id)
                    .join(User, User.id == DietFeedback.member_id)
                    .where(DietPlan.creator_id == current_user.id, branch_scope)
                    .order_by(DietFeedback.created_at.desc())
                    .limit(5)
                )
            ).all()
            activity_items = [
                {
                    "id": str(session.id),
                    "kind": "workout_session",
                    "title": member_name or "Member",
                    "subtitle": plan_name or "Workout session",
                    "meta": session.performed_at.isoformat(),
                }
                for session, plan_name, member_name in recent_sessions
            ]
            activity_items.extend(
                {
                    "id": str(feedback.id),
                    "kind": "diet_feedback",
                    "title": member_name or "Member",
                    "subtitle": f"{plan_name or 'Diet feedback'} - {feedback.rating}/5",
                    "meta": feedback.created_at.isoformat(),
                }
                for feedback, plan_name, member_name in recent_feedback
            )
            activity_items.sort(key=lambda item: item["meta"] or "", reverse=True)
            return {
                "role": role.value,
                "headline": "Coach control center",
                "stats": {
                    "members": int(members_count or 0),
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
                "items": activity_items[:6],
            }

        if role in {Role.RECEPTION, Role.FRONT_DESK}:
            branch_ids = await TenancyService.branch_scope_ids(
                db,
                current_user=current_user,
                branch_id=branch_id,
                allow_all_for_admin=True,
            )
            branch_scope = User.home_branch_id.in_(branch_ids) if branch_ids else false()
            members = await cls._count(db, select(func.count(User.id)).where(User.role == Role.CUSTOMER, branch_scope))
            open_tickets = (
                await db.execute(
                    select(func.count(SupportTicket.id)).where(
                        SupportTicket.status.in_([TicketStatus.OPEN, TicketStatus.IN_PROGRESS]),
                        SupportTicket.branch_id.in_(branch_ids) if branch_ids else false(),
                    )
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
                        ),
                        LostFoundItem.branch_id.in_(branch_ids) if branch_ids else false(),
                    )
                )
            ).scalar()
            recent_scans = (
                await db.execute(
                    select(AccessLog, User.full_name)
                    .join(User, User.id == AccessLog.user_id)
                    .where(AccessLog.branch_id.in_(branch_ids) if branch_ids else false())
                    .order_by(AccessLog.scan_time.desc())
                    .limit(5)
                )
            ).all()
            return {
                "role": role.value,
                "headline": "Front desk overview",
                "stats": {
                    "members": int(members or 0),
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
                        "kind": "access_scan",
                        "title": full_name or "Member",
                        "subtitle": log.status,
                        "meta": log.scan_time.isoformat(),
                    }
                    for log, full_name in recent_scans
                ],
            }

        if role == Role.CASHIER:
            branch_ids = await TenancyService.branch_scope_ids(
                db,
                current_user=current_user,
                branch_id=branch_id,
                allow_all_for_admin=True,
            )
            finance = await MobileStaffService.get_finance_summary(
                current_user=current_user,
                db=db,
                branch_id=branch_ids[0] if branch_ids else None,
            )
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
        lost_found_allowed = current_user.role in {
            Role.EMPLOYEE,
            Role.ADMIN,
            Role.MANAGER,
            Role.RECEPTION,
            Role.FRONT_DESK,
            Role.COACH,
            Role.CASHIER,
        }
        recent_attendance = (
            await db.execute(
                select(AttendanceLog)
                .where(AttendanceLog.user_id == current_user.id, AttendanceLog.check_out_time.is_not(None))
                .order_by(AttendanceLog.check_in_time.desc())
                .limit(2)
            )
        ).scalars().all()
        upcoming_leaves = (
            await db.execute(
                select(LeaveRequest)
                .where(
                    LeaveRequest.user_id == current_user.id,
                    LeaveRequest.start_date >= date.today(),
                    LeaveRequest.status.in_([LeaveStatus.PENDING, LeaveStatus.APPROVED]),
                )
                .order_by(LeaveRequest.start_date.asc())
                .limit(2)
            )
        ).scalars().all()
        lost_found_items: list[LostFoundItem] = []
        if lost_found_allowed:
            lost_found_items = (
                await db.execute(
                    select(LostFoundItem)
                    .where(
                        or_(
                            LostFoundItem.reporter_id == current_user.id,
                            LostFoundItem.assignee_id == current_user.id,
                        ),
                        LostFoundItem.status.in_(
                            [
                                LostFoundStatus.REPORTED,
                                LostFoundStatus.UNDER_REVIEW,
                                LostFoundStatus.READY_FOR_PICKUP,
                            ]
                        ),
                    )
                    .order_by(LostFoundItem.updated_at.desc())
                    .limit(2)
                )
            ).scalars().all()
        activity_items = [
            {
                "id": "attendance",
                "kind": "attendance",
                "title": "Attendance",
                "subtitle": "Clocked in" if attendance_open else "Not clocked in",
                "meta": attendance_open.check_in_time.isoformat() if attendance_open else None,
            }
        ]
        activity_items.extend(
            {
                "id": str(log.id),
                "kind": "shift_summary",
                "title": "Completed shift",
                "subtitle": f"{log.hours_worked:.1f}h worked",
                "meta": log.check_out_time.isoformat() if log.check_out_time else log.check_in_time.isoformat(),
            }
            for log in recent_attendance
        )
        activity_items.extend(
            {
                "id": str(leave.id),
                "kind": "leave_request",
                "title": f"{leave.leave_type.value.title()} leave",
                "subtitle": leave.status.value.title(),
                "meta": leave.start_date.isoformat(),
            }
            for leave in upcoming_leaves
        )
        activity_items.extend(
            {
                "id": str(item.id),
                "kind": "lost_found",
                "title": item.title,
                "subtitle": item.status.value.replace("_", " ").title(),
                "meta": item.updated_at.isoformat(),
            }
            for item in lost_found_items
        )
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
            "items": activity_items,
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
    async def register_device(
        *,
        current_user: User,
        db: AsyncSession,
        device_token: str,
        platform: str,
        device_name: str | None = None,
    ) -> dict:
        snapshot = None
        if current_user.role == Role.CUSTOMER:
            snapshot = (
                db.info.get("rls_user_id", ""),
                db.info.get("rls_user_role", "ANONYMOUS"),
                db.info.get("rls_gym_id", ""),
                db.info.get("rls_branch_id", ""),
            )
            await set_rls_context(
                db,
                user_id=str(current_user.id),
                role=Role.ADMIN.value,
                gym_id=str(current_user.gym_id) if current_user.gym_id else snapshot[2],
                branch_id=str(current_user.home_branch_id) if current_user.home_branch_id else snapshot[3],
            )
        now = datetime.utcnow()
        try:
            device = (
                await db.execute(select(MobileDevice).where(MobileDevice.device_token == device_token))
            ).scalar_one_or_none()
            if device is None:
                device = MobileDevice(
                    user_id=current_user.id,
                    device_token=device_token,
                    platform=platform,
                    device_name=device_name,
                    is_active=True,
                    registered_at=now,
                    last_seen_at=now,
                )
                db.add(device)
            else:
                device.user_id = current_user.id
                device.platform = platform
                device.device_name = device_name
                device.is_active = True
                device.unregistered_at = None
                device.last_seen_at = now
            await db.commit()
            return {
                "device_token": device.device_token,
                "platform": device.platform,
                "device_name": device.device_name,
                "registered": device.is_active,
            }
        finally:
            if snapshot is not None:
                await set_rls_context(
                    db,
                    user_id=snapshot[0],
                    role=snapshot[1],
                    gym_id=snapshot[2],
                    branch_id=snapshot[3],
                )

    @staticmethod
    async def unregister_device(
        *,
        current_user: User,
        db: AsyncSession,
        device_token: str,
        platform: str,
        device_name: str | None = None,
    ) -> dict:
        snapshot = None
        if current_user.role == Role.CUSTOMER:
            snapshot = (
                db.info.get("rls_user_id", ""),
                db.info.get("rls_user_role", "ANONYMOUS"),
                db.info.get("rls_gym_id", ""),
                db.info.get("rls_branch_id", ""),
            )
            await set_rls_context(
                db,
                user_id=str(current_user.id),
                role=Role.ADMIN.value,
                gym_id=str(current_user.gym_id) if current_user.gym_id else snapshot[2],
                branch_id=str(current_user.home_branch_id) if current_user.home_branch_id else snapshot[3],
            )
        now = datetime.utcnow()
        try:
            device = (
                await db.execute(select(MobileDevice).where(MobileDevice.device_token == device_token))
            ).scalar_one_or_none()
            if device is None:
                device = MobileDevice(
                    user_id=current_user.id,
                    device_token=device_token,
                    platform=platform,
                    device_name=device_name,
                    is_active=False,
                    registered_at=now,
                    unregistered_at=now,
                    last_seen_at=now,
                )
                db.add(device)
            else:
                device.user_id = current_user.id
                device.platform = platform
                device.device_name = device_name
                device.is_active = False
                device.unregistered_at = now
                device.last_seen_at = now
            await db.commit()
            return {
                "device_token": device.device_token,
                "platform": device.platform,
                "device_name": device.device_name,
                "registered": device.is_active,
            }
        finally:
            if snapshot is not None:
                await set_rls_context(
                    db,
                    user_id=snapshot[0],
                    role=snapshot[1],
                    gym_id=snapshot[2],
                    branch_id=snapshot[3],
                )

    @staticmethod
    async def get_coach_feedback_summary(
        *,
        current_user: User,
        db: AsyncSession,
        branch_id: uuid.UUID | None = None,
    ) -> dict:
        is_coach = current_user.role == Role.COACH
        branch_ids: list[uuid.UUID] | None = None
        if current_user.role in {Role.ADMIN, Role.MANAGER} or branch_id is not None or is_coach:
            branch_ids = await TenancyService.branch_scope_ids(
                db,
                current_user=current_user,
                branch_id=branch_id,
                allow_all_for_admin=current_user.role == Role.ADMIN,
            )

        def _branch_member_scope(model):
            if branch_ids is None:
                return true()
            if not branch_ids:
                return false()
            return model.home_branch_id.in_(branch_ids)

        plan_scope = [WorkoutPlan.creator_id == current_user.id] if is_coach else []
        member_scope = _branch_member_scope(User)

        workout_rows = (
            await db.execute(
                select(WorkoutLog, WorkoutPlan.name, User.full_name)
                .join(WorkoutPlan, WorkoutPlan.id == WorkoutLog.plan_id)
                .join(User, User.id == WorkoutLog.member_id)
                .where(
                    *plan_scope,
                    member_scope,
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
                .where(
                    *([DietPlan.creator_id == current_user.id] if is_coach else []),
                    member_scope,
                )
                .order_by(DietFeedback.created_at.desc())
                .limit(20)
            )
        ).all()
        gym_stmt = select(GymFeedback, User.full_name).join(User, User.id == GymFeedback.member_id)
        if is_coach:
            gym_stmt = gym_stmt.where(
                GymFeedback.member_id.in_(
                    select(WorkoutPlan.member_id).where(
                        WorkoutPlan.creator_id == current_user.id,
                        WorkoutPlan.member_id.is_not(None),
                    )
                )
            )
        gym_stmt = gym_stmt.where(member_scope)
        gym_rows = (await db.execute(gym_stmt.order_by(GymFeedback.created_at.desc()).limit(20))).all()
        flagged_session_rows = (
            await db.execute(
                select(WorkoutSession, WorkoutPlan.name, User.full_name)
                .join(WorkoutPlan, WorkoutPlan.id == WorkoutSession.plan_id)
                .join(User, User.id == WorkoutSession.member_id)
                .where(
                    *plan_scope,
                    member_scope,
                    or_(
                        WorkoutSession.pain_level >= 4,
                        WorkoutSession.effort_feedback == "TOO_HARD",
                        and_(WorkoutSession.notes.is_not(None), WorkoutSession.attachment_url.is_not(None)),
                    ),
                    WorkoutSession.review_status != "REVIEWED",
                )
                .options(selectinload(WorkoutSession.entries))
                .order_by(WorkoutSession.performed_at.desc())
                .limit(20)
            )
        ).all()

        return {
            "stats": {
                "workout_feedback": len(workout_rows),
                "diet_feedback": len(diet_rows),
                "gym_feedback": len(gym_rows),
                "flagged_sessions": len(flagged_session_rows),
            },
            "flagged_sessions": [
                _session_summary(session, plan_name=plan_name, member_name=member_name)
                for session, plan_name, member_name in flagged_session_rows
            ],
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
    async def get_coach_plans_summary(*, current_user: User, db: AsyncSession, branch_id: uuid.UUID | None = None) -> dict:
        if current_user.role != Role.COACH:
            raise ValueError("Not allowed")

        branch_ids = await TenancyService.branch_scope_ids(
            db,
            current_user=current_user,
            branch_id=branch_id,
            allow_all_for_admin=True,
        )
        branch_scope = User.home_branch_id.in_(branch_ids) if branch_ids else false()
        plan_scope = or_(WorkoutPlan.member_id.is_(None), branch_scope)

        workout_rows = (
            await db.execute(
                select(WorkoutPlan, User.full_name)
                .outerjoin(User, User.id == WorkoutPlan.member_id)
                .where(WorkoutPlan.creator_id == current_user.id, plan_scope)
                .options(selectinload(WorkoutPlan.exercises))
                .order_by(WorkoutPlan.published_at.desc().nullslast(), WorkoutPlan.archived_at.desc().nullslast(), WorkoutPlan.name.asc())
            )
        ).all()
        diet_rows = (
            await db.execute(
                select(DietPlan, User.full_name)
                .outerjoin(User, User.id == DietPlan.member_id)
                .where(DietPlan.creator_id == current_user.id, or_(DietPlan.member_id.is_(None), branch_scope))
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
