from __future__ import annotations

import logging
import re
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.dependencies import RoleChecker, get_current_active_user
from app.auth.security import create_access_token, create_refresh_token, get_password_hash
from app.core.responses import StandardResponse
from app.database import get_db, set_rls_context
from app.models.access import Subscription
from app.models.audit import AuditLog
from app.models.enums import Role
from app.models.finance import Transaction, TransactionType
from app.models.system import SystemConfig
from app.models.tenancy import Branch, Gym, UserBranchAccess
from app.models.user import User
from app.services.subscription_automation_service import SubscriptionAutomationService

logger = logging.getLogger(__name__)

ALLOWED_PLAN_TIERS = {"standard", "premium", "enterprise"}
RESERVED_GYM_SLUGS = {
    "admin",
    "api",
    "app",
    "assets",
    "auth",
    "dashboard",
    "docs",
    "help",
    "home",
    "login",
    "logout",
    "main",
    "public",
    "root",
    "settings",
    "signup",
    "static",
    "support",
    "system",
    "www",
}
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
BRANCH_CODE_RE = re.compile(r"^[A-Z0-9-]{2,16}$")


class GymOnboard(BaseModel):
    name: str
    slug: str
    brand_name: str | None = None
    admin_email: EmailStr
    admin_password: str
    plan_tier: str = "standard"
    timezone: str = "UTC"
    initial_branch_name: str = "Main Branch"
    initial_branch_display_name: str | None = "Main Branch"
    initial_branch_slug: str = "main"
    initial_branch_code: str = "MAIN-01"


class MaintenanceUpdate(BaseModel):
    is_maintenance_mode: bool


class GymUpdateRequest(BaseModel):
    is_active: bool | None = None
    plan_tier: str | None = None


class ClientTelemetryEvent(BaseModel):
    tab: str
    operation: str
    error: str
    context: dict[str, Any] | None = None


class ImpersonationRequest(BaseModel):
    reason: str | None = None


router = APIRouter(
    prefix="",
    tags=["System Admin"],
    dependencies=[Depends(RoleChecker([Role.SUPER_ADMIN]))],
)

RECENT_ACTIVITY_ACTIVE_DAYS = 7
RECENT_ACTIVITY_STALE_DAYS = 30


def _snapshot_rls_context(db: AsyncSession) -> tuple[object, object, object, object]:
    return (
        db.info.get("rls_user_id", ""),
        db.info.get("rls_user_role", "ANONYMOUS"),
        db.info.get("rls_gym_id", ""),
        db.info.get("rls_branch_id", ""),
    )


async def _restore_rls_context(db: AsyncSession, snapshot: tuple[object, object, object, object]) -> None:
    user_id, role, gym_id, branch_id = snapshot
    await set_rls_context(
        db,
        user_id=str(user_id) if user_id else "",
        role=str(role) if role else "ANONYMOUS",
        gym_id=str(gym_id) if gym_id else "",
        branch_id=str(branch_id) if branch_id else "",
    )


async def _resolve_default_gym_id(db: AsyncSession) -> uuid.UUID:
    result = await db.execute(select(Gym.id).order_by(Gym.created_at.asc(), Gym.id.asc()).limit(1))
    gym_id = result.scalar_one_or_none()
    if gym_id is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_error_detail(code="SYSTEM_GYM_MISSING", message="No system gym is configured."),
        )
    return gym_id


def _error_detail(*, code: str, message: str, field: str | None = None, meta: dict[str, Any] | None = None) -> dict[str, Any]:
    detail: dict[str, Any] = {"code": code, "message": message}
    if field:
        detail["field"] = field
    if meta:
        detail["meta"] = meta
    return detail


def _raise_validation(errors: list[dict[str, Any]]) -> None:
    raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=errors)


def _normalize_slug(raw: str) -> str:
    slug = (raw or "").strip().lower()
    slug = re.sub(r"\s+", "-", slug)
    slug = re.sub(r"-+", "-", slug)
    return slug.strip("-")


def _validate_timezone(value: str) -> bool:
    try:
        ZoneInfo(value)
        return True
    except ZoneInfoNotFoundError:
        return False


