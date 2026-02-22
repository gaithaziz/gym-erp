import os
import uuid
from datetime import date, datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import dependencies
from app.core.responses import StandardResponse
from app.database import get_db
from app.models.enums import Role
from app.models.lost_found import LostFoundComment, LostFoundItem, LostFoundMedia, LostFoundStatus
from app.models.user import User
from app.services.audit_service import AuditService

router = APIRouter()

IMAGE_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
VIDEO_MIME_TYPES = {"video/mp4", "video/webm", "video/quicktime"}
ALL_MIME_TYPES = IMAGE_MIME_TYPES | VIDEO_MIME_TYPES
MAX_BYTES_BY_MIME = {
    **{mime: 15 * 1024 * 1024 for mime in IMAGE_MIME_TYPES},
    **{mime: 75 * 1024 * 1024 for mime in VIDEO_MIME_TYPES},
}
UPLOAD_DIR = os.path.join("static", "lost_found_media")
HANDLER_ROLES = {Role.ADMIN, Role.RECEPTION}
TERMINAL_STATUSES = {LostFoundStatus.CLOSED, LostFoundStatus.REJECTED, LostFoundStatus.DISPOSED}
ALLOWED_TRANSITIONS: dict[LostFoundStatus, set[LostFoundStatus]] = {
    LostFoundStatus.REPORTED: {LostFoundStatus.UNDER_REVIEW, LostFoundStatus.REJECTED},
    LostFoundStatus.UNDER_REVIEW: {LostFoundStatus.READY_FOR_PICKUP, LostFoundStatus.REJECTED, LostFoundStatus.DISPOSED},
    LostFoundStatus.READY_FOR_PICKUP: {LostFoundStatus.CLOSED, LostFoundStatus.DISPOSED},
}


class LostFoundActorResponse(BaseModel):
    id: uuid.UUID
    full_name: str | None
    email: str
    role: str


class LostFoundMediaResponse(BaseModel):
    id: uuid.UUID
    uploader_id: uuid.UUID
    media_url: str
    media_mime: str
    media_size_bytes: int
    created_at: datetime


class LostFoundCommentResponse(BaseModel):
    id: uuid.UUID
    item_id: uuid.UUID
    author: LostFoundActorResponse
    text: str
    created_at: datetime


class LostFoundItemCreateRequest(BaseModel):
    title: str
    description: str
    category: str
    found_date: date | None = None
    found_location: str | None = None
    contact_note: str | None = None


class LostFoundStatusUpdateRequest(BaseModel):
    status: LostFoundStatus
    note: str | None = None


class LostFoundAssignRequest(BaseModel):
    assignee_id: uuid.UUID


class LostFoundCommentCreateRequest(BaseModel):
    text: str


class LostFoundItemResponse(BaseModel):
    id: uuid.UUID
    status: LostFoundStatus
    reporter: LostFoundActorResponse
    assignee: LostFoundActorResponse | None = None
    title: str
    description: str
    category: str
    found_date: date | None
    found_location: str | None
    contact_note: str | None
    media: list[LostFoundMediaResponse]
    comments: list[LostFoundCommentResponse]
    created_at: datetime
    updated_at: datetime
    closed_at: datetime | None


class LostFoundSummaryResponse(BaseModel):
    reported: int
    under_review: int
    ready_for_pickup: int
    closed: int
    rejected: int
    disposed: int
    total_open: int


def _is_handler(user: User) -> bool:
    return user.role in HANDLER_ROLES


def _to_actor(user: User) -> LostFoundActorResponse:
    return LostFoundActorResponse(
        id=user.id,
        full_name=user.full_name,
        email=user.email,
        role=user.role.value,
    )


async def _get_item_or_404(db: AsyncSession, item_id: uuid.UUID) -> LostFoundItem:
    stmt = (
        select(LostFoundItem)
        .where(LostFoundItem.id == item_id)
        .execution_options(populate_existing=True)
        .options(
            selectinload(LostFoundItem.reporter),
            selectinload(LostFoundItem.assignee),
            selectinload(LostFoundItem.media),
            selectinload(LostFoundItem.comments).selectinload(LostFoundComment.author),
        )
    )
    result = await db.execute(stmt)
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="Lost & Found item not found")
    return item


