from typing import Annotated
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
import uuid
from datetime import datetime

from app.database import get_db
from app.auth import dependencies
from app.models.user import User
from app.models.enums import Role
from app.models.audit import AuditLog
from app.core.responses import StandardResponse
from app.services.tenancy_service import TenancyService
from app.security_audit.models import SecurityAuditResponse
from app.security_audit import collect_security_audit

router = APIRouter()

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
    from app.services.tenancy_service import TenancyService
    stmt = select(AuditLog).order_by(AuditLog.timestamp.desc())

    branch_ids = await TenancyService.branch_scope_ids(
        db,
        current_user=current_user,
        branch_id=branch_id,
        allow_all_for_admin=True,
    )
    if branch_ids:
        stmt = stmt.where(AuditLog.branch_id.in_(branch_ids))

    stmt = stmt.limit(limit)
    result = await db.execute(stmt)
    logs = result.scalars().all()
    
    return StandardResponse(data=[AuditLogResponse.model_validate(log) for log in logs])


@router.get("/security", response_model=StandardResponse[SecurityAuditResponse])
async def get_security_audit(
    request: Request,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.SUPER_ADMIN]))],
):
    del current_user
    report = collect_security_audit(request.app)
    return StandardResponse(data=report)
