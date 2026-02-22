import json
import os
import uuid
from datetime import datetime, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, WebSocket, WebSocketDisconnect
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import dependencies
from app.config import settings
from app.core.responses import StandardResponse
from app.database import AsyncSessionLocal, get_db
from app.models.chat import ChatMessage, ChatReadReceipt, ChatThread
from app.models.enums import Role
from app.models.user import User
from app.services.subscription_status_service import SubscriptionStatusService

router = APIRouter()

IMAGE_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
VIDEO_MIME_TYPES = {"video/mp4", "video/webm", "video/quicktime"}
VOICE_MIME_TYPES = {"audio/webm", "audio/mp4", "audio/mpeg", "audio/ogg"}
ALL_MIME_TYPES = IMAGE_MIME_TYPES | VIDEO_MIME_TYPES | VOICE_MIME_TYPES
MAX_BYTES_BY_MIME = {
    **{mime: 15 * 1024 * 1024 for mime in IMAGE_MIME_TYPES},
    **{mime: 75 * 1024 * 1024 for mime in VIDEO_MIME_TYPES},
    **{mime: 25 * 1024 * 1024 for mime in VOICE_MIME_TYPES},
}
UPLOAD_DIR = os.path.join("static", "chat_media")


class ChatContactResponse(BaseModel):
    id: uuid.UUID
    full_name: str | None
    email: str
    role: str
    profile_picture_url: str | None = None


class ThreadCreateRequest(BaseModel):
    coach_id: uuid.UUID | None = None
    customer_id: uuid.UUID | None = None


class MessageCreateRequest(BaseModel):
    text_content: str


class MessageResponse(BaseModel):
    id: uuid.UUID
    thread_id: uuid.UUID
    sender_id: uuid.UUID
    message_type: str
    text_content: str | None
    media_url: str | None
    media_mime: str | None
    media_size_bytes: int | None
    voice_duration_seconds: int | None
    created_at: datetime

    class Config:
        from_attributes = True


class ThreadResponse(BaseModel):
    id: uuid.UUID
    customer: ChatContactResponse
    coach: ChatContactResponse
    last_message: MessageResponse | None = None
    unread_count: int = 0
    created_at: datetime
    updated_at: datetime
    last_message_at: datetime | None = None


def _is_chat_role(role: Role) -> bool:
    return role in [Role.ADMIN, Role.COACH, Role.CUSTOMER]


def _is_participant(user: User, thread: ChatThread) -> bool:
    return user.id in (thread.customer_id, thread.coach_id)


def _to_contact(user: User) -> ChatContactResponse:
    return ChatContactResponse(
        id=user.id,
        full_name=user.full_name,
        email=user.email,
        role=user.role.value,
        profile_picture_url=user.profile_picture_url,
    )


def _resolve_message_type(mime: str) -> Literal["IMAGE", "VIDEO", "VOICE"]:
    if mime in IMAGE_MIME_TYPES:
        return "IMAGE"
    if mime in VIDEO_MIME_TYPES:
        return "VIDEO"
    return "VOICE"


async def _get_thread_or_404(db: AsyncSession, thread_id: uuid.UUID) -> ChatThread:
    stmt = (
        select(ChatThread)
        .where(ChatThread.id == thread_id)
        .options(selectinload(ChatThread.customer), selectinload(ChatThread.coach))
    )
    result = await db.execute(stmt)
    thread = result.scalar_one_or_none()
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    return thread


async def _ensure_visible_thread(user: User, thread: ChatThread) -> None:
    if user.role == Role.ADMIN:
        return
    if not _is_participant(user, thread):
        raise HTTPException(status_code=403, detail="Access denied")


async def _ensure_sender_allowed(user: User, thread: ChatThread) -> None:
    await _ensure_visible_thread(user, thread)
    if user.role == Role.ADMIN:
        raise HTTPException(status_code=403, detail="Admin is read-only for chat")