def _ensure_item_visible(user: User, item: LostFoundItem) -> None:
    if _is_handler(user):
        return
    if item.reporter_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")


def _serialize_item(item: LostFoundItem) -> LostFoundItemResponse:
    comments = sorted(item.comments, key=lambda c: c.created_at)
    media = sorted(item.media, key=lambda m: m.created_at)
    return LostFoundItemResponse(
        id=item.id,
        status=item.status,
        reporter=_to_actor(item.reporter),
        assignee=_to_actor(item.assignee) if item.assignee else None,
        title=item.title,
        description=item.description,
        category=item.category,
        found_date=item.found_date,
        found_location=item.found_location,
        contact_note=item.contact_note,
        media=[
            LostFoundMediaResponse(
                id=m.id,
                uploader_id=m.uploader_id,
                media_url=m.media_url,
                media_mime=m.media_mime,
                media_size_bytes=m.media_size_bytes,
                created_at=m.created_at,
            )
            for m in media
        ],
        comments=[
            LostFoundCommentResponse(
                id=c.id,
                item_id=c.item_id,
                author=_to_actor(c.author),
                text=c.text,
                created_at=c.created_at,
            )
            for c in comments
        ],
        created_at=item.created_at,
        updated_at=item.updated_at,
        closed_at=item.closed_at,
    )


async def _log_and_commit(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    action: str,
    target_id: str,
    details: str | None = None,
) -> None:
    await AuditService.log_action(
        db=db,
        user_id=user_id,
        action=action,
        target_id=target_id,
        details=details,
    )
    await db.commit()