def _validate_password(password: str) -> list[str]:
    checks: list[str] = []
    if len(password) < 8:
        checks.append("too_short")
    if len(password) > 72:
        checks.append("too_long")
    if not re.search(r"[a-z]", password):
        checks.append("missing_lower")
    if not re.search(r"[A-Z]", password):
        checks.append("missing_upper")
    if not re.search(r"\d", password):
        checks.append("missing_digit")
    return checks


def _validate_onboard_payload(data: GymOnboard) -> GymOnboard:
    errors: list[dict[str, Any]] = []

    data.name = data.name.strip()
    data.brand_name = (data.brand_name or data.name).strip()
    data.slug = _normalize_slug(data.slug)
    data.initial_branch_slug = _normalize_slug(data.initial_branch_slug)
    data.initial_branch_name = data.initial_branch_name.strip() or "Main Branch"
    data.initial_branch_display_name = (data.initial_branch_display_name or data.initial_branch_name).strip()
    data.initial_branch_code = data.initial_branch_code.strip().upper()
    data.plan_tier = data.plan_tier.strip().lower()

    if not data.name or len(data.name) < 3 or len(data.name) > 120:
        errors.append(_error_detail(code="INVALID_NAME", field="name", message="Gym name must be between 3 and 120 characters."))

    if not data.brand_name or len(data.brand_name) < 2 or len(data.brand_name) > 120:
        errors.append(_error_detail(code="INVALID_BRAND_NAME", field="brand_name", message="Brand name must be between 2 and 120 characters."))

    if not data.slug:
        errors.append(_error_detail(code="INVALID_GYM_SLUG", field="slug", message="Gym slug is required."))
    elif len(data.slug) < 3 or len(data.slug) > 50:
        errors.append(_error_detail(code="INVALID_GYM_SLUG", field="slug", message="Gym slug must be between 3 and 50 characters."))
    elif data.slug in RESERVED_GYM_SLUGS:
        errors.append(_error_detail(code="RESERVED_GYM_SLUG", field="slug", message="This gym slug is reserved."))
    elif not SLUG_RE.match(data.slug):
        errors.append(_error_detail(code="INVALID_GYM_SLUG", field="slug", message="Gym slug may only contain lowercase letters, numbers, and single hyphens."))

    if data.plan_tier not in ALLOWED_PLAN_TIERS:
        errors.append(
            _error_detail(
                code="INVALID_PLAN_TIER",
                field="plan_tier",
                message=f"Invalid plan tier. Allowed values: {', '.join(sorted(ALLOWED_PLAN_TIERS))}.",
            )
        )

    if not _validate_timezone(data.timezone):
        errors.append(_error_detail(code="INVALID_TIMEZONE", field="timezone", message="Invalid IANA timezone."))

    if not data.initial_branch_slug:
        errors.append(_error_detail(code="INVALID_BRANCH_SLUG", field="initial_branch_slug", message="Branch slug is required."))
    elif len(data.initial_branch_slug) < 2 or len(data.initial_branch_slug) > 50:
        errors.append(_error_detail(code="INVALID_BRANCH_SLUG", field="initial_branch_slug", message="Branch slug must be between 2 and 50 characters."))
    elif not SLUG_RE.match(data.initial_branch_slug):
        errors.append(_error_detail(code="INVALID_BRANCH_SLUG", field="initial_branch_slug", message="Branch slug may only contain lowercase letters, numbers, and single hyphens."))

    if not data.initial_branch_name or len(data.initial_branch_name) > 120:
        errors.append(_error_detail(code="INVALID_BRANCH_NAME", field="initial_branch_name", message="Branch name is required and must be at most 120 characters."))

    if not BRANCH_CODE_RE.match(data.initial_branch_code):
        errors.append(_error_detail(code="INVALID_BRANCH_CODE", field="initial_branch_code", message="Branch code must be 2-16 chars using A-Z, 0-9, or '-'"))

    pwd_issues = _validate_password(data.admin_password)
    if pwd_issues:
        errors.append(
            _error_detail(
                code="WEAK_ADMIN_PASSWORD",
                field="admin_password",
                message="Password must be 8-72 chars and include uppercase, lowercase, and a number.",
                meta={"issues": pwd_issues},
            )
        )

    if errors:
        _raise_validation(errors)
    return data