class WebSocketManager:
    def __init__(self) -> None:
        self.connections_by_user: dict[uuid.UUID, set[WebSocket]] = {}
        self.roles_by_socket: dict[WebSocket, Role] = {}

    async def connect(self, websocket: WebSocket, user_id: uuid.UUID, role: Role) -> None:
        await websocket.accept()
        sockets = self.connections_by_user.setdefault(user_id, set())
        sockets.add(websocket)
        self.roles_by_socket[websocket] = role

    def disconnect(self, websocket: WebSocket, user_id: uuid.UUID) -> None:
        sockets = self.connections_by_user.get(user_id)
        if sockets:
            sockets.discard(websocket)
            if len(sockets) == 0:
                self.connections_by_user.pop(user_id, None)
        self.roles_by_socket.pop(websocket, None)

    async def send_user(self, user_id: uuid.UUID, payload: dict) -> None:
        for socket in list(self.connections_by_user.get(user_id, set())):
            try:
                await socket.send_json(payload)
            except Exception:
                self.disconnect(socket, user_id)

    async def broadcast_thread(self, thread: ChatThread, payload: dict) -> None:
        recipients = {thread.customer_id, thread.coach_id}
        for user_id in recipients:
            await self.send_user(user_id, payload)
        await self.send_admins(payload)

    async def send_admins(self, payload: dict) -> None:
        for user_id, sockets in list(self.connections_by_user.items()):
            for socket in list(sockets):
                role = self.roles_by_socket.get(socket)
                if role != Role.ADMIN:
                    continue
                try:
                    await socket.send_json(payload)
                except Exception:
                    self.disconnect(socket, user_id)


ws_manager = WebSocketManager()


async def _serialize_thread_for_user(db: AsyncSession, thread: ChatThread, user: User) -> ThreadResponse:
    message_stmt = (
        select(ChatMessage)
        .where(ChatMessage.thread_id == thread.id, ChatMessage.is_deleted.is_(False))
        .order_by(ChatMessage.created_at.desc())
        .limit(1)
    )
    message_result = await db.execute(message_stmt)
    last_message = message_result.scalar_one_or_none()

    unread_count = 0
    if user.role != Role.ADMIN:
        receipt_stmt = select(ChatReadReceipt).where(
            ChatReadReceipt.thread_id == thread.id,
            ChatReadReceipt.user_id == user.id,
        )
        receipt_result = await db.execute(receipt_stmt)
        receipt = receipt_result.scalar_one_or_none()

        unread_stmt = select(ChatMessage).where(
            ChatMessage.thread_id == thread.id,
            ChatMessage.sender_id != user.id,
            ChatMessage.is_deleted.is_(False),
        )
        if receipt and receipt.last_read_at:
            unread_stmt = unread_stmt.where(ChatMessage.created_at > receipt.last_read_at)
        unread_result = await db.execute(unread_stmt)
        unread_count = len(unread_result.scalars().all())

    return ThreadResponse(
        id=thread.id,
        customer=_to_contact(thread.customer),
        coach=_to_contact(thread.coach),
        last_message=MessageResponse.model_validate(last_message) if last_message else None,
        unread_count=unread_count,
        created_at=thread.created_at,
        updated_at=thread.updated_at,
        last_message_at=thread.last_message_at,
    )


async def _build_message_payload(db: AsyncSession, thread: ChatThread, message: ChatMessage, event_type: str) -> dict:
    payload = {
        "event": event_type,
        "thread_id": str(thread.id),
        "message": MessageResponse.model_validate(message).model_dump(mode="json"),
    }
    return payload


