from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import dependencies
from app.core.responses import StandardResponse
from app.database import get_db
from app.models.announcement import Announcement
from app.models.branch_hours import BranchOperatingHour
from app.models.enums import Role
from app.models.tenancy import Branch
from app.models.user import User
from app.services.branch_hours_service import (
    branch_hours_changed,
    format_hours_announcement,
    parse_clock_value,
    serialize_branch_hours,
)
from app.services.push_service import PushNotificationService
from app.services.tenancy_service import TenancyService

router = APIRouter()


class BranchHoursDayPayload(BaseModel):
    weekday: int = Field(ge=0, le=6)
    is_closed: bool = False
    open_time: str | None = Field(default=None, pattern=r"^(?:[01]?\d|2[0-3]):[0-5]\d$")
    close_time: str | None = Field(default=None, pattern=r"^(?:[01]?\d|2[0-3]):[0-5]\d$")
    note: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def _validate_times(self):
        if not self.is_closed and (self.open_time is None or self.close_time is None):
            raise ValueError("open_time and close_time are required for open days")
        return self


class BranchHoursSavePayload(BaseModel):
    branch_id: uuid.UUID
    days: list[BranchHoursDayPayload] = Field(min_length=7, max_length=7)


class BranchHoursDayResponse(BaseModel):
    weekday: int
    is_closed: bool
    open_time: str | None = None
    close_time: str | None = None
    note: str | None = None


class BranchHoursBranchResponse(BaseModel):
    id: str
    name: str
    display_name: str | None = None
    code: str
    slug: str
    timezone: str


class BranchHoursSummaryResponse(BaseModel):
    current_weekday: int
    current_is_closed: bool
    current_open_time: str | None = None
    current_close_time: str | None = None
    current_note: str | None = None
    updated_at: str | None = None


class BranchHoursResponse(BaseModel):
    branch: BranchHoursBranchResponse
    summary: BranchHoursSummaryResponse
    days: list[BranchHoursDayResponse]


def _serialize_response(branch, rows) -> dict[str, Any]:
    return serialize_branch_hours(branch, rows)


async def _load_branch_for_user(
    db: AsyncSession,
    *,
    current_user: User,
    branch_id: uuid.UUID | None,
) -> Branch:
    if branch_id is None:
        if current_user.home_branch_id is None:
            raise HTTPException(status_code=400, detail="branch_id is required")
        branch_id = current_user.home_branch_id
    if current_user.role == Role.SUPER_ADMIN:
        branch = await db.get(Branch, branch_id)
        if branch is None or branch.gym_id != current_user.gym_id:
            raise HTTPException(status_code=404, detail="Branch not found")
        return branch
    return await TenancyService.require_branch_access(db, current_user=current_user, branch_id=branch_id, allow_all_for_admin=True)


async def _get_branch_hours_rows(db: AsyncSession, branch_id: uuid.UUID) -> list[BranchOperatingHour]:
    rows = (
        await db.execute(
            select(BranchOperatingHour)
            .options(selectinload(BranchOperatingHour.branch))
            .where(BranchOperatingHour.branch_id == branch_id)
            .order_by(BranchOperatingHour.weekday.asc())
        )
    ).scalars().all()
    return list(rows)


async def _create_hours_announcement(
    *,
    db: AsyncSession,
    branch,
    current_user: User,
    rows: list[dict[str, Any]],
    locale: str,
) -> None:
    if not rows:
        return
    title, body = format_hours_announcement(branch, rows, locale)
    announcement = Announcement(
        gym_id=branch.gym_id,
        title=title,
        body=body,
        audience="ALL",
        target_scope="BRANCH",
        branch_id=branch.id,
        is_published=True,
        push_enabled=True,
        published_at=datetime.now(timezone.utc),
        created_by_user_id=current_user.id,
    )
    db.add(announcement)
    await db.flush()
    await db.commit()
    recipients = (
        await db.execute(
            select(User).where(
                User.gym_id == branch.gym_id,
                User.is_active.is_(True),
                User.home_branch_id == branch.id,
            )
        )
    ).scalars().all()
    for recipient in recipients:
        await PushNotificationService.queue_and_send(
            db=db,
            user=recipient,
            title=title,
            body=body,
            template_key="announcement",
            event_type="ANNOUNCEMENT_PUBLISHED",
            event_ref=str(announcement.id),
            params={"message": body, "audience": "ALL"},
            idempotency_key=f"hours-{branch.id}-{recipient.id}-{announcement.id}",
            scope="BRANCH",
            scope_branch_id=str(branch.id),
        )


async def _load_branch_hours(
    *,
    current_user: User,
    db: AsyncSession,
    branch_id: uuid.UUID | None = None,
) -> BranchHoursResponse:
    branch = await _load_branch_for_user(db, current_user=current_user, branch_id=branch_id)
    rows = await _get_branch_hours_rows(db, branch.id)
    payload = _serialize_response(branch, rows)
    return BranchHoursResponse(**payload)


@router.get("/branch-hours/current", response_model=StandardResponse)
async def read_current_branch_hours(
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    branch_id: uuid.UUID | None = Query(default=None),
):
    return StandardResponse(data=(await _load_branch_hours(current_user=current_user, db=db, branch_id=branch_id)).model_dump())


@router.get("/admin/branch-hours", response_model=StandardResponse)
async def read_admin_branch_hours(
    current_user: Annotated[User, Depends(dependencies.get_current_manager)],
    db: Annotated[AsyncSession, Depends(get_db)],
    branch_id: uuid.UUID | None = Query(default=None),
):
    return StandardResponse(data=(await _load_branch_hours(current_user=current_user, db=db, branch_id=branch_id)).model_dump())


@router.put("/admin/branch-hours", response_model=StandardResponse)
async def save_admin_branch_hours(
    payload: BranchHoursSavePayload,
    current_user: Annotated[User, Depends(dependencies.get_current_manager)],
    db: Annotated[AsyncSession, Depends(get_db)],
    locale: str = Query(default="en"),
):
    branch = await _load_branch_for_user(db, current_user=current_user, branch_id=payload.branch_id)
    current_rows = await _get_branch_hours_rows(db, branch.id)
    incoming_rows = sorted([row.model_dump() for row in payload.days], key=lambda item: item["weekday"])

    if not branch_hours_changed(current_rows, incoming_rows):
        return StandardResponse(data=(await _load_branch_hours(current_user=current_user, db=db, branch_id=branch.id)).model_dump())

    await db.execute(delete(BranchOperatingHour).where(BranchOperatingHour.branch_id == branch.id))
    for row in payload.days:
        open_time = parse_clock_value(row.open_time) if row.open_time else None
        close_time = parse_clock_value(row.close_time) if row.close_time else None
        db.add(
            BranchOperatingHour(
                gym_id=branch.gym_id,
                branch_id=branch.id,
                weekday=row.weekday,
                is_closed=row.is_closed,
                open_time=open_time,
                close_time=close_time,
                note=row.note.strip() if row.note else None,
            )
        )
    await db.flush()
    await db.commit()
    await _create_hours_announcement(db=db, branch=branch, current_user=current_user, rows=incoming_rows, locale=locale)
    return StandardResponse(data=(await _load_branch_hours(current_user=current_user, db=db, branch_id=branch.id)).model_dump())