async def _log_super_admin_event(
    db: AsyncSession,
    *,
    gym_id: uuid.UUID,
    action: str,
    actor_user_id: uuid.UUID | None,
    target_id: str | None,
    details: str,
    branch_id: uuid.UUID | None = None,
) -> None:
    snapshot = _snapshot_rls_context(db)
    try:
        await set_rls_context(
            db,
            user_id=str(actor_user_id) if actor_user_id else "",
            role=Role.ADMIN.value,
            gym_id=str(gym_id),
            branch_id=str(branch_id) if branch_id else "",
        )
        db.add(
            AuditLog(
                gym_id=gym_id,
                branch_id=branch_id,
                user_id=actor_user_id,
                action=action,
                target_id=target_id,
                details=details,
            )
        )
        await db.flush()
    finally:
        await _restore_rls_context(db, snapshot)


@router.get("/stats")
async def get_system_stats(
    gym_id: uuid.UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Get global system statistics (Super-Admin only)."""
    await set_rls_context(db, role=Role.SUPER_ADMIN.value)

    gym_filter = Gym.id == gym_id if gym_id else None
    branch_filter = Branch.gym_id == gym_id if gym_id else None
    user_filter = User.gym_id == gym_id if gym_id else None
    sub_filter = Subscription.gym_id == gym_id if gym_id else None

    total_gyms_stmt = select(func.count(Gym.id))
    total_branches_stmt = select(func.count(Branch.id))
    total_users_stmt = select(func.count(User.id))
    active_users_stmt = select(func.count(User.id)).where(User.is_active.is_(True))
    active_subs_stmt = select(func.count(Subscription.id)).where(Subscription.status == "ACTIVE")

    if gym_filter is not None:
        total_gyms_stmt = total_gyms_stmt.where(gym_filter)
    if branch_filter is not None:
        total_branches_stmt = total_branches_stmt.where(branch_filter)
    if user_filter is not None:
        total_users_stmt = total_users_stmt.where(user_filter)
        active_users_stmt = active_users_stmt.where(user_filter)
    if sub_filter is not None:
        active_subs_stmt = active_subs_stmt.where(sub_filter)

    total_gyms = (await db.execute(total_gyms_stmt)).scalar() or 0
    total_branches = (await db.execute(total_branches_stmt)).scalar() or 0
    total_users = (await db.execute(total_users_stmt)).scalar() or 0
    active_users = (await db.execute(active_users_stmt)).scalar() or 0
    active_subs = (await db.execute(active_subs_stmt)).scalar() or 0

    global_maint = await db.execute(select(SystemConfig).where(SystemConfig.key == "global_maintenance_mode"))
    maint_config = global_maint.scalar_one_or_none()

    return {
        "total_gyms": total_gyms,
        "total_branches": total_branches,
        "total_users": total_users,
        "active_users": active_users,
        "active_subscriptions": active_subs,
        "global_maintenance": maint_config.value_bool if maint_config else False,
    }


@router.get("/gyms")
async def list_gyms(db: AsyncSession = Depends(get_db)) -> list[dict[str, Any]]:
    """List all gyms in the system."""
    await set_rls_context(db, role=Role.SUPER_ADMIN.value)
    result = await db.execute(select(Gym).order_by(Gym.created_at.desc()))
    gyms = result.scalars().all()
    return [
        {
            "id": g.id,
            "slug": g.slug,
            "name": g.name,
            "is_active": g.is_active,
            "is_maintenance_mode": g.is_maintenance_mode,
            "plan_tier": g.plan_tier,
            "subscription_expires_at": g.subscription_expires_at,
            "grace_period_days": g.grace_period_days,
            "created_at": g.created_at,
        }
        for g in gyms
    ]


@router.get("/branches")
async def list_branches(
    gym_id: uuid.UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """List branches across the platform for super-admin filters."""
    await set_rls_context(db, role=Role.SUPER_ADMIN.value)

    stmt = select(Branch, Gym.name.label("gym_name")).join(Gym, Gym.id == Branch.gym_id)
    if gym_id is not None:
        stmt = stmt.where(Branch.gym_id == gym_id)
    stmt = stmt.order_by(Gym.name.asc(), Branch.name.asc())

    rows = (await db.execute(stmt)).all()
    return [
        {
            "id": str(branch.id),
            "gym_id": str(branch.gym_id),
            "gym_name": gym_name,
            "name": branch.name,
            "display_name": branch.display_name,
            "code": branch.code,
            "slug": branch.slug,
            "is_active": branch.is_active,
        }
        for branch, gym_name in rows
    ]


@router.patch("/gyms/{gym_id}")
async def update_gym_status(
    gym_id: uuid.UUID,
    payload: GymUpdateRequest,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Update gym administrative settings."""
    await set_rls_context(db, role=Role.SUPER_ADMIN.value)
    gym = await db.get(Gym, gym_id)
    if not gym:
        raise HTTPException(status_code=404, detail="Gym not found")

    if payload.plan_tier is not None:
        normalized_tier = payload.plan_tier.strip().lower()
        if normalized_tier not in ALLOWED_PLAN_TIERS:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=[
                    _error_detail(
                        code="INVALID_PLAN_TIER",
                        field="plan_tier",
                        message=f"Invalid plan tier. Allowed values: {', '.join(sorted(ALLOWED_PLAN_TIERS))}.",
                    )
                ],
            )
        gym.plan_tier = normalized_tier

    if payload.is_active is not None:
        gym.is_active = payload.is_active

    await db.commit()
    return {"message": "Gym updated successfully", "id": gym.id, "is_active": gym.is_active, "plan_tier": gym.plan_tier}


