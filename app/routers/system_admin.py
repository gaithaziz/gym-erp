from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import RoleChecker, get_current_active_user
from app.database import get_db, set_rls_context
from app.models.enums import Role
from app.models.tenancy import Gym, Branch, UserBranchAccess
from app.models.user import User
from app.models.access import Subscription
from pydantic import BaseModel, EmailStr
from app.services.subscription_automation_service import SubscriptionAutomationService

class GymOnboard(BaseModel):
    name: str
    slug: str
    brand_name: str | None = None
    admin_email: EmailStr
    admin_password: str
    plan_tier: str = "standard"


ALLOWED_PLAN_TIERS = {"standard", "premium", "enterprise"}

class MaintenanceUpdate(BaseModel):
    is_maintenance_mode: bool

router = APIRouter(
    prefix="",
    tags=["System Admin"],
    dependencies=[Depends(RoleChecker([Role.SUPER_ADMIN]))],
)

from app.models.system import SystemConfig
from app.models.audit import AuditLog
from app.models.finance import Transaction, TransactionType
from app.auth.security import get_password_hash, create_access_token, create_refresh_token

@router.get("/stats")
async def get_system_stats(db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """Get global system statistics (Super-Admin only)."""
    await set_rls_context(db, role=Role.SUPER_ADMIN.value)

    total_gyms = (await db.execute(select(func.count(Gym.id)))).scalar() or 0
    total_branches = (await db.execute(select(func.count(Branch.id)))).scalar() or 0
    total_users = (await db.execute(select(func.count(User.id)))).scalar() or 0
    active_subs = (await db.execute(select(func.count(Subscription.id)).where(Subscription.status == "ACTIVE"))).scalar() or 0

    # Maintenance Status
    global_maint = await db.execute(select(SystemConfig).where(SystemConfig.key == "global_maintenance_mode"))
    maint_config = global_maint.scalar_one_or_none()

    return {
        "total_gyms": total_gyms,
        "total_branches": total_branches,
        "total_users": total_users,
        "active_subscriptions": active_subs,
        "global_maintenance": maint_config.value_bool if maint_config else False
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

@router.patch("/gyms/{gym_id}")
async def update_gym_status(
    gym_id: uuid.UUID,
    is_active: bool | None = None,
    plan_tier: str | None = None,
    db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    """Update gym administrative settings."""
    await set_rls_context(db, role=Role.SUPER_ADMIN.value)
    gym = await db.get(Gym, gym_id)
    if not gym:
        raise HTTPException(status_code=404, detail="Gym not found")
    
    if is_active is not None:
        gym.is_active = is_active
    if plan_tier is not None:
        gym.plan_tier = plan_tier
        
    await db.commit()
    return {"message": "Gym updated successfully", "id": gym.id, "is_active": gym.is_active}

@router.get("/analytics/revenue")
async def get_global_revenue(days: int = 30, db: AsyncSession = Depends(get_db)):
    """Get global revenue and expense trends."""
    await set_rls_context(db, role=Role.SUPER_ADMIN.value)
    
    # Simple daily aggregation
    stmt = select(
        func.date(Transaction.date).label("date"),
        func.sum(Transaction.amount).filter(Transaction.type == TransactionType.INCOME).label("income"),
        func.sum(Transaction.amount).filter(Transaction.type == TransactionType.EXPENSE).label("expense")
    ).group_by(func.date(Transaction.date)).order_by(func.date(Transaction.date)).limit(days)
    
    result = await db.execute(stmt)
    rows = result.all()
    
    return [
        {"date": str(r.date), "income": float(r.income or 0), "expense": float(r.expense or 0)}
        for r in rows
    ]

@router.get("/gyms/health")
async def get_gyms_health(db: AsyncSession = Depends(get_db)):
    """Get activity metrics for each gym to identify at-risk tenants."""
    await set_rls_context(db, role=Role.SUPER_ADMIN.value)
    from datetime import timedelta, timezone
    from app.models.access import Subscription
    from app.models.finance import Transaction

    result = await db.execute(select(Gym))
    gyms = result.scalars().all()

    health_data = []
    for g in gyms:
        active_members_stmt = select(func.count(Subscription.id)).where(
            Subscription.gym_id == g.id, 
            Subscription.status == "ACTIVE"
        )
        active_members = (await db.execute(active_members_stmt)).scalar() or 0
        
        recent_tx_stmt = select(func.count(Transaction.id)).where(
            Transaction.gym_id == g.id, 
            Transaction.date >= datetime.now(timezone.utc) - timedelta(days=7)
        )
        recent_tx = (await db.execute(recent_tx_stmt)).scalar() or 0

        health_data.append({
            "gym_id": str(g.id),
            "gym_name": g.name,
            "active_members": active_members,
            "recent_activity_score": recent_tx,
            "status": "Healthy" if recent_tx > 5 else "Low Activity"
        })

    return health_data

@router.post("/gyms/onboard")
async def onboard_gym(
    data: GymOnboard,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Automated gym onboarding (Gym + Branch + Admin)."""
    await set_rls_context(db, role=Role.SUPER_ADMIN.value)

    normalized_slug = data.slug.strip().lower()
    if not normalized_slug:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="slug is required")
    if data.plan_tier not in ALLOWED_PLAN_TIERS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid plan_tier. Allowed: {', '.join(sorted(ALLOWED_PLAN_TIERS))}",
        )

    slug_exists = (await db.execute(select(Gym.id).where(Gym.slug == normalized_slug))).scalar_one_or_none()
    if slug_exists:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Gym slug already exists")

    email_exists = (await db.execute(select(User.id).where(User.email == data.admin_email))).scalar_one_or_none()
    if email_exists:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The user with this email already exists in the system.",
        )

    gym = Gym(
        name=data.name.strip(),
        slug=normalized_slug,
        brand_name=(data.brand_name or data.name).strip(),
        plan_tier=data.plan_tier,
    )
    branch = Branch(
        name="Main Branch",
        slug="main",
        code="MAIN-01",
    )
    admin = User(
        email=data.admin_email,
        hashed_password=get_password_hash(data.admin_password),
        full_name=f"{data.name.strip()} Admin",
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

        db.add(
            UserBranchAccess(
                user_id=admin.id,
                gym_id=gym.id,
                branch_id=branch.id,
            )
        )
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    return {"message": "Gym onboarded successfully", "gym_id": gym.id, "admin_id": admin.id}

@router.get("/audit-logs")
async def get_global_audit_logs(
    page: int = 1, 
    limit: int = 50, 
    gym_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db)
):
    """Unified global audit feed."""
    await set_rls_context(db, role=Role.SUPER_ADMIN.value)
    
    from sqlalchemy.orm import selectinload
    stmt = select(AuditLog).options(
        selectinload(AuditLog.gym),
        selectinload(AuditLog.branch)
    ).order_by(AuditLog.timestamp.desc())
    if gym_id:
        stmt = stmt.where(AuditLog.gym_id == gym_id)
        
    stmt = stmt.offset((page - 1) * limit).limit(limit)
    result = await db.execute(stmt)
    logs = result.scalars().all()
    
    return [
        {
            "id": l.id,
            "gym_id": l.gym_id,
            "gym_name": l.gym.name if l.gym else "Unknown Gym",
            "branch_id": l.branch_id,
            "branch_name": l.branch.name if l.branch else "Global/System",
            "user_id": l.user_id,
            "action": l.action,
            "timestamp": l.timestamp,
            "details": l.details
        }
        for l in logs
    ]

@router.post("/config/maintenance")
async def toggle_global_maintenance(data: MaintenanceUpdate, db: AsyncSession = Depends(get_db)):
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
        
    # We use a dummy UUID or a dedicated system gym ID for global logs if needed, 
    # but here we'll just not log to AuditLog if it requires a gym_id, 
    # OR we'll use the first gym as a bucket? 
    # Actually, let's check if we can make gym_id nullable in AuditLog? 
    # No, it's non-nullable in the Mixin.
    # I'll just skip AuditLog for global maintenance for now OR use a "System" gym if it exists.
    # Actually, I'll just use a try-except or a "catch-all" approach.
    
    await db.commit()
    return {"message": "Global maintenance updated", "status": data.is_maintenance_mode}

@router.patch("/gyms/{gym_id}/maintenance")
async def toggle_gym_maintenance(
    gym_id: uuid.UUID, 
    data: MaintenanceUpdate, 
    db: AsyncSession = Depends(get_db)
):
    """Toggle maintenance mode for a specific gym."""
    await set_rls_context(db, role=Role.SUPER_ADMIN.value)
    
    gym = await db.get(Gym, gym_id)
    if not gym:
        raise HTTPException(status_code=404, detail="Gym not found")
        
    gym.is_maintenance_mode = data.is_maintenance_mode
    await db.commit()
    return {"message": "Gym maintenance updated", "status": data.is_maintenance_mode}

@router.post("/subscriptions/sync")
async def sync_gym_subscriptions(db: AsyncSession = Depends(get_db)):
    """Trigger the global subscription automation scan (Super-Admin only)."""
    await set_rls_context(db, role=Role.SUPER_ADMIN.value)
    stats = await SubscriptionAutomationService.run(db)
    return {"message": "Subscription sync completed", "stats": stats}

@router.get("/users/search")
async def global_user_search(q: str, db: AsyncSession = Depends(get_db)) -> list[dict[str, Any]]:
    """Search for any user across all gyms."""
    await set_rls_context(db, role=Role.SUPER_ADMIN.value)
    stmt = select(User).where(
        (User.email.ilike(f"%{q}%")) | (User.full_name.ilike(f"%{q}%"))
    ).limit(50)
    result = await db.execute(stmt)
    users = result.scalars().all()
    
    return [
        {
            "id": u.id,
            "email": u.email,
            "full_name": u.full_name,
            "role": u.role,
            "gym_id": u.gym_id,
        }
        for u in users
    ]

@router.post("/users/{user_id}/impersonate")
async def impersonate_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    """Generate impersonation tokens for a specific user (Super-Admin only)."""
    await set_rls_context(db, role=Role.SUPER_ADMIN.value)
    
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    # Log the impersonation event
    audit = AuditLog(
        gym_id=user.gym_id,
        action="USER_IMPERSONATED",
        target_id=str(user.id),
        details=f"Super-Admin impersonated user: {user.email}",
    )
    db.add(audit)
    await db.commit()
    
    access_token = create_access_token(
        subject=user.id,
        gym_id=str(user.gym_id),
        home_branch_id=str(user.home_branch_id) if user.home_branch_id else None,
        is_impersonated=True
    )
    refresh_token = create_refresh_token(
        subject=user.id,
        gym_id=str(user.gym_id),
        home_branch_id=str(user.home_branch_id) if user.home_branch_id else None,
        is_impersonated=True
    )
    
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role
        }
    }
