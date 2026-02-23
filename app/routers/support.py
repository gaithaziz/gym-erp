import uuid
import os
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.dependencies import get_current_active_user, get_current_employee
from app.core.responses import StandardResponse
from app.database import get_db
from app.models.enums import Role
from app.models.support import SupportTicket, SupportMessage, TicketCategory, TicketStatus
from app.models.user import User

router = APIRouter()

IMAGE_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGE_BYTES = 15 * 1024 * 1024
UPLOAD_DIR = os.path.join("static", "support_media")


class SupportMessageResponse(BaseModel):
    id: uuid.UUID
    ticket_id: uuid.UUID
    sender_id: uuid.UUID
    message: str
    media_url: str | None = None
    media_mime: str | None = None
    media_size_bytes: int | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class SupportCustomerResponse(BaseModel):
    id: uuid.UUID
    full_name: str
    email: str
    profile_picture_url: str | None = None

    class Config:
        from_attributes = True


class SupportTicketResponse(BaseModel):
    id: uuid.UUID
    customer_id: uuid.UUID
    subject: str
    category: TicketCategory
    status: TicketStatus
    created_at: datetime
    updated_at: datetime
    customer: dict | None = None
    messages: list[SupportMessageResponse] = []

    class Config:
        from_attributes = True


class SupportTicketCreateRequest(BaseModel):
    subject: str
    category: TicketCategory
    message: str


class SupportMessageCreateRequest(BaseModel):
    message: str


class SupportTicketStatusUpdate(BaseModel):
    status: TicketStatus


def _is_staff_role(role: Role) -> bool:
    return role in [Role.ADMIN, Role.RECEPTION]


def _serialize_ticket(ticket: SupportTicket) -> dict:
    """Manually serialize a SupportTicket ORM object to a dict,
    avoiding Pydantic's automatic coercion of the User relationship."""
    d: dict = {
        "id": ticket.id,
        "customer_id": ticket.customer_id,
        "subject": ticket.subject,
        "category": ticket.category,
        "status": ticket.status,
        "created_at": ticket.created_at,
        "updated_at": ticket.updated_at,
        "customer": None,
        "messages": [],
    }
    if ticket.customer:
        d["customer"] = {
            "id": str(ticket.customer.id),
            "full_name": ticket.customer.full_name,
            "email": ticket.customer.email,
            "profile_picture_url": ticket.customer.profile_picture_url,
        }
    if hasattr(ticket, 'messages') and ticket.messages:
        d["messages"] = [
            SupportMessageResponse.model_validate(m).model_dump()
            for m in ticket.messages
        ]
    return d


@router.post("/tickets", response_model=StandardResponse[SupportTicketResponse])
async def create_ticket(
    data: SupportTicketCreateRequest,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    if current_user.role != Role.CUSTOMER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only customers can create support tickets"
        )

    now = datetime.now(timezone.utc)
    ticket = SupportTicket(
        customer_id=current_user.id,
        subject=data.subject,
        category=data.category,
        status=TicketStatus.OPEN,
        created_at=now,
        updated_at=now,
    )
    db.add(ticket)
    await db.commit()
    await db.refresh(ticket)

    initial_message = SupportMessage(
        ticket_id=ticket.id,
        sender_id=current_user.id,
        message=data.message,
        created_at=now,
    )
    db.add(initial_message)
    await db.commit()
    
    # Reload with relationships
    stmt = (
        select(SupportTicket)
        .where(SupportTicket.id == ticket.id)
        .options(selectinload(SupportTicket.messages), selectinload(SupportTicket.customer))
    )
    result = await db.execute(stmt)
    loaded_ticket = result.scalar_one()

    return StandardResponse(data=_serialize_ticket(loaded_ticket))


@router.get("/tickets", response_model=StandardResponse[list[SupportTicketResponse]])
async def list_tickets(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    status_filter: TicketStatus | None = Query(None, description="Filter by exact status"),
    is_active: bool | None = Query(None, description="If true, filters OPEN and IN_PROGRESS. If false, filters RESOLVED and CLOSED."),
    category: TicketCategory | None = Query(None),
    limit: int = 50,
    offset: int = 0
):
    stmt = select(SupportTicket).options(
        selectinload(SupportTicket.messages),
        selectinload(SupportTicket.customer)
    )

    if current_user.role == Role.CUSTOMER:
        stmt = stmt.where(SupportTicket.customer_id == current_user.id)
    elif not _is_staff_role(current_user.role):
        raise HTTPException(status_code=403, detail="Not authorized to view tickets")

    if status_filter:
        stmt = stmt.where(SupportTicket.status == status_filter)
    
    if is_active is not None:
        if is_active:
            stmt = stmt.where(SupportTicket.status.in_([TicketStatus.OPEN, TicketStatus.IN_PROGRESS]))
        else:
            stmt = stmt.where(SupportTicket.status.in_([TicketStatus.RESOLVED, TicketStatus.CLOSED]))

    if category:
        stmt = stmt.where(SupportTicket.category == category)

    stmt = stmt.order_by(SupportTicket.updated_at.desc()).offset(offset).limit(limit)
    result = await db.execute(stmt)
    tickets = result.scalars().all()

    response_data = [_serialize_ticket(t) for t in tickets]

    return StandardResponse(data=response_data)


