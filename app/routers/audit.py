from typing import Annotated
import csv
import io
from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import or_, select
from pydantic import BaseModel
import uuid
from datetime import datetime

from app.database import get_db
from app.database import set_rls_context
from app.auth import dependencies
from app.models.user import User
from app.models.enums import Role
from app.models.audit import AuditLog
from app.core.responses import StandardResponse
from app.services.tenancy_service import TenancyService
from app.security_audit.models import SecurityAuditResponse
from app.security_audit import collect_security_audit

router = APIRouter()


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


async def _fetch_audit_logs(
    *,
    db: AsyncSession,
    current_user: User,
    branch_id: uuid.UUID | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[AuditLog]:
    snapshot = _snapshot_rls_context(db)
    try:
        await set_rls_context(
            db,
            role=Role.ADMIN.value,
            gym_id=str(current_user.gym_id),
            branch_id=str(current_user.home_branch_id) if current_user.home_branch_id else "",
        )

        stmt = select(AuditLog).where(AuditLog.gym_id == current_user.gym_id)

        branch_ids = await TenancyService.branch_scope_ids(
            db,
            current_user=current_user,
            branch_id=branch_id,
            allow_all_for_admin=True,
        )
        if branch_ids:
            stmt = stmt.where(or_(AuditLog.branch_id.is_(None), AuditLog.branch_id.in_(branch_ids)))

        stmt = stmt.order_by(AuditLog.timestamp.desc()).offset(offset).limit(limit)
        result = await db.execute(stmt)
        return list(result.scalars().all())
    finally:
        await _restore_rls_context(db, snapshot)

class AuditLogResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID | None
    branch_id: uuid.UUID | None
    action: str
    target_id: str | None
    timestamp: datetime
    details: str | None
    
    # Optionally include the user details if needed:
    # user_name: str | None

    class Config:
        from_attributes = True

@router.get("/logs", response_model=StandardResponse[list[AuditLogResponse]])
async def get_audit_logs(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.MANAGER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    branch_id: Annotated[uuid.UUID | None, Query()] = None,
    limit: int = 50,
    offset: int = 0
):
    """Retrieve the most recent audit logs (Admin/Manager only)."""
    logs = await _fetch_audit_logs(db=db, current_user=current_user, branch_id=branch_id, limit=limit, offset=offset)
    return StandardResponse(data=[AuditLogResponse.model_validate(log) for log in logs])


@router.get("/logs/export")
async def export_audit_logs(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.MANAGER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    branch_id: Annotated[uuid.UUID | None, Query()] = None,
    limit: int = 500,
):
    logs = await _fetch_audit_logs(db=db, current_user=current_user, branch_id=branch_id, limit=limit, offset=0)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["timestamp", "action", "user_id", "target_id", "details", "branch_id"])
    for log in logs:
        writer.writerow([
            log.timestamp.isoformat() if log.timestamp else "",
            log.action,
            str(log.user_id) if log.user_id else "",
            log.target_id or "",
            log.details or "",
            str(log.branch_id) if log.branch_id else "",
        ])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=audit_logs_report.csv"},
    )


@router.get("/security", response_model=StandardResponse[SecurityAuditResponse])
async def get_security_audit(
    request: Request,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.SUPER_ADMIN]))],
):
    del current_user
    report = collect_security_audit(request.app)
    return StandardResponse(data=report)
