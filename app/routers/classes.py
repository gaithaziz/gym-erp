"""
Class Schedules & Reservations API Router
==========================================
Staff (Admin / Manager / Coach) — full session management + reservation approvals
Customer (Member)                — browse upcoming + request reservation
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.services.push_service import PushNotificationService
from app.models.classes import (
    ClassReservation,
    ClassReservationStatus,
    ClassSession,
    ClassSessionStatus,
    ClassTemplate,
)
from app.models.enums import Role
from app.models.user import User

router = APIRouter()

# ---------------------------------------------------------------------------
# Helpers / Dependencies
# ---------------------------------------------------------------------------

DbDep = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]

STAFF_ROLES = {Role.ADMIN, Role.MANAGER, Role.COACH}
ADMIN_MANAGER_ROLES = {Role.ADMIN, Role.MANAGER}
# Roles that can be assigned as a session coach
COACH_ELIGIBLE_ROLES = {Role.ADMIN, Role.MANAGER, Role.COACH}


def _require_roles(allowed: set[Role]):
    async def _dep(current_user: CurrentUser):
        if current_user.role not in allowed:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return current_user
    return _dep


RequireStaff = Annotated[User, Depends(_require_roles(STAFF_ROLES))]
RequireAdminManager = Annotated[User, Depends(_require_roles(ADMIN_MANAGER_ROLES))]


async def _get_session_or_404(session_id: uuid.UUID, db: AsyncSession) -> ClassSession:
    result = await db.execute(
        select(ClassSession)
        .where(ClassSession.id == session_id)
        .options(selectinload(ClassSession.template), selectinload(ClassSession.coach))
    )
    obj = result.scalar_one_or_none()
    if obj is None:
        raise HTTPException(status_code=404, detail="Class session not found")
    return obj


async def _get_template_or_404(template_id: uuid.UUID, db: AsyncSession) -> ClassTemplate:
    result = await db.execute(select(ClassTemplate).where(ClassTemplate.id == template_id))
    obj = result.scalar_one_or_none()
    if obj is None:
        raise HTTPException(status_code=404, detail="Class template not found")
    return obj


async def _reservation_count(session_id: uuid.UUID, db: AsyncSession) -> int:
    """Count confirmed (RESERVED) reservations for a session."""
    result = await db.execute(
        select(func.count(ClassReservation.id)).where(
            ClassReservation.session_id == session_id,
            ClassReservation.status == ClassReservationStatus.RESERVED,
        )
    )
    return result.scalar_one() or 0


async def _pending_count(session_id: uuid.UUID, db: AsyncSession) -> int:
    result = await db.execute(
        select(func.count(ClassReservation.id)).where(
            ClassReservation.session_id == session_id,
            ClassReservation.status == ClassReservationStatus.PENDING,
        )
    )
    return result.scalar_one() or 0


async def _waitlist_count(session_id: uuid.UUID, db: AsyncSession) -> int:
    result = await db.execute(
        select(func.count(ClassReservation.id)).where(
            ClassReservation.session_id == session_id,
            ClassReservation.status == ClassReservationStatus.WAITLISTED,
        )
    )
    return result.scalar_one() or 0


async def _get_coach_or_400(coach_id: uuid.UUID, db: AsyncSession) -> User:
    """Validate that the assigned coach has an eligible role."""
    result = await db.execute(select(User).where(User.id == coach_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=400, detail="Assigned user not found")
    if user.role not in COACH_ELIGIBLE_ROLES:
        raise HTTPException(
            status_code=400,
            detail=f"User role '{user.role}' is not eligible to be assigned as a coach for a session"
        )
    return user


# ---------------------------------------------------------------------------
# Notification stub — wire into existing push infra when ready
# ---------------------------------------------------------------------------

async def _notify_reservation_update(
    member_id: uuid.UUID,
    new_status: ClassReservationStatus,
    session: ClassSession,
    db: AsyncSession,
) -> None:
    """
    Send a push notification to the member about their reservation status change.
    Integrates with the existing MobileDevice / PushDeliveryLog infra.
    """
    user = await db.get(User, member_id)
    if not user:
        return

    # Ensure template is loaded
    await db.refresh(session, ["template"])
    class_name = session.template.name if session.template else "Group Class"

    title = "Class Reservation"
    if new_status == ClassReservationStatus.RESERVED:
        body = f"Confirmed! You're in for {class_name}."
    elif new_status == ClassReservationStatus.WAITLISTED:
        body = f"You're on the waitlist for {class_name}."
    elif new_status == ClassReservationStatus.REJECTED:
        body = f"Your spot for {class_name} was not approved."
    else:
        body = f"Your {class_name} reservation is {new_status.value.lower()}."

    await PushNotificationService.queue_and_send(
        db=db,
        user=user,
        title=title,
        body=body,
        template_key="class_res_update",
        event_type="CLASS_RESERVATION",
        event_ref=str(session.id),
        params={"session_id": str(session.id), "status": new_status.value},
        idempotency_key=f"class-res-{member_id}-{session.id}-{new_status.value}",
    )


# ===========================================================================
# Pydantic Schemas
# ===========================================================================

class TemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    category: str | None = None
    duration_minutes: int = Field(60, ge=5, le=480)
    capacity: int = Field(20, ge=1, le=500)
    color: str | None = Field(None, max_length=20)


class TemplateUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None
    category: str | None = None
    duration_minutes: int | None = Field(None, ge=5, le=480)
    capacity: int | None = Field(None, ge=1, le=500)
    color: str | None = Field(None, max_length=20)
    is_active: bool | None = None


class TemplateOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    category: str | None
    duration_minutes: int
    capacity: int
    color: str | None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class SessionCreate(BaseModel):
    template_id: uuid.UUID
    coach_id: uuid.UUID
    starts_at: datetime
    capacity_override: int | None = Field(None, ge=1, le=500)
    notes: str | None = None
    # Recurring: if set, creates this many additional weekly copies
    recur_weekly_count: int | None = Field(None, ge=1, le=52, description="Create N additional weekly sessions after this one")


class SessionUpdate(BaseModel):
    coach_id: uuid.UUID | None = None
    starts_at: datetime | None = None
    capacity_override: int | None = Field(None, ge=1, le=500)
    notes: str | None = None
    status: ClassSessionStatus | None = None


class SessionOut(BaseModel):
    id: uuid.UUID
    template_id: uuid.UUID
    template_name: str
    coach_id: uuid.UUID
    coach_name: str | None
    starts_at: datetime
    ends_at: datetime
    capacity: int
    capacity_override: int | None
    status: ClassSessionStatus
    notes: str | None
    reserved_count: int = 0
    pending_count: int = 0
    waitlist_count: int = 0

    model_config = {"from_attributes": True}


class ReservationOut(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    member_id: uuid.UUID
    member_name: str | None
    status: ClassReservationStatus
    attended: bool
    reserved_at: datetime
    cancelled_at: datetime | None

    model_config = {"from_attributes": True}


class AttendanceMark(BaseModel):
    member_id: uuid.UUID
    attended: bool


class AttendanceBulk(BaseModel):
    marks: list[AttendanceMark]


class ReservationApproveReject(BaseModel):
    reservation_ids: list[uuid.UUID]


# ---------------------------------------------------------------------------
# Helper: build SessionOut dict from ORM object
# ---------------------------------------------------------------------------

async def _session_out(session: ClassSession, db: AsyncSession) -> dict[str, Any]:
    reserved = await _reservation_count(session.id, db)
    pending = await _pending_count(session.id, db)
    waitlist = await _waitlist_count(session.id, db)
    cap = session.capacity_override if session.capacity_override is not None else session.template.capacity
    return {
        "id": session.id,
        "template_id": session.template_id,
        "template_name": session.template.name,
        "coach_id": session.coach_id,
        "coach_name": session.coach.full_name if session.coach else None,
        "starts_at": session.starts_at,
        "ends_at": session.ends_at,
        "capacity": cap,
        "capacity_override": session.capacity_override,
        "status": session.status,
        "notes": session.notes,
        "reserved_count": reserved,
        "pending_count": pending,
        "waitlist_count": waitlist,
    }


def _make_session(body: SessionCreate, starts_at: datetime, duration_minutes: int) -> ClassSession:
    ends_at = starts_at + timedelta(minutes=duration_minutes)
    return ClassSession(
        template_id=body.template_id,
        coach_id=body.coach_id,
        starts_at=starts_at,
        ends_at=ends_at,
        capacity_override=body.capacity_override,
        notes=body.notes,
        status=ClassSessionStatus.SCHEDULED,
    )


# ===========================================================================
# TEMPLATE ENDPOINTS (Staff visible; Admin/Manager manage)
# ===========================================================================

@router.get("/templates", response_model=list[TemplateOut])
async def list_templates(
    db: DbDep,
    _staff: RequireStaff,
    include_inactive: bool = Query(False),
):
    q = select(ClassTemplate)
    if not include_inactive:
        q = q.where(ClassTemplate.is_active.is_(True))
    q = q.order_by(ClassTemplate.name)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("/templates", response_model=TemplateOut, status_code=201)
async def create_template(body: TemplateCreate, db: DbDep, current_user: RequireAdminManager):
    tmpl = ClassTemplate(**body.model_dump(), created_by_id=current_user.id)
    db.add(tmpl)
    await db.commit()
    await db.refresh(tmpl)
    return tmpl


@router.put("/templates/{template_id}", response_model=TemplateOut)
async def update_template(
    template_id: uuid.UUID,
    body: TemplateUpdate,
    db: DbDep,
    _: RequireAdminManager,
):
    tmpl = await _get_template_or_404(template_id, db)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(tmpl, field, value)
    await db.commit()
    await db.refresh(tmpl)
    return tmpl


@router.delete("/templates/{template_id}", status_code=204)
async def deactivate_template(template_id: uuid.UUID, db: DbDep, _: RequireAdminManager):
    tmpl = await _get_template_or_404(template_id, db)
    tmpl.is_active = False
    await db.commit()


# ===========================================================================
# SESSION ENDPOINTS (Staff)
# ===========================================================================

@router.get("/sessions", response_model=list[SessionOut])
async def list_sessions(
    db: DbDep,
    current_user: RequireStaff,
    from_date: datetime | None = Query(None),
    to_date: datetime | None = Query(None),
    coach_id: uuid.UUID | None = Query(None),
    template_id: uuid.UUID | None = Query(None),
    session_status: ClassSessionStatus | None = Query(None, alias="status"),
):
    q = (
        select(ClassSession)
        .options(selectinload(ClassSession.template), selectinload(ClassSession.coach))
        .order_by(ClassSession.starts_at)
    )

    # Coaches only see their own sessions
    if current_user.role == Role.COACH:
        q = q.where(ClassSession.coach_id == current_user.id)
    elif coach_id:
        q = q.where(ClassSession.coach_id == coach_id)

    if from_date:
        q = q.where(ClassSession.starts_at >= from_date)
    else:
        q = q.where(ClassSession.starts_at >= datetime.now(timezone.utc) - timedelta(hours=1))

    if to_date:
        q = q.where(ClassSession.starts_at <= to_date)
    if template_id:
        q = q.where(ClassSession.template_id == template_id)
    if session_status:
        q = q.where(ClassSession.status == session_status)

    result = await db.execute(q)
    sessions = result.scalars().all()
    return [await _session_out(s, db) for s in sessions]


@router.post("/sessions", response_model=list[SessionOut], status_code=201)
async def create_session(body: SessionCreate, db: DbDep, current_user: RequireStaff):
    """
    Create one session (or a recurring weekly series if recur_weekly_count is set).
    Returns a list of all created sessions.
    """
    tmpl = await _get_template_or_404(body.template_id, db)
    await _get_coach_or_400(body.coach_id, db)

    # Coaches can only create sessions for themselves
    if current_user.role == Role.COACH and body.coach_id != current_user.id:
        raise HTTPException(status_code=403, detail="Coaches can only create sessions for themselves")

    sessions_to_create: list[ClassSession] = []
    recur_count = body.recur_weekly_count or 0

    for week_offset in range(recur_count + 1):
        starts = body.starts_at + timedelta(weeks=week_offset)
        sessions_to_create.append(_make_session(body, starts, tmpl.duration_minutes))

    for s in sessions_to_create:
        db.add(s)
    await db.commit()

    result = []
    for s in sessions_to_create:
        loaded = await _get_session_or_404(s.id, db)
        result.append(await _session_out(loaded, db))
    return result


@router.put("/sessions/{session_id}", response_model=SessionOut)
async def update_session(session_id: uuid.UUID, body: SessionUpdate, db: DbDep, current_user: RequireStaff):
    session = await _get_session_or_404(session_id, db)

    if current_user.role == Role.COACH and session.coach_id != current_user.id:
        raise HTTPException(status_code=403, detail="Coaches can only edit their own sessions")

    updates = body.model_dump(exclude_none=True)

    if "coach_id" in updates:
        await _get_coach_or_400(updates["coach_id"], db)

    if "starts_at" in updates:
        updates["ends_at"] = updates["starts_at"] + timedelta(minutes=session.template.duration_minutes)

    for field, value in updates.items():
        setattr(session, field, value)

    await db.commit()
    refreshed = await _get_session_or_404(session_id, db)
    return await _session_out(refreshed, db)


@router.post("/sessions/{session_id}/cancel", response_model=SessionOut)
async def cancel_session(session_id: uuid.UUID, db: DbDep, current_user: RequireAdminManager):
    session = await _get_session_or_404(session_id, db)
    if session.status == ClassSessionStatus.CANCELLED:
        raise HTTPException(status_code=400, detail="Session is already cancelled")
    session.status = ClassSessionStatus.CANCELLED
    now = datetime.now(timezone.utc)
    reservations_result = await db.execute(
        select(ClassReservation).where(
            ClassReservation.session_id == session_id,
            ClassReservation.status.in_(
                [ClassReservationStatus.PENDING, ClassReservationStatus.RESERVED, ClassReservationStatus.WAITLISTED]
            ),
        )
    )
    for res in reservations_result.scalars().all():
        res.status = ClassReservationStatus.CANCELLED
        res.cancelled_at = now
        await _notify_reservation_update(res.member_id, ClassReservationStatus.CANCELLED, session, db)

    await db.commit()
    refreshed = await _get_session_or_404(session_id, db)
    return await _session_out(refreshed, db)


@router.post("/sessions/{session_id}/complete", response_model=SessionOut)
async def complete_session(session_id: uuid.UUID, db: DbDep, current_user: RequireStaff):
    session = await _get_session_or_404(session_id, db)
    if current_user.role == Role.COACH and session.coach_id != current_user.id:
        raise HTTPException(status_code=403, detail="Cannot complete another coach's session")
    if session.status != ClassSessionStatus.SCHEDULED:
        raise HTTPException(status_code=400, detail=f"Session is {session.status}, cannot mark complete")
    session.status = ClassSessionStatus.COMPLETED
    await db.commit()
    refreshed = await _get_session_or_404(session_id, db)
    return await _session_out(refreshed, db)


@router.get("/sessions/{session_id}/reservations", response_model=list[ReservationOut])
async def list_session_reservations(
    session_id: uuid.UUID,
    db: DbDep,
    current_user: RequireStaff,
    res_status: ClassReservationStatus | None = Query(None, alias="status"),
):
    session = await _get_session_or_404(session_id, db)
    if current_user.role == Role.COACH and session.coach_id != current_user.id:
        raise HTTPException(status_code=403, detail="Cannot view another coach's attendees")

    q = (
        select(ClassReservation)
        .where(ClassReservation.session_id == session_id)
        .options(selectinload(ClassReservation.member))
        .order_by(ClassReservation.reserved_at)
    )
    if res_status:
        q = q.where(ClassReservation.status == res_status)

    result = await db.execute(q)
    reservations = result.scalars().all()
    return [
        {
            "id": r.id,
            "session_id": r.session_id,
            "member_id": r.member_id,
            "member_name": r.member.full_name if r.member else None,
            "status": r.status,
            "attended": r.attended,
            "reserved_at": r.reserved_at,
            "cancelled_at": r.cancelled_at,
        }
        for r in reservations
    ]


# ---------------------------------------------------------------------------
# Approval / Rejection endpoints
# ---------------------------------------------------------------------------

@router.post("/sessions/{session_id}/reservations/approve", status_code=200)
async def approve_reservations(
    session_id: uuid.UUID,
    body: ReservationApproveReject,
    db: DbDep,
    current_user: RequireStaff,
):
    """
    Approve one or more PENDING reservations.
    Coach can only approve for their own sessions.
    Members get a push notification when approved.
    If session is at capacity, approved members are placed on the waitlist instead.
    """
    session = await _get_session_or_404(session_id, db)
    if current_user.role == Role.COACH and session.coach_id != current_user.id:
        raise HTTPException(status_code=403, detail="Coaches can only approve reservations for their own sessions")

    cap = session.capacity_override if session.capacity_override is not None else session.template.capacity

    result = await db.execute(
        select(ClassReservation).where(
            ClassReservation.session_id == session_id,
            ClassReservation.id.in_(body.reservation_ids),
            ClassReservation.status == ClassReservationStatus.PENDING,
        )
    )
    reservations = result.scalars().all()
    approved_count = 0
    waitlisted_count = 0

    for res in reservations:
        current_reserved = await _reservation_count(session_id, db)
        if current_reserved < cap:
            res.status = ClassReservationStatus.RESERVED
            approved_count += 1
            await _notify_reservation_update(res.member_id, ClassReservationStatus.RESERVED, session, db)
        else:
            res.status = ClassReservationStatus.WAITLISTED
            waitlisted_count += 1
            await _notify_reservation_update(res.member_id, ClassReservationStatus.WAITLISTED, session, db)

    await db.commit()
    return {"approved": approved_count, "waitlisted": waitlisted_count, "not_found": len(body.reservation_ids) - len(reservations)}


@router.post("/sessions/{session_id}/reservations/reject", status_code=200)
async def reject_reservations(
    session_id: uuid.UUID,
    body: ReservationApproveReject,
    db: DbDep,
    current_user: RequireStaff,
):
    """Reject one or more PENDING reservations. Member gets a push notification."""
    session = await _get_session_or_404(session_id, db)
    if current_user.role == Role.COACH and session.coach_id != current_user.id:
        raise HTTPException(status_code=403, detail="Coaches can only reject reservations for their own sessions")

    result = await db.execute(
        select(ClassReservation).where(
            ClassReservation.session_id == session_id,
            ClassReservation.id.in_(body.reservation_ids),
            ClassReservation.status == ClassReservationStatus.PENDING,
        )
    )
    reservations = result.scalars().all()
    now = datetime.now(timezone.utc)
    for res in reservations:
        res.status = ClassReservationStatus.REJECTED
        res.cancelled_at = now
        await _notify_reservation_update(res.member_id, ClassReservationStatus.REJECTED, session, db)

    await db.commit()
    return {"rejected": len(reservations)}


@router.post("/sessions/{session_id}/attendance", status_code=200)
async def mark_attendance(session_id: uuid.UUID, body: AttendanceBulk, db: DbDep, current_user: RequireStaff):
    session = await _get_session_or_404(session_id, db)
    if current_user.role == Role.COACH and session.coach_id != current_user.id:
        raise HTTPException(status_code=403, detail="Cannot mark attendance for another coach's session")

    member_ids = [m.member_id for m in body.marks]
    result = await db.execute(
        select(ClassReservation).where(
            ClassReservation.session_id == session_id,
            ClassReservation.member_id.in_(member_ids),
        )
    )
    res_map = {r.member_id: r for r in result.scalars().all()}

    for mark in body.marks:
        res = res_map.get(mark.member_id)
        if res:
            res.attended = mark.attended
            if not mark.attended and res.status == ClassReservationStatus.RESERVED:
                res.status = ClassReservationStatus.NO_SHOW

    await db.commit()
    return {"marked": len(body.marks)}


# ===========================================================================
# CUSTOMER (MEMBER) ENDPOINTS
# ===========================================================================

@router.get("/public/upcoming", response_model=list[SessionOut])
async def upcoming_sessions(
    db: DbDep,
    current_user: CurrentUser,
    days: int = Query(14, ge=1, le=60),
):
    """List upcoming scheduled sessions for members to browse."""
    now = datetime.now(timezone.utc)
    until = now + timedelta(days=days)

    result = await db.execute(
        select(ClassSession)
        .options(selectinload(ClassSession.template), selectinload(ClassSession.coach))
        .where(
            ClassSession.starts_at >= now,
            ClassSession.starts_at <= until,
            ClassSession.status == ClassSessionStatus.SCHEDULED,
        )
        .order_by(ClassSession.starts_at)
    )
    sessions = result.scalars().all()
    return [await _session_out(s, db) for s in sessions]


@router.get("/my-reservations", response_model=list[dict])
async def my_reservations(db: DbDep, current_user: CurrentUser):
    """Return the calling member's upcoming reservations (all statuses except cancelled/rejected)."""
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(ClassReservation)
        .options(
            selectinload(ClassReservation.session).options(
                selectinload(ClassSession.template),
                selectinload(ClassSession.coach),
            )
        )
        .where(
            ClassReservation.member_id == current_user.id,
            ClassReservation.status.in_(
                [ClassReservationStatus.PENDING, ClassReservationStatus.RESERVED, ClassReservationStatus.WAITLISTED]
            ),
            ClassSession.starts_at >= now,
        )
        .join(ClassSession, ClassReservation.session_id == ClassSession.id)
        .order_by(ClassSession.starts_at)
    )
    items = result.scalars().all()
    return [
        {
            "reservation_id": r.id,
            "status": r.status,
            "reserved_at": r.reserved_at,
            "session": await _session_out(r.session, db),
        }
        for r in items
    ]


