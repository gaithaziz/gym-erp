from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import dependencies
from app.core.responses import StandardResponse
from app.database import get_db
from app.models.enums import Role
from app.models.notification import WhatsAppAutomationRule, WhatsAppDeliveryLog
from app.models.user import User

router = APIRouter()


class WhatsAppAutomationRuleUpdate(BaseModel):
    trigger_name: str = Field(min_length=2, max_length=120)
    template_key: str = Field(min_length=2, max_length=120)
    message_template: str | None = Field(default=None, max_length=5000)
    is_enabled: bool


class WhatsAppAutomationRuleCreate(WhatsAppAutomationRuleUpdate):
    event_type: str = Field(min_length=2, max_length=120, pattern=r"^[A-Z0-9_]+$")


def _automation_manager_roles() -> list[Role]:
    return [Role.ADMIN, Role.RECEPTION, Role.FRONT_DESK]


SYSTEM_EVENT_TYPES = {
    "ACCESS_GRANTED",
    "SUBSCRIPTION_CREATED",
    "SUBSCRIPTION_RENEWED",
    "SUBSCRIPTION_STATUS_CHANGED",
}


@router.get("/whatsapp-logs", response_model=StandardResponse)
async def list_whatsapp_logs(
    current_user: Annotated[User, Depends(dependencies.RoleChecker(_automation_manager_roles()))],
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


@router.get("/automation-rules", response_model=StandardResponse)
async def list_automation_rules(
    current_user: Annotated[User, Depends(dependencies.RoleChecker(_automation_manager_roles()))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    stmt = select(WhatsAppAutomationRule).order_by(WhatsAppAutomationRule.event_type.asc())
    result = await db.execute(stmt)
    rules = result.scalars().all()
    data = [
        {
            "id": str(rule.id),
            "event_type": rule.event_type,
            "trigger_name": rule.trigger_name,
            "template_key": rule.template_key,
            "message_template": rule.message_template,
            "is_enabled": rule.is_enabled,
            "updated_at": rule.updated_at.isoformat() if rule.updated_at else None,
            "updated_by": str(rule.updated_by) if rule.updated_by else None,
        }
        for rule in rules
    ]
    return StandardResponse(data=data)


@router.post("/automation-rules", response_model=StandardResponse)
async def create_automation_rule(
    payload: WhatsAppAutomationRuleCreate,
    current_user: Annotated[User, Depends(dependencies.RoleChecker(_automation_manager_roles()))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    event_type = payload.event_type.strip().upper()
    existing = await db.execute(
        select(WhatsAppAutomationRule).where(WhatsAppAutomationRule.event_type == event_type)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Automation rule already exists for this event_type")

    rule = WhatsAppAutomationRule(
        event_type=event_type,
        trigger_name=payload.trigger_name.strip(),
        template_key=payload.template_key.strip(),
        message_template=payload.message_template.strip() if payload.message_template else None,
        is_enabled=payload.is_enabled,
        updated_by=current_user.id,
        updated_at=datetime.utcnow(),
    )
    db.add(rule)
    await db.commit()

    return StandardResponse(
        message="Automation rule created",
        data={
            "id": str(rule.id),
            "event_type": rule.event_type,
            "trigger_name": rule.trigger_name,
            "template_key": rule.template_key,
            "message_template": rule.message_template,
            "is_enabled": rule.is_enabled,
        },
    )


@router.put("/automation-rules/{event_type}", response_model=StandardResponse)
async def update_automation_rule(
    event_type: str,
    payload: WhatsAppAutomationRuleUpdate,
    current_user: Annotated[User, Depends(dependencies.RoleChecker(_automation_manager_roles()))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(
        select(WhatsAppAutomationRule).where(WhatsAppAutomationRule.event_type == event_type)
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Automation rule not found")

    rule.trigger_name = payload.trigger_name.strip()
    rule.template_key = payload.template_key.strip()
    rule.message_template = payload.message_template.strip() if payload.message_template else None
    rule.is_enabled = payload.is_enabled
    rule.updated_at = datetime.utcnow()
    rule.updated_by = current_user.id
    await db.commit()

    return StandardResponse(
        message="Automation rule updated",
        data={
            "event_type": rule.event_type,
            "trigger_name": rule.trigger_name,
            "template_key": rule.template_key,
            "message_template": rule.message_template,
            "is_enabled": rule.is_enabled,
        },
    )


@router.delete("/automation-rules/{event_type}", response_model=StandardResponse)
async def delete_automation_rule(
    event_type: str,
    current_user: Annotated[User, Depends(dependencies.RoleChecker(_automation_manager_roles()))],
    db: Annotated[AsyncSession, Depends(get_db)],
    force: bool = Query(False),
):
    normalized_event_type = event_type.strip().upper()
    result = await db.execute(
        select(WhatsAppAutomationRule).where(WhatsAppAutomationRule.event_type == normalized_event_type)
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Automation rule not found")

    if normalized_event_type in SYSTEM_EVENT_TYPES and not force:
        raise HTTPException(
            status_code=400,
            detail="System trigger rule cannot be deleted without force=true",
        )

    await db.delete(rule)
    await db.commit()
    return StandardResponse(message="Automation rule deleted", data={"event_type": normalized_event_type})