@router.get("/contacts", response_model=StandardResponse[list[ChatContactResponse]])
async def list_chat_contacts(
    current_user: Annotated[User, Depends(dependencies.require_active_customer_subscription)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    if not _is_chat_role(current_user.role):
        raise HTTPException(status_code=403, detail="Operation not permitted")

    if current_user.role == Role.ADMIN:
        stmt = select(User).where(User.role.in_([Role.COACH, Role.CUSTOMER])).order_by(User.full_name)
    elif current_user.role == Role.CUSTOMER:
        stmt = select(User).where(User.role == Role.COACH).order_by(User.full_name)
    else:
        stmt = select(User).where(User.role == Role.CUSTOMER).order_by(User.full_name)

    result = await db.execute(stmt)
    users = result.scalars().all()
    return StandardResponse(data=[_to_contact(user) for user in users])


@router.post("/threads", response_model=StandardResponse[ThreadResponse])
async def create_or_get_thread(
    data: ThreadCreateRequest,
    current_user: Annotated[User, Depends(dependencies.require_active_customer_subscription)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    if current_user.role == Role.ADMIN:
        raise HTTPException(status_code=403, detail="Admin is read-only for chat")
    if current_user.role not in [Role.CUSTOMER, Role.COACH]:
        raise HTTPException(status_code=403, detail="Operation not permitted")

    if current_user.role == Role.CUSTOMER:
        if not data.coach_id:
            raise HTTPException(status_code=400, detail="coach_id is required")
        coach_id = data.coach_id
        customer_id = current_user.id
    else:
        if not data.customer_id:
            raise HTTPException(status_code=400, detail="customer_id is required")
        coach_id = current_user.id
        customer_id = data.customer_id

    users_stmt = select(User).where(User.id.in_([coach_id, customer_id]))
    users_result = await db.execute(users_stmt)
    users = users_result.scalars().all()
    user_map = {u.id: u for u in users}

    coach = user_map.get(coach_id)
    customer = user_map.get(customer_id)
    if not coach or coach.role != Role.COACH:
        raise HTTPException(status_code=404, detail="Coach not found")
    if not customer or customer.role != Role.CUSTOMER:
        raise HTTPException(status_code=404, detail="Customer not found")

    existing_stmt = (
        select(ChatThread)
        .where(ChatThread.customer_id == customer_id, ChatThread.coach_id == coach_id)
        .options(selectinload(ChatThread.customer), selectinload(ChatThread.coach))
    )
    existing_result = await db.execute(existing_stmt)
    thread = existing_result.scalar_one_or_none()

    if not thread:
        now = datetime.now(timezone.utc)
        thread = ChatThread(
            customer_id=customer_id,
            coach_id=coach_id,
            created_at=now,
            updated_at=now,
        )
        db.add(thread)
        await db.commit()
        await db.refresh(thread)
        await db.refresh(thread, attribute_names=["customer", "coach"])

    payload = await _serialize_thread_for_user(db, thread, current_user)
    return StandardResponse(data=payload)


@router.get("/threads", response_model=StandardResponse[list[ThreadResponse]])
async def list_threads(
    current_user: Annotated[User, Depends(dependencies.require_active_customer_subscription)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(30, ge=1, le=100),
    offset: int = Query(0, ge=0),
    sort_by: Literal["last_message_at", "created_at"] = Query("last_message_at"),
    sort_order: Literal["asc", "desc"] = Query("desc"),
    coach_id: uuid.UUID | None = Query(None),
    customer_id: uuid.UUID | None = Query(None),
):
    if not _is_chat_role(current_user.role):
        raise HTTPException(status_code=403, detail="Operation not permitted")

    stmt = select(ChatThread).options(selectinload(ChatThread.customer), selectinload(ChatThread.coach))

    if current_user.role == Role.ADMIN:
        if coach_id:
            stmt = stmt.where(ChatThread.coach_id == coach_id)
        if customer_id:
            stmt = stmt.where(ChatThread.customer_id == customer_id)
    elif current_user.role == Role.CUSTOMER:
        stmt = stmt.where(ChatThread.customer_id == current_user.id)
    else:
        stmt = stmt.where(ChatThread.coach_id == current_user.id)

    sort_field = ChatThread.last_message_at if sort_by == "last_message_at" else ChatThread.created_at
    stmt = stmt.order_by(sort_field.asc() if sort_order == "asc" else sort_field.desc(), ChatThread.updated_at.desc())
    stmt = stmt.offset(offset).limit(limit)

    result = await db.execute(stmt)
    threads = result.scalars().all()

    data = [await _serialize_thread_for_user(db, thread, current_user) for thread in threads]
    return StandardResponse(data=data)


@router.get("/threads/{thread_id}/messages", response_model=StandardResponse[list[MessageResponse]])
async def list_thread_messages(
    thread_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.require_active_customer_subscription)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(50, ge=1, le=100),
    before: datetime | None = Query(None),
):
    if not _is_chat_role(current_user.role):
        raise HTTPException(status_code=403, detail="Operation not permitted")

    thread = await _get_thread_or_404(db, thread_id)
    await _ensure_visible_thread(current_user, thread)

    stmt = (
        select(ChatMessage)
        .where(
            ChatMessage.thread_id == thread_id,
            ChatMessage.is_deleted.is_(False),
        )
        .order_by(ChatMessage.created_at.desc())
        .limit(limit)
    )
    if before:
        stmt = stmt.where(ChatMessage.created_at < before)

    result = await db.execute(stmt)
    messages = list(reversed(result.scalars().all()))
    return StandardResponse(data=[MessageResponse.model_validate(message) for message in messages])


async def _persist_message(
    db: AsyncSession,
    thread: ChatThread,
    sender: User,
    *,
    message_type: str,
    text_content: str | None,
    media_url: str | None = None,
    media_mime: str | None = None,
    media_size_bytes: int | None = None,
    voice_duration_seconds: int | None = None,
) -> ChatMessage:
    now = datetime.now(timezone.utc)
    message = ChatMessage(
        thread_id=thread.id,
        sender_id=sender.id,
        message_type=message_type,
        text_content=text_content,
        media_url=media_url,
        media_mime=media_mime,
        media_size_bytes=media_size_bytes,
        voice_duration_seconds=voice_duration_seconds,
        created_at=now,
    )
    thread.updated_at = now
    thread.last_message_at = now
    db.add(message)
    await db.commit()
    await db.refresh(message)
    return message


@router.post("/threads/{thread_id}/messages", response_model=StandardResponse[MessageResponse])
async def send_text_message(
    thread_id: uuid.UUID,
    data: MessageCreateRequest,
    current_user: Annotated[User, Depends(dependencies.require_active_customer_subscription)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    if not _is_chat_role(current_user.role):
        raise HTTPException(status_code=403, detail="Operation not permitted")

    cleaned = (data.text_content or "").strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="Message text cannot be empty")

    thread = await _get_thread_or_404(db, thread_id)
    await _ensure_sender_allowed(current_user, thread)

    message = await _persist_message(db, thread, current_user, message_type="TEXT", text_content=cleaned)
    await ws_manager.broadcast_thread(thread, await _build_message_payload(db, thread, message, "chat.message.created"))
    return StandardResponse(data=MessageResponse.model_validate(message))


@router.post("/threads/{thread_id}/attachments", response_model=StandardResponse[MessageResponse])
async def upload_attachment(
    thread_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.require_active_customer_subscription)],
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
    text_content: str | None = Form(None),
    voice_duration_seconds: int | None = Form(None),
):
    if not _is_chat_role(current_user.role):
        raise HTTPException(status_code=403, detail="Operation not permitted")
    if current_user.role == Role.ADMIN:
        raise HTTPException(status_code=403, detail="Admin is read-only for chat")

    thread = await _get_thread_or_404(db, thread_id)
    await _ensure_sender_allowed(current_user, thread)

    raw_content_type = (file.content_type or "").lower()
    content_type = raw_content_type.split(";")[0].strip()
    if content_type not in ALL_MIME_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported media type: {raw_content_type or 'unknown'}")

    max_size = MAX_BYTES_BY_MIME[content_type]
    ext = os.path.splitext(file.filename or "")[1].lower()
    if not ext:
        ext = ".bin"

    thread_dir = os.path.join(UPLOAD_DIR, str(thread.id))
    os.makedirs(thread_dir, exist_ok=True)

    file_name = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(thread_dir, file_name)

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

    message_type = _resolve_message_type(content_type)
    message = await _persist_message(
        db,
        thread,
        current_user,
        message_type=message_type,
        text_content=(text_content or "").strip() or None,
        media_url=f"/static/chat_media/{thread.id}/{file_name}",
        media_mime=content_type,
        media_size_bytes=total,
        voice_duration_seconds=voice_duration_seconds if message_type == "VOICE" else None,
    )
    await ws_manager.broadcast_thread(thread, await _build_message_payload(db, thread, message, "chat.message.created"))
    return StandardResponse(data=MessageResponse.model_validate(message))


@router.post("/threads/{thread_id}/read", response_model=StandardResponse)
async def mark_thread_as_read(
    thread_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.require_active_customer_subscription)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    if not _is_chat_role(current_user.role):
        raise HTTPException(status_code=403, detail="Operation not permitted")
    if current_user.role == Role.ADMIN:
        raise HTTPException(status_code=403, detail="Admin is read-only for chat")

    thread = await _get_thread_or_404(db, thread_id)
    await _ensure_sender_allowed(current_user, thread)

    latest_stmt = (
        select(ChatMessage)
        .where(ChatMessage.thread_id == thread_id, ChatMessage.is_deleted.is_(False))
        .order_by(ChatMessage.created_at.desc())
        .limit(1)
    )
    latest_result = await db.execute(latest_stmt)
    latest_message = latest_result.scalar_one_or_none()

    now = datetime.now(timezone.utc)
    receipt_stmt = select(ChatReadReceipt).where(
        ChatReadReceipt.thread_id == thread_id,
        ChatReadReceipt.user_id == current_user.id,
    )
    receipt_result = await db.execute(receipt_stmt)
    receipt = receipt_result.scalar_one_or_none()
    if receipt is None:
        receipt = ChatReadReceipt(thread_id=thread_id, user_id=current_user.id)
        db.add(receipt)

    receipt.last_read_at = now
    receipt.last_read_message_id = latest_message.id if latest_message else None
    await db.commit()

    await ws_manager.broadcast_thread(
        thread,
        {
            "event": "chat.read.updated",
            "thread_id": str(thread.id),
            "user_id": str(current_user.id),
            "last_read_at": now.isoformat(),
        },
    )
    return StandardResponse(message="Read state updated")


async def _get_ws_user(token: str) -> User:
    credentials_exception = HTTPException(status_code=401, detail="Could not validate credentials")
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        username = payload.get("sub")
        token_type = payload.get("type")
        if username is None or token_type != "access":
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.email == username))
        user = result.scalar_one_or_none()
        if user is None:
            raise credentials_exception

        if not _is_chat_role(user.role):
            raise HTTPException(status_code=403, detail="Operation not permitted")

        if user.role == Role.CUSTOMER:
            state = await SubscriptionStatusService.get_user_subscription_state(user.id, db)
            if state.is_subscription_blocked:
                raise HTTPException(status_code=403, detail="Subscription blocked")

        return user


@router.websocket("/ws")
async def chat_websocket(websocket: WebSocket):
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=1008)
        return

    try:
        user = await _get_ws_user(token)
    except HTTPException:
        await websocket.close(code=1008)
        return

    await ws_manager.connect(websocket, user.id, user.role)
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                continue

            action = data.get("action")
            if action == "ping":
                await websocket.send_json({"event": "pong"})
                continue

            if action == "send_message" and user.role == Role.ADMIN:
                await websocket.send_json({"event": "chat.error", "detail": "Admin is read-only for chat"})
                continue

            # Keep v1 write operations over REST to simplify consistency and auth.
            if action == "send_message":
                await websocket.send_json({"event": "chat.error", "detail": "Use REST endpoint for sending messages"})
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, user.id)