@router.get("/tickets/{ticket_id}", response_model=StandardResponse[SupportTicketResponse])
async def get_ticket(
    ticket_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    stmt = (
        select(SupportTicket)
        .where(SupportTicket.id == ticket_id)
        .options(selectinload(SupportTicket.messages), selectinload(SupportTicket.customer))
    )
    result = await db.execute(stmt)
    ticket = result.scalar_one_or_none()

    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    if current_user.role == Role.CUSTOMER and ticket.customer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view this ticket")
    elif current_user.role != Role.CUSTOMER and not _is_staff_role(current_user.role):
        raise HTTPException(status_code=403, detail="Not authorized to view tickets")

    return StandardResponse(data=_serialize_ticket(ticket))


@router.post("/tickets/{ticket_id}/messages", response_model=StandardResponse[SupportMessageResponse])
async def add_ticket_message(
    ticket_id: uuid.UUID,
    data: SupportMessageCreateRequest,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    stmt = select(SupportTicket).where(SupportTicket.id == ticket_id)
    result = await db.execute(stmt)
    ticket = result.scalar_one_or_none()

    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    if current_user.role == Role.CUSTOMER and ticket.customer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to reply to this ticket")
    elif current_user.role != Role.CUSTOMER and not _is_staff_role(current_user.role):
        raise HTTPException(status_code=403, detail="Not authorized to reply to tickets")

    if ticket.status in [TicketStatus.RESOLVED, TicketStatus.CLOSED]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot send messages to a closed or resolved ticket"
        )

    now = datetime.now(timezone.utc)
    new_message = SupportMessage(
        ticket_id=ticket.id,
        sender_id=current_user.id,
        message=data.message,
        created_at=now
    )
    db.add(new_message)

    # Automatically set to IN_PROGRESS if a staff member replies to an OPEN ticket
    if current_user.role != Role.CUSTOMER and ticket.status == TicketStatus.OPEN:
        ticket.status = TicketStatus.IN_PROGRESS
        
    ticket.updated_at = now
    await db.commit()
    await db.refresh(new_message)

    return StandardResponse(data=SupportMessageResponse.model_validate(new_message))


@router.post("/tickets/{ticket_id}/attachments", response_model=StandardResponse[SupportMessageResponse])
async def add_ticket_attachment(
    ticket_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
    message: str | None = Form(None),
):
    stmt = select(SupportTicket).where(SupportTicket.id == ticket_id)
    result = await db.execute(stmt)
    ticket = result.scalar_one_or_none()

    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    if current_user.role == Role.CUSTOMER and ticket.customer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to reply to this ticket")
    elif current_user.role != Role.CUSTOMER and not _is_staff_role(current_user.role):
        raise HTTPException(status_code=403, detail="Not authorized to reply to tickets")

    if ticket.status in [TicketStatus.RESOLVED, TicketStatus.CLOSED]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot send attachments to a closed or resolved ticket"
        )

    raw_content_type = (file.content_type or "").lower()
    content_type = raw_content_type.split(";")[0].strip()
    if content_type not in IMAGE_MIME_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported media type: {raw_content_type or 'unknown'}")

    ext = os.path.splitext(file.filename or "")[1].lower() or ".bin"
    ticket_dir = os.path.join(UPLOAD_DIR, str(ticket.id))
    os.makedirs(ticket_dir, exist_ok=True)

    file_name = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(ticket_dir, file_name)
    total = 0
    with open(file_path, "wb") as out_file:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_IMAGE_BYTES:
                out_file.close()
                try:
                    os.remove(file_path)
                except OSError:
                    pass
                raise HTTPException(status_code=400, detail="Attachment exceeds 15MB limit")
            out_file.write(chunk)

    now = datetime.now(timezone.utc)
    text = (message or "").strip() or "[photo attachment]"
    new_message = SupportMessage(
        ticket_id=ticket.id,
        sender_id=current_user.id,
        message=text,
        media_url=f"/static/support_media/{ticket.id}/{file_name}",
        media_mime=content_type,
        media_size_bytes=total,
        created_at=now
    )
    db.add(new_message)

    if current_user.role != Role.CUSTOMER and ticket.status == TicketStatus.OPEN:
        ticket.status = TicketStatus.IN_PROGRESS

    ticket.updated_at = now
    await db.commit()
    await db.refresh(new_message)

    return StandardResponse(data=SupportMessageResponse.model_validate(new_message))


@router.patch("/tickets/{ticket_id}/status", response_model=StandardResponse[SupportTicketResponse])
async def update_ticket_status(
    ticket_id: uuid.UUID,
    data: SupportTicketStatusUpdate,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    stmt = select(SupportTicket).where(SupportTicket.id == ticket_id).options(selectinload(SupportTicket.customer))
    result = await db.execute(stmt)
    ticket = result.scalar_one_or_none()

    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    if current_user.role == Role.CUSTOMER:
        if ticket.customer_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to update this ticket")
        # Customers can only close/resolve tickets (if they solved their own issue), they can't reopen arbitrary tickets or set them to IN_PROGRESS
        if data.status not in [TicketStatus.RESOLVED, TicketStatus.CLOSED]:
            raise HTTPException(status_code=403, detail="Customers can only close or resolve tickets")
    elif not _is_staff_role(current_user.role):
        raise HTTPException(status_code=403, detail="Not authorized to update ticket status")

    ticket.status = data.status
    ticket.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(ticket)
    
    # Reload relation
    stmt2 = select(SupportTicket).where(SupportTicket.id == ticket_id).options(selectinload(SupportTicket.messages), selectinload(SupportTicket.customer))
    res2 = await db.execute(stmt2)
    loaded_ticket = res2.scalar_one()

    return StandardResponse(data=_serialize_ticket(loaded_ticket))
