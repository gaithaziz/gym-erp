from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.access import AccessLog, AttendanceLog, Subscription, SubscriptionRenewalRequest, RenewalRequestStatus
from app.models.audit import AuditLog
from app.models.enums import Role
from app.models.finance import Transaction, TransactionType
from app.models.hr import LeaveRequest, LeaveStatus
from app.models.inventory import Product
from app.models.lost_found import LostFoundItem, LostFoundStatus
from app.models.notification import PushDeliveryLog, WhatsAppAutomationRule
from app.models.subscription_enums import SubscriptionStatus
from app.models.support import SupportTicket, TicketStatus
from app.models.user import User


ADMIN_CONTROL_ROLES = {Role.ADMIN, Role.MANAGER}


def _as_float(value: Decimal | float | int | None) -> float:
    if value is None:
        return 0.0
    return float(value)


def _start_of_today() -> datetime:
    now = datetime.utcnow()
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


def _start_of_month() -> datetime:
    today = _start_of_today()
    return today.replace(day=1)


class MobileAdminService:
    @staticmethod
    def _ensure_allowed(current_user: User) -> None:
        if current_user.role not in ADMIN_CONTROL_ROLES:
            raise ValueError("Not allowed")

    @staticmethod
    def _ensure_audit_allowed(current_user: User) -> None:
        if current_user.role != Role.ADMIN:
            raise ValueError("Not allowed")

    @classmethod
    async def get_home_summary(cls, *, current_user: User, db: AsyncSession) -> dict[str, Any]:
        cls._ensure_allowed(current_user)

        people = await cls.get_people_summary(current_user=current_user, db=db)
        operations = await cls.get_operations_summary(current_user=current_user, db=db)
        finance = await cls.get_finance_summary(current_user=current_user, db=db)
        audit = await cls.get_audit_summary(current_user=current_user, db=db) if current_user.role == Role.ADMIN else {"recent_events": []}

        alerts = [
            {
                "id": "low_stock",
                "severity": "warning" if operations["inventory"]["low_stock_count"] else "info",
                "title": "Low stock",
                "body": f"{operations['inventory']['low_stock_count']} products need attention",
                "route": "/(tabs)/operations",
                "count": operations["inventory"]["low_stock_count"],
            },
            {
                "id": "support_queue",
                "severity": "warning" if operations["support"]["open_tickets"] else "info",
                "title": "Support queue",
                "body": f"{operations['support']['open_tickets']} open tickets",
                "route": "/support",
                "count": operations["support"]["open_tickets"],
            },
        ]

        approvals = [
            {
                "id": "renewals",
                "kind": "renewal_requests",
                "title": "Renewal requests",
                "subtitle": "Cash renewals waiting for staff approval",
                "count": operations["approvals"]["pending_renewals"],
                "route": "/billing",
            },
            {
                "id": "leave_requests",
                "kind": "leave_requests",
                "title": "Leave requests",
                "subtitle": "Staff leave requests awaiting review",
                "count": operations["approvals"]["pending_leaves"],
                "route": "/leaves",
            },
        ]

        return {
            "headline": "Control center",
            "metrics": [
                {"id": "members", "label": "Members", "value": people["members"]["total"], "tone": "neutral"},
                {"id": "active_members", "label": "Active", "value": people["members"]["active"], "tone": "positive"},
                {"id": "today_checkins", "label": "Check-ins", "value": operations["attendance"]["checkins_today"], "tone": "neutral"},
                {"id": "month_net", "label": "Month net", "value": finance["month"]["net"], "tone": "positive" if finance["month"]["net"] >= 0 else "critical"},
                {"id": "open_support", "label": "Support", "value": operations["support"]["open_tickets"], "tone": "warning"},
            ],
            "alerts": alerts,
            "approvals": approvals,
            "recent_activity": cls._merge_activity(
                finance["recent_transactions"],
                operations["recent_support_tickets"],
                audit["recent_events"],
            ),
        }

    @classmethod
    async def get_people_summary(cls, *, current_user: User, db: AsyncSession) -> dict[str, Any]:
        cls._ensure_allowed(current_user)

        total_members = await cls._count(db, select(func.count(User.id)).where(User.role == Role.CUSTOMER))
        active_members = await cls._count(
            db,
            select(func.count(User.id))
            .join(Subscription, Subscription.user_id == User.id)
            .where(User.role == Role.CUSTOMER, Subscription.status == SubscriptionStatus.ACTIVE),
        )
        blocked_members = max(total_members - active_members, 0)
        staff_total = await cls._count(db, select(func.count(User.id)).where(User.role != Role.CUSTOMER))

        staff_rows = (
            await db.execute(
                select(User.role, func.count(User.id))
                .where(User.role != Role.CUSTOMER)
                .group_by(User.role)
                .order_by(User.role.asc())
            )
        ).all()
        recent_members = (
            await db.execute(
                select(User)
                .where(User.role == Role.CUSTOMER)
                .order_by(User.full_name.asc().nullslast(), User.email.asc())
                .limit(5)
            )
        ).scalars().all()

        today = _start_of_today()
        staff_checked_in = await cls._count(db, select(func.count(AttendanceLog.id)).where(AttendanceLog.check_in_time >= today))
        member_scans = await cls._count(db, select(func.count(AccessLog.id)).where(AccessLog.scan_time >= today))

        return {
            "members": {
                "total": total_members,
                "active": active_members,
                "blocked_or_inactive": blocked_members,
            },
            "staff": {
                "total": staff_total,
                "by_role": [
                    {"id": role.value if hasattr(role, "value") else str(role), "label": role.value if hasattr(role, "value") else str(role), "value": int(count or 0)}
                    for role, count in staff_rows
                ],
            },
            "attendance": {
                "staff_checked_in_today": staff_checked_in,
                "member_scans_today": member_scans,
            },
            "recent_members": [
                {
                    "id": str(member.id),
                    "full_name": member.full_name,
                    "email": member.email,
                    "phone_number": member.phone_number,
                    "profile_picture_url": member.profile_picture_url,
                }
                for member in recent_members
            ],
        }

    @classmethod
    async def get_operations_summary(cls, *, current_user: User, db: AsyncSession) -> dict[str, Any]:
        cls._ensure_allowed(current_user)

        today = _start_of_today()
        checkins_today = await cls._count(db, select(func.count(AccessLog.id)).where(AccessLog.scan_time >= today))
        denied_today = await cls._count(
            db,
            select(func.count(AccessLog.id)).where(AccessLog.scan_time >= today, AccessLog.status != "GRANTED"),
        )
        open_tickets = await cls._count(
            db,
            select(func.count(SupportTicket.id)).where(SupportTicket.status.in_([TicketStatus.OPEN, TicketStatus.IN_PROGRESS])),
        )
        open_lost_found = await cls._count(
            db,
            select(func.count(LostFoundItem.id)).where(
                LostFoundItem.status.in_([LostFoundStatus.REPORTED, LostFoundStatus.UNDER_REVIEW, LostFoundStatus.READY_FOR_PICKUP])
            ),
        )
        pending_renewals = await cls._count(
            db,
            select(func.count(SubscriptionRenewalRequest.id)).where(SubscriptionRenewalRequest.status == RenewalRequestStatus.PENDING),
        )
        pending_leaves = await cls._count(db, select(func.count(LeaveRequest.id)).where(LeaveRequest.status == LeaveStatus.PENDING))
        queued_push = await cls._count(db, select(func.count(PushDeliveryLog.id)).where(PushDeliveryLog.status == "QUEUED"))
        failed_push = await cls._count(db, select(func.count(PushDeliveryLog.id)).where(PushDeliveryLog.status == "FAILED"))
        automation_rules = await cls._count(
            db,
            select(func.count(WhatsAppAutomationRule.id)).where(WhatsAppAutomationRule.is_enabled.is_(True)),
        )

        recent_support_tickets = (
            await db.execute(
                select(SupportTicket, User.full_name)
                .join(User, User.id == SupportTicket.customer_id)
                .order_by(SupportTicket.created_at.desc())
                .limit(5)
            )
        ).all()

        inventory = await cls.get_inventory_summary(current_user=current_user, db=db)
        return {
            "attendance": {
                "checkins_today": checkins_today,
                "denied_today": denied_today,
            },
            "support": {
                "open_tickets": open_tickets,
                "lost_found_open": open_lost_found,
            },
            "inventory": {
                "low_stock_count": inventory["low_stock_count"],
                "out_of_stock_count": inventory["out_of_stock_count"],
            },
            "notifications": {
                "queued_push": queued_push,
                "failed_push": failed_push,
                "enabled_automation_rules": automation_rules,
            },
            "approvals": {
                "pending_renewals": pending_renewals,
                "pending_leaves": pending_leaves,
            },
            "recent_support_tickets": [
                {
                    "id": str(ticket.id),
                    "subject": ticket.subject,
                    "status": ticket.status.value if hasattr(ticket.status, "value") else str(ticket.status),
                    "category": ticket.category.value if hasattr(ticket.category, "value") else str(ticket.category),
                    "customer_name": customer_name,
                    "created_at": ticket.created_at.isoformat() if ticket.created_at else None,
                }
                for ticket, customer_name in recent_support_tickets
            ],
        }

    @classmethod
    async def get_finance_summary(cls, *, current_user: User, db: AsyncSession) -> dict[str, Any]:
        cls._ensure_allowed(current_user)

        today = _start_of_today()
        month = _start_of_month()
        today_income = await cls._sum_transactions(db=db, from_date=today, transaction_type=TransactionType.INCOME)
        today_expense = await cls._sum_transactions(db=db, from_date=today, transaction_type=TransactionType.EXPENSE)
        month_income = await cls._sum_transactions(db=db, from_date=month, transaction_type=TransactionType.INCOME)
        month_expense = await cls._sum_transactions(db=db, from_date=month, transaction_type=TransactionType.EXPENSE)

        recent_transactions = (
            await db.execute(
                select(Transaction, User.full_name)
                .outerjoin(User, User.id == Transaction.user_id)
                .order_by(Transaction.date.desc())
                .limit(8)
            )
        ).all()

        low_stock = await cls._count(
            db,
            select(func.count(Product.id)).where(Product.is_active.is_(True), Product.stock_quantity <= Product.low_stock_threshold),
        )

        return {
            "today": {
                "revenue": today_income,
                "expenses": today_expense,
                "net": today_income - today_expense,
            },
            "month": {
                "revenue": month_income,
                "expenses": month_expense,
                "net": month_income - month_expense,
            },
            "low_stock_count": low_stock,
            "recent_transactions": [
                {
                    "id": str(transaction.id),
                    "date": transaction.date.isoformat(),
                    "amount": _as_float(transaction.amount),
                    "type": transaction.type.value if hasattr(transaction.type, "value") else str(transaction.type),
                    "category": transaction.category.value if hasattr(transaction.category, "value") else str(transaction.category),
                    "payment_method": transaction.payment_method.value if hasattr(transaction.payment_method, "value") else str(transaction.payment_method),
                    "description": transaction.description or transaction.category.value,
                    "member_name": member_name,
                }
                for transaction, member_name in recent_transactions
            ],
        }

    @classmethod
    async def get_audit_summary(cls, *, current_user: User, db: AsyncSession) -> dict[str, Any]:
        cls._ensure_audit_allowed(current_user)

        recent_events = (
            await db.execute(
                select(AuditLog, User.full_name)
                .outerjoin(User, User.id == AuditLog.user_id)
                .order_by(AuditLog.timestamp.desc())
                .limit(10)
            )
        ).all()
        action_rows = (
            await db.execute(
                select(AuditLog.action, func.count(AuditLog.id))
                .group_by(AuditLog.action)
                .order_by(func.count(AuditLog.id).desc())
                .limit(6)
            )
        ).all()

        return {
            "total_events": await cls._count(db, select(func.count(AuditLog.id))),
            "action_counts": [
                {"id": action, "label": action.replace("_", " ").title(), "value": int(count or 0)}
                for action, count in action_rows
            ],
            "recent_events": [
                {
                    "id": str(event.id),
                    "action": event.action,
                    "actor_name": actor_name,
                    "target_id": event.target_id,
                    "details": event.details,
                    "timestamp": event.timestamp.isoformat() if event.timestamp else None,
                }
                for event, actor_name in recent_events
            ],
            "security": {
                "status": "not_run",
                "summary": "Security audit is available on the web admin surface.",
            },
        }

    @classmethod
    async def get_inventory_summary(cls, *, current_user: User, db: AsyncSession) -> dict[str, Any]:
        cls._ensure_allowed(current_user)

        low_stock_products = (
            await db.execute(
                select(Product)
                .where(Product.is_active.is_(True), Product.stock_quantity <= Product.low_stock_threshold)
                .order_by(Product.stock_quantity.asc(), Product.name.asc())
                .limit(8)
            )
        ).scalars().all()
        total_active = await cls._count(db, select(func.count(Product.id)).where(Product.is_active.is_(True)))
        out_of_stock = await cls._count(
            db,
            select(func.count(Product.id)).where(Product.is_active.is_(True), Product.stock_quantity <= 0),
        )

        return {
            "total_active_products": total_active,
            "low_stock_count": len(low_stock_products),
            "out_of_stock_count": out_of_stock,
            "low_stock_products": [
                {
                    "id": str(product.id),
                    "name": product.name,
                    "sku": product.sku,
                    "category": product.category.value if hasattr(product.category, "value") else str(product.category),
                    "stock_quantity": product.stock_quantity,
                    "low_stock_threshold": product.low_stock_threshold,
                }
                for product in low_stock_products
            ],
        }

    @staticmethod
    async def _count(db: AsyncSession, stmt) -> int:
        value = (await db.execute(stmt)).scalar()
        return int(value or 0)

    @staticmethod
    async def _sum_transactions(*, db: AsyncSession, from_date: datetime, transaction_type: TransactionType) -> float:
        value = (
            await db.execute(
                select(func.sum(Transaction.amount)).where(
                    Transaction.date >= from_date,
                    Transaction.type == transaction_type,
                )
            )
        ).scalar()
        return _as_float(value)

    @staticmethod
    def _merge_activity(*groups: list[dict[str, Any]]) -> list[dict[str, Any]]:
        activity: list[dict[str, Any]] = []
        for item in groups[0]:
            activity.append(
                {
                    "id": item["id"],
                    "kind": "finance",
                    "title": item["description"],
                    "subtitle": f"{item['type']} {item['amount']}",
                    "timestamp": item["date"],
                    "route": "/(tabs)/finance",
                }
            )
        for item in groups[1]:
            activity.append(
                {
                    "id": item["id"],
                    "kind": "support",
                    "title": item["subject"],
                    "subtitle": item["status"],
                    "timestamp": item["created_at"],
                    "route": "/support",
                }
            )
        for item in groups[2]:
            activity.append(
                {
                    "id": item["id"],
                    "kind": "audit",
                    "title": item["action"],
                    "subtitle": item.get("actor_name") or "System",
                    "timestamp": item["timestamp"],
                    "route": "/(tabs)/operations",
                }
            )
        activity.sort(key=lambda row: row.get("timestamp") or "", reverse=True)
        return activity[:10]
