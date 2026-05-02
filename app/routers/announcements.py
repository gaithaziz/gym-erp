from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import dependencies
from app.core.responses import StandardResponse
from app.database import get_db
from app.models.announcement import Announcement
from app.models.enums import Role
from app.models.tenancy import Branch
from app.models.user import User
from app.services.tenancy_service import TenancyService
from app.services.push_service import PushNotificationService

router = APIRouter()

AnnouncementAudience = Literal["ALL", "CUSTOMERS", "COACHES", "STAFF"]
AnnouncementTargetScope = Literal["ALL_BRANCHES", "BRANCH"]


class AnnouncementPayload(BaseModel):
    title: str = Field(min_length=2, max_length=255)
    body: str = Field(min_length=2, max_length=5000)
    audience: AnnouncementAudience = "ALL"
    target_scope: AnnouncementTargetScope = "ALL_BRANCHES"
    branch_id: uuid.UUID | None = None
    push_enabled: bool = True


class AnnouncementUpdatePayload(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=255)
    body: str | None = Field(default=None, min_length=2, max_length=5000)
    audience: AnnouncementAudience | None = None
    target_scope: AnnouncementTargetScope | None = None
    branch_id: uuid.UUID | None = None
    push_enabled: bool | None = None
    is_published: bool | None = None