@router.get("/analytics/revenue")
async def get_global_revenue(
    days: int = 30,
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    gym_id: uuid.UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Get global revenue and expense trends."""
    await set_rls_context(db, role=Role.SUPER_ADMIN.value)

    stmt_filters = []
    if gym_id is not None:
        stmt_filters.append(Transaction.gym_id == gym_id)
    if from_date is not None:
        stmt_filters.append(Transaction.date >= datetime.combine(from_date, datetime.min.time(), tzinfo=timezone.utc))
    if to_date is not None:
        stmt_filters.append(Transaction.date <= datetime.combine(to_date, datetime.max.time(), tzinfo=timezone.utc))
    if not stmt_filters:
        stmt_filters.append(Transaction.date >= datetime.now(timezone.utc) - timedelta(days=days))

    stmt = (
        select(
            func.date(Transaction.date).label("date"),
            func.sum(Transaction.amount).filter(Transaction.type == TransactionType.INCOME).label("income"),
            func.sum(Transaction.amount).filter(Transaction.type == TransactionType.EXPENSE).label("expense"),
        )
        .where(and_(*stmt_filters))
        .group_by(func.date(Transaction.date))
        .order_by(func.date(Transaction.date))
    )

    result = await db.execute(stmt)
    rows = result.all()

    return [{"date": str(r.date), "income": float(r.income or 0), "expense": float(r.expense or 0)} for r in rows]


@router.get("/gyms/health")
async def get_gyms_health(
    gym_id: uuid.UUID | None = Query(None),
    status: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Get activity metrics for each gym to identify at-risk tenants."""
    await set_rls_context(db, role=Role.SUPER_ADMIN.value)

    if status:
        normalized_status = status.strip().lower()
        if normalized_status not in {"healthy", "low_activity", "maintenance", "inactive"}:
            raise HTTPException(
                status_code=422,
                detail=[_error_detail(code="INVALID_HEALTH_STATUS", field="status", message="Health status must be healthy, low_activity, maintenance, or inactive.")],
            )
    else:
        normalized_status = ""

    stmt = select(Gym)
    if gym_id is not None:
        stmt = stmt.where(Gym.id == gym_id)
    result = await db.execute(stmt)
    gyms = result.scalars().all()

    health_data = []
    for g in gyms:
        active_members_stmt = select(func.count(Subscription.id)).where(Subscription.gym_id == g.id, Subscription.status == "ACTIVE")
        active_members = (await db.execute(active_members_stmt)).scalar() or 0

        recent_tx_stmt = select(func.count(Transaction.id)).where(
            Transaction.gym_id == g.id,
            Transaction.date >= datetime.now(timezone.utc) - timedelta(days=7),
        )
        recent_tx = (await db.execute(recent_tx_stmt)).scalar() or 0

        if g.is_maintenance_mode:
            health_status = "maintenance"
        elif not g.is_active:
            health_status = "inactive"
        elif recent_tx > 5:
            health_status = "healthy"
        else:
            health_status = "low_activity"

        if normalized_status and health_status != normalized_status:
            continue

        health_data.append(
            {
                "gym_id": str(g.id),
                "gym_name": g.name,
                "is_active": g.is_active,
                "is_maintenance_mode": g.is_maintenance_mode,
                "active_members": active_members,
                "recent_activity_score": recent_tx,
                "status": health_status,
                "attention_score": 0 if health_status == "healthy" else (1 if health_status == "low_activity" else 2),
            }
        )

    health_data.sort(key=lambda row: (row["attention_score"], -row["recent_activity_score"], row["gym_name"]))
    return health_data


@router.post("/gyms/onboard", response_model=StandardResponse[dict[str, Any]])
async def onboard_gym(
    data: GymOnboard,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Automated gym onboarding (Gym + Branch + Admin) with strict validations and typed errors."""
    await set_rls_context(db, role=Role.SUPER_ADMIN.value)
    data = _validate_onboard_payload(data)
    actor_gym_id = current_user.gym_id or await _resolve_default_gym_id(db)

    slug_exists = (await db.execute(select(Gym.id).where(Gym.slug == data.slug))).scalar_one_or_none()
    if slug_exists:
        await _log_super_admin_event(
            db,
            gym_id=actor_gym_id,
            action="GYM_ONBOARD_BLOCKED",
            actor_user_id=current_user.id,
            target_id=data.slug,
            details=f"Onboarding blocked: slug conflict ({data.slug})",
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=_error_detail(code="GYM_SLUG_CONFLICT", field="slug", message="Gym slug already exists."),
        )

    # platform-wide email uniqueness for primary admin identity
    email_exists = (await db.execute(select(User.id).where(User.email == data.admin_email))).scalar_one_or_none()
    if email_exists:
        await _log_super_admin_event(
            db,
            gym_id=actor_gym_id,
            action="GYM_ONBOARD_BLOCKED",
            actor_user_id=current_user.id,
            target_id=data.admin_email,
            details=f"Onboarding blocked: admin email conflict ({data.admin_email})",
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=_error_detail(code="ADMIN_EMAIL_CONFLICT", field="admin_email", message="Admin email already exists in the platform."),
        )

    gym = Gym(
        name=data.name,
        slug=data.slug,
        brand_name=data.brand_name or data.name,
        plan_tier=data.plan_tier,
        timezone=data.timezone,
    )
    branch = Branch(
        name=data.initial_branch_name,
        display_name=data.initial_branch_display_name,
        slug=data.initial_branch_slug,
        code=data.initial_branch_code,
        timezone=data.timezone,
    )
    admin = User(
        email=data.admin_email,
        hashed_password=get_password_hash(data.admin_password),
        full_name=f"{data.name} Admin",
        role=Role.ADMIN,
        is_active=True,
    )

    try:
        db.add(gym)
        await db.flush()

        branch.gym_id = gym.id
        db.add(branch)
        await db.flush()

        admin.gym_id = gym.id
        admin.home_branch_id = branch.id
        db.add(admin)
        await db.flush()

        db.add(UserBranchAccess(user_id=admin.id, gym_id=gym.id, branch_id=branch.id))

        await _log_super_admin_event(
            db,
            gym_id=gym.id,
            branch_id=branch.id,
            action="GYM_ONBOARDED",
            actor_user_id=current_user.id,
            target_id=str(gym.id),
            details=f"Gym onboarded: {gym.name} ({gym.slug}), admin={admin.email}",
        )

        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        error_text = str(exc.orig)
        logger.warning("Onboarding integrity error: %s", error_text)

        if "slug" in error_text and "gyms" in error_text:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=_error_detail(code="GYM_SLUG_CONFLICT", field="slug", message="Gym slug already exists."),
            )
        if "uq_users_email_gym" in error_text or ("users" in error_text and "email" in error_text):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=_error_detail(code="ADMIN_EMAIL_CONFLICT", field="admin_email", message="Admin email already exists."),
            )
        if "uq_branches_gym_slug" in error_text:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=_error_detail(code="BRANCH_SLUG_CONFLICT", field="initial_branch_slug", message="Initial branch slug already exists for this gym."),
            )
        if "uq_branches_gym_code" in error_text:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=_error_detail(code="BRANCH_CODE_CONFLICT", field="initial_branch_code", message="Initial branch code already exists for this gym."),
            )

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=_error_detail(code="ONBOARD_CONFLICT", message="Onboarding failed due to a data conflict. Please retry."),
        )
    except HTTPException:
        raise
    except Exception:
        await db.rollback()
        logger.exception("Unexpected onboarding failure")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_error_detail(code="ONBOARD_INTERNAL_ERROR", message="Unexpected onboarding error."),
        )

    return StandardResponse(data={"gym_id": str(gym.id), "admin_id": str(admin.id), "branch_id": str(branch.id)}, message="Gym onboarded successfully")


@router.get("/audit-logs", response_model=StandardResponse[dict[str, Any]])
async def get_global_audit_logs(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    gym_id: uuid.UUID | None = Query(None),
    branch_id: uuid.UUID | None = Query(None),
    action: str | None = Query(None),
    severity: str | None = Query(None),
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    db: AsyncSession = Depends(get_db),
):
    """Unified global audit feed with deterministic pagination and filters."""
    await set_rls_context(db, role=Role.SUPER_ADMIN.value)

    if from_date and to_date and from_date > to_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[_error_detail(code="INVALID_DATE_RANGE", field="from", message="from must be before or equal to to")],
        )

    gym_rows = (await db.execute(select(Gym.id, Gym.name).order_by(Gym.created_at.desc(), Gym.name.asc()))).all()
    gym_names = {row_gym_id: row_gym_name for row_gym_id, row_gym_name in gym_rows}
    target_gyms = [gym_id] if gym_id else [row_gym_id for row_gym_id, _ in gym_rows]

    normalized_action = action.strip() if action else ""
    normalized_severity = severity.strip().lower() if severity else ""
    from_dt = datetime.combine(from_date, datetime.min.time(), tzinfo=timezone.utc) if from_date else None
    to_dt = datetime.combine(to_date, datetime.max.time(), tzinfo=timezone.utc) if to_date else None

    all_items: list[dict[str, Any]] = []
    for target_gym_id in target_gyms:
        snapshot = _snapshot_rls_context(db)
        try:
            await set_rls_context(db, role=Role.ADMIN.value, gym_id=str(target_gym_id))

            filters = [AuditLog.gym_id == target_gym_id]
            if branch_id is not None:
                filters.append(AuditLog.branch_id == branch_id)
            if normalized_action:
                filters.append(AuditLog.action.ilike(normalized_action))
            if from_dt:
                filters.append(AuditLog.timestamp >= from_dt)
            if to_dt:
                filters.append(AuditLog.timestamp <= to_dt)

            stmt = (
                select(AuditLog)
                .where(and_(*filters))
                .options(selectinload(AuditLog.branch), selectinload(AuditLog.user))
                .order_by(AuditLog.timestamp.desc())
            )
            logs = (await db.execute(stmt)).scalars().all()
        finally:
            await _restore_rls_context(db, snapshot)

        for l in logs:
            severity_value = "low"
            action_name = (l.action or "").upper()
            if action_name in {"USER_IMPERSONATED", "GLOBAL_MAINTENANCE_TOGGLED"}:
                severity_value = "high"
            elif action_name in {"GYM_ONBOARD_BLOCKED", "GYM_MAINTENANCE_TOGGLED", "SUBSCRIPTIONS_SYNC_TRIGGERED"}:
                severity_value = "medium"

            if normalized_severity and severity_value != normalized_severity:
                continue

            all_items.append(
                {
                    "id": str(l.id),
                    "gym_id": str(l.gym_id),
                    "gym_name": gym_names.get(l.gym_id, "Unknown Gym"),
                    "branch_id": str(l.branch_id) if l.branch_id else None,
                    "branch_name": l.branch.name if l.branch else "Global/System",
                    "user_id": str(l.user_id) if l.user_id else None,
                    "user_name": l.user.full_name if l.user else "SYSTEM",
                    "action": l.action,
                    "severity": severity_value,
                    "timestamp": l.timestamp,
                    "details": l.details,
                }
            )

    all_items.sort(
        key=lambda item: (
            item.get("timestamp") or datetime.min.replace(tzinfo=timezone.utc),
            item.get("id") or "",
        ),
        reverse=True,
    )
    total = len(all_items)
    start = (page - 1) * limit
    end = start + limit
    items = all_items[start:end]
    return StandardResponse(data={"items": items, "total": total, "page": page, "limit": limit})


@router.post("/config/maintenance")
async def toggle_global_maintenance(
    data: MaintenanceUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Toggle platform-wide maintenance mode."""
    await set_rls_context(db, role=Role.SUPER_ADMIN.value)

    stmt = select(SystemConfig).where(SystemConfig.key == "global_maintenance_mode")
    res = await db.execute(stmt)
    config = res.scalar_one_or_none()

    if not config:
        config = SystemConfig(key="global_maintenance_mode", value_bool=data.is_maintenance_mode)
        db.add(config)
    else:
        config.value_bool = data.is_maintenance_mode

    actor_gym_id = current_user.gym_id or await _resolve_default_gym_id(db)
    await _log_super_admin_event(
        db,
        gym_id=actor_gym_id,
        action="GLOBAL_MAINTENANCE_TOGGLED",
        actor_user_id=current_user.id,
        target_id="global_maintenance_mode",
        details=f"Set global maintenance to {data.is_maintenance_mode}",
    )

    await db.commit()
    return {"message": "Global maintenance updated", "status": data.is_maintenance_mode}


@router.patch("/gyms/{gym_id}/maintenance")
async def toggle_gym_maintenance(
    gym_id: uuid.UUID,
    data: MaintenanceUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Toggle maintenance mode for a specific gym."""
    await set_rls_context(db, role=Role.SUPER_ADMIN.value)

    gym = await db.get(Gym, gym_id)
    if not gym:
        raise HTTPException(status_code=404, detail="Gym not found")

    gym.is_maintenance_mode = data.is_maintenance_mode
    await _log_super_admin_event(
        db,
        gym_id=gym.id,
        action="GYM_MAINTENANCE_TOGGLED",
        actor_user_id=current_user.id,
        target_id=str(gym.id),
        details=f"Set gym maintenance to {data.is_maintenance_mode}",
    )
    await db.commit()
    return {"message": "Gym maintenance updated", "status": data.is_maintenance_mode}


@router.post("/subscriptions/sync")
async def sync_gym_subscriptions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Trigger the global subscription automation scan (Super-Admin only)."""
    await set_rls_context(db, role=Role.SUPER_ADMIN.value)
    stats = await SubscriptionAutomationService.run(db)
    actor_gym_id = current_user.gym_id or await _resolve_default_gym_id(db)
    await _log_super_admin_event(
        db,
        gym_id=actor_gym_id,
        action="SUBSCRIPTIONS_SYNC_TRIGGERED",
        actor_user_id=current_user.id,
        target_id="subscriptions",
        details=f"Sync stats: {stats}",
    )
    await db.commit()
    return {"message": "Subscription sync completed", "stats": stats}


@router.get("/users/search", response_model=StandardResponse[dict[str, Any]])
async def global_user_search(
    q: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    role: str | None = Query(None),
    gym_id: uuid.UUID | None = Query(None),
    branch_id: uuid.UUID | None = Query(None),
    activity_status: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[dict[str, Any]]:
    """Search users globally. If q is empty, returns recent users by latest activity."""
    await set_rls_context(db, role=Role.SUPER_ADMIN.value)

    normalized_q = (q or "").strip()
    normalized_role = role.strip().upper() if role else ""
    normalized_activity_status = activity_status.strip().lower() if activity_status else ""

    if normalized_role and normalized_role not in {item.value for item in Role}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[_error_detail(code="INVALID_ROLE", field="role", message="Invalid role filter.")],
        )
    if normalized_activity_status and normalized_activity_status not in {"active", "stale", "inactive"}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[_error_detail(code="INVALID_ACTIVITY_STATUS", field="activity_status", message="Activity status must be active, stale, or inactive.")],
        )

    activity_subq = (
        select(
            AuditLog.user_id.label("user_id"),
            func.max(AuditLog.timestamp).label("last_activity_at"),
        )
        .where(AuditLog.user_id.is_not(None))
        .group_by(AuditLog.user_id)
        .subquery()
    )

    all_items: list[dict[str, Any]] = []

    stmt = (
        select(User, Gym.name.label("gym_name"), Branch.name.label("branch_name"), Branch.display_name.label("branch_display_name"), activity_subq.c.last_activity_at)
        .join(Gym, Gym.id == User.gym_id)
        .outerjoin(Branch, Branch.id == User.home_branch_id)
        .outerjoin(activity_subq, activity_subq.c.user_id == User.id)
    )

    if normalized_q:
        like = f"%{normalized_q}%"
        stmt = stmt.where(or_(User.email.ilike(like), User.full_name.ilike(like)))
    if normalized_role:
        stmt = stmt.where(User.role == Role[normalized_role])
    if gym_id is not None:
        stmt = stmt.where(User.gym_id == gym_id)
    if branch_id is not None:
        stmt = stmt.where(User.home_branch_id == branch_id)

    rows = (await db.execute(stmt)).all()

    now = datetime.now(timezone.utc)
    active_cutoff = now - timedelta(days=RECENT_ACTIVITY_ACTIVE_DAYS)
    stale_cutoff = now - timedelta(days=RECENT_ACTIVITY_STALE_DAYS)

    for user, gym_name, branch_name, branch_display_name, last_activity_at in rows:
        if last_activity_at is None:
            computed_status = "inactive"
        elif last_activity_at >= active_cutoff:
            computed_status = "active"
        elif last_activity_at >= stale_cutoff:
            computed_status = "stale"
        else:
            computed_status = "inactive"

        if normalized_activity_status and computed_status != normalized_activity_status:
            continue

        all_items.append(
            {
                "id": str(user.id),
                "email": user.email,
                "full_name": user.full_name,
                "role": user.role,
                "is_active": user.is_active,
                "gym_id": str(user.gym_id),
                "gym_name": gym_name,
                "home_branch_id": str(user.home_branch_id) if user.home_branch_id else None,
                "home_branch_name": branch_display_name or branch_name,
                "last_activity_at": last_activity_at,
                "activity_status": computed_status,
            }
        )

    all_items.sort(
        key=lambda item: (
            item.get("last_activity_at") or datetime.min.replace(tzinfo=timezone.utc),
            item.get("email") or "",
        ),
        reverse=True,
    )
    total = len(all_items)
    start = (page - 1) * limit
    end = start + limit
    return StandardResponse(data={"items": all_items[start:end], "total": total, "page": page, "limit": limit})


@router.post("/users/{user_id}/impersonate")
async def impersonate_user(
    user_id: uuid.UUID,
    payload: ImpersonationRequest | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Generate impersonation tokens for a specific user (Super-Admin only)."""
    await set_rls_context(db, role=Role.SUPER_ADMIN.value)

    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    reason = payload.reason.strip() if payload and payload.reason else ""

    await _log_super_admin_event(
        db,
        gym_id=user.gym_id,
        action="USER_IMPERSONATED",
        actor_user_id=current_user.id,
        target_id=str(user.id),
        details=(
            f"Super-Admin impersonated user: {user.email}"
            + (f" | reason={reason}" if reason else "")
        ),
        branch_id=user.home_branch_id,
    )
    await db.commit()

    access_token = create_access_token(
        subject=user.id,
        gym_id=str(user.gym_id),
        home_branch_id=str(user.home_branch_id) if user.home_branch_id else None,
        is_impersonated=True,
        session_version=int(getattr(user, "session_version", 0) or 0),
    )
    refresh_token = create_refresh_token(
        subject=user.id,
        gym_id=str(user.gym_id),
        home_branch_id=str(user.home_branch_id) if user.home_branch_id else None,
        is_impersonated=True,
        session_version=int(getattr(user, "session_version", 0) or 0),
    )

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role,
        },
    }


@router.post("/client-telemetry", response_model=StandardResponse[dict[str, Any]])
async def ingest_client_telemetry(
    payload: ClientTelemetryEvent,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Lightweight client error telemetry hook for super-admin tabs."""
    await set_rls_context(db, role=Role.SUPER_ADMIN.value)
    logger.warning(
        "superadmin_client_error tab=%s operation=%s user=%s error=%s context=%s",
        payload.tab,
        payload.operation,
        current_user.email,
        payload.error,
        payload.context,
    )
    actor_gym_id = current_user.gym_id or await _resolve_default_gym_id(db)
    await _log_super_admin_event(
        db,
        gym_id=actor_gym_id,
        action="CLIENT_TELEMETRY_RECORDED",
        actor_user_id=current_user.id,
        target_id=payload.tab,
        details=f"operation={payload.operation} error={payload.error}",
    )
    await db.commit()
    return StandardResponse(data={"received": True})