@router.post("/sessions/{session_id}/reserve", status_code=201)
async def request_reservation(session_id: uuid.UUID, db: DbDep, current_user: CurrentUser):
    """
    Member requests a spot in a class session.
    Creates a PENDING reservation that staff must approve.
    """
    if current_user.role not in {Role.CUSTOMER}:
        raise HTTPException(status_code=403, detail="Only members can request class reservations")

    session = await _get_session_or_404(session_id, db)

    if session.status != ClassSessionStatus.SCHEDULED:
        raise HTTPException(status_code=400, detail="This session is not available for booking")
    if session.starts_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Cannot reserve a session that has already started")

    existing = await db.execute(
        select(ClassReservation).where(
            ClassReservation.session_id == session_id,
            ClassReservation.member_id == current_user.id,
            ClassReservation.status.notin_(
                [ClassReservationStatus.CANCELLED, ClassReservationStatus.REJECTED]
            ),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="You already have a reservation request for this session")

    reservation = ClassReservation(
        session_id=session_id,
        member_id=current_user.id,
        status=ClassReservationStatus.PENDING,
    )
    db.add(reservation)
    await db.commit()
    await db.refresh(reservation)

    return {
        "reservation_id": reservation.id,
        "status": reservation.status,
        "message": "Reservation request submitted — awaiting approval",
    }


@router.delete("/sessions/{session_id}/reserve", status_code=200)
async def cancel_my_reservation(session_id: uuid.UUID, db: DbDep, current_user: CurrentUser):
    """
    Cancel the calling member's reservation.
    If a RESERVED spot is freed, the first WAITLISTED member is promoted.
    """
    result = await db.execute(
        select(ClassReservation).where(
            ClassReservation.session_id == session_id,
            ClassReservation.member_id == current_user.id,
            ClassReservation.status.in_(
                [ClassReservationStatus.PENDING, ClassReservationStatus.RESERVED, ClassReservationStatus.WAITLISTED]
            ),
        )
    )
    reservation = result.scalar_one_or_none()
    if reservation is None:
        raise HTTPException(status_code=404, detail="No active reservation found for this session")

    was_reserved = reservation.status == ClassReservationStatus.RESERVED
    now = datetime.now(timezone.utc)
    reservation.status = ClassReservationStatus.CANCELLED
    reservation.cancelled_at = now

    # Promote first waitlisted member if we freed a confirmed spot
    if was_reserved:
        next_result = await db.execute(
            select(ClassReservation)
            .where(
                ClassReservation.session_id == session_id,
                ClassReservation.status == ClassReservationStatus.WAITLISTED,
            )
            .order_by(ClassReservation.reserved_at)
            .limit(1)
        )
        promoted = next_result.scalar_one_or_none()
        if promoted:
            session_obj = await _get_session_or_404(session_id, db)
            promoted.status = ClassReservationStatus.RESERVED
            await _notify_reservation_update(promoted.member_id, ClassReservationStatus.RESERVED, session_obj, db)

    await db.commit()
    return {"message": "Reservation cancelled"}