def _announcement_to_payload(row: Announcement) -> dict[str, Any]:
    branch_name = None
    if row.branch is not None:
        branch_name = row.branch.display_name or row.branch.name
    return {
        "id": str(row.id),
        "title": row.title,
        "body": row.body,
        "audience": row.audience,
        "target_scope": row.target_scope,
        "branch_id": str(row.branch_id) if row.branch_id else None,
        "branch_name": branch_name,
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


def _visible_to_user(announcement: Announcement, current_user: User) -> bool:
    if not _visible_to_role(announcement.audience, current_user.role):
        return False
    if announcement.target_scope == "ALL_BRANCHES":
        return True
    if announcement.target_scope == "BRANCH":
        return announcement.branch_id is not None and announcement.branch_id == current_user.home_branch_id
    return True


async def _load_announcement_with_branch(db: AsyncSession, announcement_id: uuid.UUID, gym_id: uuid.UUID) -> Announcement:
    result = await db.execute(
        select(Announcement).options(selectinload(Announcement.branch)).where(
            Announcement.id == announcement_id,
            Announcement.gym_id == gym_id,
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Announcement not found")
    return row


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


async def _announcement_recipients(
    db: AsyncSession,
    announcement: Announcement,
) -> list[User]:
    stmt = select(User).where(User.gym_id == announcement.gym_id, User.is_active.is_(True))
    if announcement.audience == "CUSTOMERS":
        stmt = stmt.where(User.role == Role.CUSTOMER)
    elif announcement.audience == "COACHES":
        stmt = stmt.where(User.role == Role.COACH)
    elif announcement.audience == "STAFF":
        stmt = stmt.where(User.role != Role.CUSTOMER)
    if announcement.target_scope == "BRANCH" and announcement.branch_id is not None:
        stmt = stmt.where(User.home_branch_id == announcement.branch_id)
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows)


async def _push_announcement(db: AsyncSession, announcement: Announcement, recipients: list[User]) -> None:
    scope = "BRANCH" if announcement.target_scope == "BRANCH" and announcement.branch_id is not None else "GLOBAL"
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
            scope=scope,
            scope_branch_id=str(announcement.branch_id) if scope == "BRANCH" else None,
        )


@router.get("/announcements", response_model=StandardResponse)
async def list_announcements(
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    audience: AnnouncementAudience | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
):
    stmt = select(Announcement).options(selectinload(Announcement.branch)).where(
        Announcement.gym_id == current_user.gym_id,
        Announcement.is_published.is_(True),
    ).order_by(Announcement.published_at.desc().nullslast(), Announcement.updated_at.desc()).limit(limit)
    if audience:
        stmt = stmt.where(Announcement.audience == audience)
    rows = list((await db.execute(stmt)).scalars().all())
    visible = [row for row in rows if _visible_to_user(row, current_user)]
    return StandardResponse(data=[_announcement_to_payload(row) for row in visible])


@router.get("/admin/announcements", response_model=StandardResponse)
async def list_admin_announcements(
    current_user: Annotated[User, Depends(dependencies.get_current_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    rows = (
        await db.execute(
            select(Announcement).options(selectinload(Announcement.branch))
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
    if payload.target_scope == "BRANCH" and payload.branch_id is None:
        raise HTTPException(status_code=400, detail="branch_id is required for branch-targeted announcements")
    resolved_branch_id = None
    if payload.target_scope == "BRANCH" and payload.branch_id is not None:
        branch = await TenancyService.require_branch_access(
            db,
            current_user=current_user,
            branch_id=payload.branch_id,
            allow_all_for_admin=True,
        )
        resolved_branch_id = branch.id
    announcement = Announcement(
        gym_id=current_user.gym_id,
        title=payload.title.strip(),
        body=payload.body.strip(),
        audience=payload.audience,
        target_scope=payload.target_scope,
        branch_id=resolved_branch_id,
        is_published=True,
        push_enabled=payload.push_enabled,
        published_at=datetime.now(timezone.utc),
        created_by_user_id=current_user.id,
    )
    db.add(announcement)
    await db.commit()
    announcement = await _load_announcement_with_branch(db, announcement.id, current_user.gym_id)
    if announcement.push_enabled:
        recipients = await _announcement_recipients(db, announcement)
        await _push_announcement(db, announcement, recipients)
    return StandardResponse(data=_announcement_to_payload(announcement))


@router.patch("/admin/announcements/{announcement_id}", response_model=StandardResponse)
async def update_announcement(
    announcement_id: uuid.UUID,
    payload: AnnouncementUpdatePayload,
    current_user: Annotated[User, Depends(dependencies.get_current_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    row = await _load_announcement_with_branch(db, announcement_id, current_user.gym_id)
    if payload.title is not None:
        row.title = payload.title.strip()
    if payload.body is not None:
        row.body = payload.body.strip()
    if payload.audience is not None:
        row.audience = payload.audience
    if payload.target_scope is not None:
        row.target_scope = payload.target_scope
    if row.target_scope == "BRANCH":
        target_branch_id = payload.branch_id or row.branch_id
        if target_branch_id is None:
            raise HTTPException(status_code=400, detail="branch_id is required for branch-targeted announcements")
        branch = await TenancyService.require_branch_access(
            db,
            current_user=current_user,
            branch_id=target_branch_id,
            allow_all_for_admin=True,
        )
        row.branch_id = branch.id
    elif payload.target_scope == "ALL_BRANCHES":
        row.branch_id = None
    if payload.push_enabled is not None:
        row.push_enabled = payload.push_enabled
    if payload.is_published is not None:
        row.is_published = payload.is_published
        row.published_at = datetime.now(timezone.utc) if payload.is_published else None
    await db.commit()
    row = await _load_announcement_with_branch(db, announcement_id, current_user.gym_id)
    return StandardResponse(data=_announcement_to_payload(row))


@router.post("/admin/announcements/{announcement_id}/publish", response_model=StandardResponse)
async def publish_announcement(
    announcement_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.get_current_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    row = await _load_announcement_with_branch(db, announcement_id, current_user.gym_id)
    row.is_published = True
    row.published_at = datetime.now(timezone.utc)
    await db.commit()
    row = await _load_announcement_with_branch(db, announcement_id, current_user.gym_id)
    if row.push_enabled:
        recipients = await _announcement_recipients(db, row)
        await _push_announcement(db, row, recipients)
    return StandardResponse(data=_announcement_to_payload(row))
