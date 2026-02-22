from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import dependencies
from app.core.responses import StandardResponse
from app.database import get_db
from app.models.enums import Role
from app.models.notification import WhatsAppDeliveryLog
from app.models.user import User

router = APIRouter()


@router.get("/whatsapp-logs", response_model=StandardResponse)
async def list_whatsapp_logs(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    status: str | None = Query(None),
    event_type: str | None = Query(None),
    from_date: datetime | None = Query(None),
    to_date: datetime | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
):
    stmt = select(WhatsAppDeliveryLog).order_by(WhatsAppDeliveryLog.created_at.desc()).limit(limit)
    if status:
        stmt = stmt.where(WhatsAppDeliveryLog.status == status)
    if event_type:
        stmt = stmt.where(WhatsAppDeliveryLog.event_type == event_type)
    if from_date:
        stmt = stmt.where(WhatsAppDeliveryLog.created_at >= from_date)
    if to_date:
        stmt = stmt.where(WhatsAppDeliveryLog.created_at <= to_date)

    result = await db.execute(stmt)
    rows = result.scalars().all()
    data = [
        {
            "id": str(row.id),
            "user_id": str(row.user_id) if row.user_id else None,
            "phone_number": row.phone_number,
            "template_key": row.template_key,
            "event_type": row.event_type,
            "event_ref": row.event_ref,
            "status": row.status,
            "provider_message_id": row.provider_message_id,
            "error_message": row.error_message,
            "attempt_count": row.attempt_count,
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "sent_at": row.sent_at.isoformat() if row.sent_at else None,
            "failed_at": row.failed_at.isoformat() if row.failed_at else None,
        }
        for row in rows
    ]
    return StandardResponse(data=data)
