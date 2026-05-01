from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import dependencies
from app.core.responses import StandardResponse
from app.database import get_db
from app.models.announcement import Announcement
from app.models.enums import Role
from app.models.user import User
from app.services.push_service import PushNotificationService

router = APIRouter()

AnnouncementAudience = Literal["ALL", "CUSTOMERS", "COACHES", "STAFF"]


class AnnouncementPayload(BaseModel):
    title: str = Field(min_length=2, max_length=255)
    body: str = Field(min_length=2, max_length=5000)
    audience: AnnouncementAudience = "ALL"
    push_enabled: bool = True


class AnnouncementUpdatePayload(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=255)
    body: str | None = Field(default=None, min_length=2, max_length=5000)
    audience: AnnouncementAudience | None = None
    push_enabled: bool | None = None
    is_published: bool | None = None


def _announcement_to_payload(row: Announcement) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "title": row.title,
        "body": row.body,
        "audience": row.audience,
        "is_published": row.is_published,
        "push_enabled": row.push_enabled,
        "published_at": row.published_at.isoformat() if row.published_at else None,
        "created_by_user_id": str(row.created_by_user_id) if row.created_by_user_id else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def _visible_to_role(audience: str, role: Role) -> bool:
    if audience == "ALL":
        return True
    if audience == "CUSTOMERS":
        return role == Role.CUSTOMER
    if audience == "COACHES":
        return role == Role.COACH
    if audience == "STAFF":
        return role != Role.CUSTOMER
    return False


async def _recipient_users(db: AsyncSession, gym_id: uuid.UUID, audience: str) -> list[User]:
    stmt = select(User).where(User.gym_id == gym_id, User.is_active.is_(True))
    if audience == "CUSTOMERS":
        stmt = stmt.where(User.role == Role.CUSTOMER)
    elif audience == "COACHES":
        stmt = stmt.where(User.role == Role.COACH)
    elif audience == "STAFF":
        stmt = stmt.where(User.role != Role.CUSTOMER)
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows)


async def _push_announcement(db: AsyncSession, announcement: Announcement, recipients: list[User]) -> None:
    for recipient in recipients:
        await PushNotificationService.queue_and_send(
            db=db,
            user=recipient,
            title=announcement.title,
            body=announcement.body,
            template_key="announcement",
            event_type="ANNOUNCEMENT_PUBLISHED",
            event_ref=str(announcement.id),
            params={"message": announcement.body, "audience": announcement.audience},
            idempotency_key=f"announcement-{announcement.id}-{recipient.id}",
        )


@router.get("/announcements", response_model=StandardResponse)
async def list_announcements(
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    audience: AnnouncementAudience | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
):
    stmt = select(Announcement).where(
        Announcement.gym_id == current_user.gym_id,
        Announcement.is_published.is_(True),
    ).order_by(Announcement.published_at.desc().nullslast(), Announcement.updated_at.desc()).limit(limit)
    if audience:
        stmt = stmt.where(Announcement.audience == audience)
    rows = list((await db.execute(stmt)).scalars().all())
    visible = [row for row in rows if _visible_to_role(row.audience, current_user.role)]
    return StandardResponse(data=[_announcement_to_payload(row) for row in visible])


@router.get("/admin/announcements", response_model=StandardResponse)
async def list_admin_announcements(
    current_user: Annotated[User, Depends(dependencies.get_current_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    rows = (
        await db.execute(
            select(Announcement)
            .where(Announcement.gym_id == current_user.gym_id)
            .order_by(Announcement.updated_at.desc())
        )
    ).scalars().all()
    return StandardResponse(data=[_announcement_to_payload(row) for row in rows])


@router.post("/admin/announcements", response_model=StandardResponse)
async def create_announcement(
    payload: AnnouncementPayload,
    current_user: Annotated[User, Depends(dependencies.get_current_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    announcement = Announcement(
        gym_id=current_user.gym_id,
        title=payload.title.strip(),
        body=payload.body.strip(),
        audience=payload.audience,
        is_published=True,
        push_enabled=payload.push_enabled,
        published_at=datetime.now(timezone.utc),
        created_by_user_id=current_user.id,
    )
    db.add(announcement)
    await db.commit()
    await db.refresh(announcement)
    if announcement.push_enabled:
        recipients = await _recipient_users(db, current_user.gym_id, announcement.audience)
        await _push_announcement(db, announcement, recipients)
    return StandardResponse(data=_announcement_to_payload(announcement))


@router.patch("/admin/announcements/{announcement_id}", response_model=StandardResponse)
async def update_announcement(
    announcement_id: uuid.UUID,
    payload: AnnouncementUpdatePayload,
    current_user: Annotated[User, Depends(dependencies.get_current_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(
        select(Announcement).where(
            Announcement.id == announcement_id,
            Announcement.gym_id == current_user.gym_id,
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Announcement not found")
    if payload.title is not None:
        row.title = payload.title.strip()
    if payload.body is not None:
        row.body = payload.body.strip()
    if payload.audience is not None:
        row.audience = payload.audience
    if payload.push_enabled is not None:
        row.push_enabled = payload.push_enabled
    if payload.is_published is not None:
        row.is_published = payload.is_published
        row.published_at = datetime.now(timezone.utc) if payload.is_published else None
    await db.commit()
    await db.refresh(row)
    return StandardResponse(data=_announcement_to_payload(row))


@router.post("/admin/announcements/{announcement_id}/publish", response_model=StandardResponse)
async def publish_announcement(
    announcement_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.get_current_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(
        select(Announcement).where(
            Announcement.id == announcement_id,
            Announcement.gym_id == current_user.gym_id,
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Announcement not found")
    row.is_published = True
    row.published_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(row)
    if row.push_enabled:
        recipients = await _recipient_users(db, current_user.gym_id, row.audience)
        await _push_announcement(db, row, recipients)
    return StandardResponse(data=_announcement_to_payload(row))