@router.post("/items", response_model=StandardResponse[LostFoundItemResponse])
async def create_lost_found_item(
    payload: LostFoundItemCreateRequest,
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    now = datetime.now(timezone.utc)
    item = LostFoundItem(
        reporter_id=current_user.id,
        status=LostFoundStatus.REPORTED,
        title=payload.title.strip(),
        description=payload.description.strip(),
        category=payload.category.strip(),
        found_date=payload.found_date,
        found_location=(payload.found_location or "").strip() or None,
        contact_note=(payload.contact_note or "").strip() or None,
        created_at=now,
        updated_at=now,
    )
    if not item.title or not item.description or not item.category:
        raise HTTPException(status_code=400, detail="title, description and category are required")

    db.add(item)
    await db.commit()
    await db.refresh(item)
    item = await _get_item_or_404(db, item.id)
    await _log_and_commit(
        db,
        user_id=current_user.id,
        action="LOST_FOUND_CREATED",
        target_id=str(item.id),
        details=f"Category: {item.category}",
    )
    item = await _get_item_or_404(db, item.id)
    return StandardResponse(data=_serialize_item(item))


@router.get("/items", response_model=StandardResponse[list[LostFoundItemResponse]])
async def list_lost_found_items(
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(30, ge=1, le=100),
    offset: int = Query(0, ge=0),
    status: LostFoundStatus | None = Query(None),
    assignee_id: uuid.UUID | None = Query(None),
    reporter_id: uuid.UUID | None = Query(None),
):
    stmt = (
        select(LostFoundItem)
        .options(
            selectinload(LostFoundItem.reporter),
            selectinload(LostFoundItem.assignee),
            selectinload(LostFoundItem.media),
            selectinload(LostFoundItem.comments).selectinload(LostFoundComment.author),
        )
        .order_by(LostFoundItem.updated_at.desc(), LostFoundItem.created_at.desc())
        .limit(limit)
        .offset(offset)
    )

    if _is_handler(current_user):
        if status:
            stmt = stmt.where(LostFoundItem.status == status)
        if assignee_id:
            stmt = stmt.where(LostFoundItem.assignee_id == assignee_id)
        if reporter_id:
            stmt = stmt.where(LostFoundItem.reporter_id == reporter_id)
    else:
        stmt = stmt.where(LostFoundItem.reporter_id == current_user.id)
        if status:
            stmt = stmt.where(LostFoundItem.status == status)

    result = await db.execute(stmt)
    items = result.scalars().all()
    return StandardResponse(data=[_serialize_item(item) for item in items])


@router.get("/handlers", response_model=StandardResponse[list[LostFoundActorResponse]])
async def list_lost_found_handlers(
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    if not _is_handler(current_user):
        raise HTTPException(status_code=403, detail="Operation not permitted")

    result = await db.execute(
        select(User).where(User.role.in_([Role.ADMIN, Role.RECEPTION])).order_by(User.full_name.asc(), User.email.asc())
    )
    users = result.scalars().all()
    return StandardResponse(data=[_to_actor(user) for user in users])


@router.get("/items/{item_id}", response_model=StandardResponse[LostFoundItemResponse])
async def get_lost_found_item(
    item_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    item = await _get_item_or_404(db, item_id)
    _ensure_item_visible(current_user, item)
    return StandardResponse(data=_serialize_item(item))


@router.post("/items/{item_id}/comments", response_model=StandardResponse[LostFoundCommentResponse])
async def create_lost_found_comment(
    item_id: uuid.UUID,
    payload: LostFoundCommentCreateRequest,
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    text = (payload.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Comment text is required")

    item = await _get_item_or_404(db, item_id)
    _ensure_item_visible(current_user, item)

    now = datetime.now(timezone.utc)
    comment = LostFoundComment(
        item_id=item.id,
        author_id=current_user.id,
        text=text,
        created_at=now,
    )
    item.updated_at = now
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    await db.refresh(comment, attribute_names=["author"])
    await _log_and_commit(
        db,
        user_id=current_user.id,
        action="LOST_FOUND_COMMENT_ADDED",
        target_id=str(item.id),
        details=f"Comment by {current_user.role.value}",
    )

    return StandardResponse(
        data=LostFoundCommentResponse(
            id=comment.id,
            item_id=comment.item_id,
            author=_to_actor(comment.author),
            text=comment.text,
            created_at=comment.created_at,
        )
    )


@router.post("/items/{item_id}/status", response_model=StandardResponse[LostFoundItemResponse])
async def update_lost_found_status(
    item_id: uuid.UUID,
    payload: LostFoundStatusUpdateRequest,
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    if not _is_handler(current_user):
        raise HTTPException(status_code=403, detail="Operation not permitted")

    item = await _get_item_or_404(db, item_id)
    current = item.status
    target = payload.status
    if current == target:
        raise HTTPException(status_code=400, detail="Status is already set")
    allowed_targets = ALLOWED_TRANSITIONS.get(current, set())
    if target not in allowed_targets:
        raise HTTPException(status_code=400, detail=f"Invalid status transition from {current.value} to {target.value}")

    now = datetime.now(timezone.utc)
    item.status = target
    item.updated_at = now
    if target in TERMINAL_STATUSES:
        item.closed_at = now

    note = (payload.note or "").strip()
    if note:
        db.add(
            LostFoundComment(
                item_id=item.id,
                author_id=current_user.id,
                text=f"[Status note] {note}",
                created_at=now,
            )
        )

    await db.commit()
    await _log_and_commit(
        db,
        user_id=current_user.id,
        action="LOST_FOUND_STATUS_UPDATED",
        target_id=str(item.id),
        details=f"{current.value} -> {target.value}" + (f" ({note})" if note else ""),
    )
    item = await _get_item_or_404(db, item.id)
    return StandardResponse(data=_serialize_item(item))


@router.post("/items/{item_id}/assign", response_model=StandardResponse[LostFoundItemResponse])
async def assign_lost_found_item(
    item_id: uuid.UUID,
    payload: LostFoundAssignRequest,
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    if not _is_handler(current_user):
        raise HTTPException(status_code=403, detail="Operation not permitted")

    item = await _get_item_or_404(db, item_id)
    assignee_stmt = select(User).where(User.id == payload.assignee_id)
    assignee_result = await db.execute(assignee_stmt)
    assignee = assignee_result.scalar_one_or_none()
    if assignee is None:
        raise HTTPException(status_code=404, detail="Assignee not found")
    if assignee.role not in HANDLER_ROLES:
        raise HTTPException(status_code=400, detail="Assignee must be ADMIN or RECEPTION")

    item.assignee_id = assignee.id
    item.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await _log_and_commit(
        db,
        user_id=current_user.id,
        action="LOST_FOUND_ASSIGNED",
        target_id=str(item.id),
        details=f"Assigned to {assignee.email}",
    )
    item = await _get_item_or_404(db, item.id)
    return StandardResponse(data=_serialize_item(item))


@router.post("/items/{item_id}/media", response_model=StandardResponse[LostFoundMediaResponse])
async def upload_lost_found_media(
    item_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
):
    item = await _get_item_or_404(db, item_id)
    _ensure_item_visible(current_user, item)

    if not _is_handler(current_user):
        if item.status not in {LostFoundStatus.REPORTED, LostFoundStatus.UNDER_REVIEW}:
            raise HTTPException(status_code=400, detail="Media upload is closed for this report status")

    raw_content_type = (file.content_type or "").lower()
    content_type = raw_content_type.split(";")[0].strip()
    if content_type not in ALL_MIME_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported media type: {raw_content_type or 'unknown'}")

    ext = os.path.splitext(file.filename or "")[1].lower() or ".bin"
    max_size = MAX_BYTES_BY_MIME[content_type]
    item_dir = os.path.join(UPLOAD_DIR, str(item.id))
    os.makedirs(item_dir, exist_ok=True)

    file_name = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(item_dir, file_name)
    total = 0
    with open(file_path, "wb") as out_file:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > max_size:
                out_file.close()
                try:
                    os.remove(file_path)
                except OSError:
                    pass
                raise HTTPException(status_code=400, detail="Attachment exceeds allowed size")
            out_file.write(chunk)

    media = LostFoundMedia(
        item_id=item.id,
        uploader_id=current_user.id,
        media_url=f"/static/lost_found_media/{item.id}/{file_name}",
        media_mime=content_type,
        media_size_bytes=total,
        created_at=datetime.now(timezone.utc),
    )
    item.updated_at = datetime.now(timezone.utc)
    db.add(media)
    await db.commit()
    await db.refresh(media)

    await _log_and_commit(
        db,
        user_id=current_user.id,
        action="LOST_FOUND_MEDIA_ADDED",
        target_id=str(item.id),
        details=f"mime={content_type}, bytes={total}",
    )

    return StandardResponse(
        data=LostFoundMediaResponse(
            id=media.id,
            uploader_id=media.uploader_id,
            media_url=media.media_url,
            media_mime=media.media_mime,
            media_size_bytes=media.media_size_bytes,
            created_at=media.created_at,
        )
    )


@router.get("/summary", response_model=StandardResponse[LostFoundSummaryResponse])
async def get_lost_found_summary(
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    if not _is_handler(current_user):
        raise HTTPException(status_code=403, detail="Operation not permitted")

    stmt = select(LostFoundItem.status, func.count(LostFoundItem.id)).group_by(LostFoundItem.status)
    result = await db.execute(stmt)
    counters = {status: count for status, count in result.all()}
    reported = counters.get(LostFoundStatus.REPORTED, 0)
    under_review = counters.get(LostFoundStatus.UNDER_REVIEW, 0)
    ready_for_pickup = counters.get(LostFoundStatus.READY_FOR_PICKUP, 0)
    closed = counters.get(LostFoundStatus.CLOSED, 0)
    rejected = counters.get(LostFoundStatus.REJECTED, 0)
    disposed = counters.get(LostFoundStatus.DISPOSED, 0)
    total_open = reported + under_review + ready_for_pickup
    return StandardResponse(
        data=LostFoundSummaryResponse(
            reported=reported,
            under_review=under_review,
            ready_for_pickup=ready_for_pickup,
            closed=closed,
            rejected=rejected,
            disposed=disposed,
            total_open=total_open,
        )
    )
