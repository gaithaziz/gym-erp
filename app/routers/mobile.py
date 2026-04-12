import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import dependencies, schemas
from app.core.responses import StandardResponse
from app.database import get_db
from app.models.user import User
from app.routers.chat import (
    MessageCreateRequest as ChatMessageCreateRequest,
    ThreadCreateRequest as ChatThreadCreateRequest,
    create_or_get_thread as create_or_get_chat_thread,
    list_threads as list_chat_threads,
    mark_thread_as_read as mark_chat_thread_as_read,
    send_text_message as send_chat_message,
)
from app.routers.support import (
    SupportMessageCreateRequest,
    SupportTicketCreateRequest,
    add_ticket_message as add_support_ticket_message,
    create_ticket as create_support_ticket,
    list_tickets as list_support_tickets,
)
from app.routers.lost_found import (
    LostFoundCommentCreateRequest,
    LostFoundItemCreateRequest,
    create_lost_found_comment as add_lost_found_comment,
    create_lost_found_item as create_customer_lost_found_item_record,
    get_lost_found_item as get_customer_lost_found_item,
    list_lost_found_items as list_customer_lost_found_items,
)
from app.services.mobile_customer_service import MobileCustomerService
from app.services.mobile_bootstrap_service import MobileBootstrapService

router = APIRouter()


class MobileCustomerHomeResponse(BaseModel):
    subscription: dict[str, Any]
    qr: dict[str, Any]
    quick_stats: dict[str, int]
    latest_biometric: dict[str, Any] | None = None
    recent_receipts: list[dict[str, Any]]


class MobileCustomerBillingResponse(BaseModel):
    subscription: dict[str, Any]
    renewal_offers: list[dict[str, Any]]
    renewal_requests: list[dict[str, Any]]
    payable_items: list[dict[str, Any]]
    receipts: list[dict[str, Any]]
    payment_policy: dict[str, Any]


class MobileCustomerPlansResponse(BaseModel):
    workout_plans: list[dict[str, Any]]
    diet_plans: list[dict[str, Any]]


class MobileCustomerProgressResponse(BaseModel):
    biometrics: list[dict[str, Any]]
    attendance_history: list[dict[str, Any]]
    recent_workout_sessions: list[dict[str, Any]]
    workout_stats: list[dict[str, Any]]


class MobileCustomerNotificationsResponse(BaseModel):
    items: list[dict[str, Any]]


class MobileRenewalRequestCreate(BaseModel):
    offer_code: str = Field(min_length=2, max_length=64)
    duration_days: int = Field(ge=1, le=365)
    customer_note: str | None = Field(default=None, max_length=200)


class MobileNotificationPreferenceUpdate(BaseModel):
    push_enabled: bool = True
    chat_enabled: bool = True
    support_enabled: bool = True
    billing_enabled: bool = True
    announcements_enabled: bool = True


@router.get("/bootstrap", response_model=StandardResponse[schemas.MobileBootstrap])
async def read_mobile_bootstrap(
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    bootstrap = await MobileBootstrapService.build_bootstrap(current_user=current_user, db=db)
    return StandardResponse(data=bootstrap)


@router.get("/customer/home", response_model=StandardResponse[MobileCustomerHomeResponse])
async def read_customer_home(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([schemas.Role.CUSTOMER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    summary = await MobileCustomerService.get_home_summary(current_user=current_user, db=db)
    return StandardResponse(data=MobileCustomerHomeResponse(**summary))


@router.get("/customer/billing", response_model=StandardResponse[MobileCustomerBillingResponse])
async def read_customer_billing(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([schemas.Role.CUSTOMER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    summary = await MobileCustomerService.get_billing_overview(current_user=current_user, db=db)
    return StandardResponse(data=MobileCustomerBillingResponse(**summary))


@router.get("/customer/receipts/{transaction_id}", response_model=StandardResponse[dict[str, Any]])
async def read_customer_receipt_detail(
    transaction_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([schemas.Role.CUSTOMER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    try:
        detail = await MobileCustomerService.get_receipt_detail(
            current_user=current_user,
            transaction_id=transaction_id,
            db=db,
        )
    except ValueError:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Receipt not found")
    return StandardResponse(data=detail)


@router.get("/customer/plans", response_model=StandardResponse[MobileCustomerPlansResponse])
async def read_customer_plans(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([schemas.Role.CUSTOMER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    payload = await MobileCustomerService.get_plans(current_user=current_user, db=db)
    return StandardResponse(data=MobileCustomerPlansResponse(**payload))


@router.get("/customer/progress", response_model=StandardResponse[MobileCustomerProgressResponse])
async def read_customer_progress(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([schemas.Role.CUSTOMER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    payload = await MobileCustomerService.get_progress(current_user=current_user, db=db)
    return StandardResponse(data=MobileCustomerProgressResponse(**payload))


@router.get("/customer/notifications", response_model=StandardResponse[MobileCustomerNotificationsResponse])
async def read_customer_notifications(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([schemas.Role.CUSTOMER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    items = await MobileCustomerService.get_notifications(current_user=current_user, db=db)
    return StandardResponse(data=MobileCustomerNotificationsResponse(items=items))


@router.get("/customer/notification-settings", response_model=StandardResponse[schemas.NotificationPreference])
async def read_customer_notification_settings(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([schemas.Role.CUSTOMER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    prefs = await MobileCustomerService.get_notification_preferences(current_user=current_user, db=db)
    return StandardResponse(data=schemas.NotificationPreference(**prefs))


@router.put("/customer/notification-settings", response_model=StandardResponse[schemas.NotificationPreference])
async def update_customer_notification_settings(
    payload: MobileNotificationPreferenceUpdate,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([schemas.Role.CUSTOMER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    prefs = await MobileCustomerService.update_notification_preferences(
        current_user=current_user,
        db=db,
        **payload.model_dump(),
    )
    return StandardResponse(data=schemas.NotificationPreference(**prefs), message="Notification settings updated")


@router.get("/customer/billing/renewal-requests", response_model=StandardResponse[dict[str, Any]])
async def list_customer_renewal_requests(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([schemas.Role.CUSTOMER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    data = await MobileCustomerService.list_renewal_requests(current_user=current_user, db=db)
    return StandardResponse(data={"items": data})


@router.post("/customer/billing/renewal-requests", response_model=StandardResponse[dict[str, Any]])
async def create_customer_renewal_request(
    payload: MobileRenewalRequestCreate,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([schemas.Role.CUSTOMER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    try:
        data = await MobileCustomerService.create_renewal_request(
            current_user=current_user,
            db=db,
            offer_code=payload.offer_code,
            duration_days=payload.duration_days,
            customer_note=payload.customer_note,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return StandardResponse(data=data, message="Renewal request submitted")


@router.get("/customer/support/tickets", response_model=StandardResponse)
async def read_customer_support_tickets(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([schemas.Role.CUSTOMER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    response = type("ResponseStub", (), {"headers": {}})()
    result = await list_support_tickets(current_user=current_user, db=db, response=response)
    return result


@router.post("/customer/support/tickets", response_model=StandardResponse)
async def create_customer_support_ticket(
    payload: SupportTicketCreateRequest,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([schemas.Role.CUSTOMER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await create_support_ticket(data=payload, current_user=current_user, db=db)


@router.post("/customer/support/tickets/{ticket_id}/messages", response_model=StandardResponse)
async def create_customer_support_ticket_message(
    ticket_id: uuid.UUID,
    payload: SupportMessageCreateRequest,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([schemas.Role.CUSTOMER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await add_support_ticket_message(ticket_id=ticket_id, data=payload, current_user=current_user, db=db)


@router.get("/customer/lost-found/items", response_model=StandardResponse)
async def read_customer_lost_found_items(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([schemas.Role.CUSTOMER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await list_customer_lost_found_items(
        current_user=current_user,
        db=db,
        limit=30,
        offset=0,
        status=None,
        assignee_id=None,
        reporter_id=None,
        archived_only=False,
    )


@router.post("/customer/lost-found/items", response_model=StandardResponse)
async def create_customer_lost_found_item(
    payload: LostFoundItemCreateRequest,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([schemas.Role.CUSTOMER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await create_customer_lost_found_item_record(payload=payload, current_user=current_user, db=db)


@router.get("/customer/lost-found/items/{item_id}", response_model=StandardResponse)
async def read_customer_lost_found_item(
    item_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([schemas.Role.CUSTOMER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await get_customer_lost_found_item(item_id=item_id, current_user=current_user, db=db)


@router.post("/customer/lost-found/items/{item_id}/comments", response_model=StandardResponse)
async def create_customer_lost_found_comment(
    item_id: uuid.UUID,
    payload: LostFoundCommentCreateRequest,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([schemas.Role.CUSTOMER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await add_lost_found_comment(item_id=item_id, payload=payload, current_user=current_user, db=db)


@router.get("/customer/chat/threads", response_model=StandardResponse)
async def read_customer_chat_threads(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([schemas.Role.CUSTOMER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await list_chat_threads(current_user=current_user, db=db)


@router.post("/customer/chat/threads", response_model=StandardResponse)
async def create_customer_chat_thread(
    payload: ChatThreadCreateRequest,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([schemas.Role.CUSTOMER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await create_or_get_chat_thread(data=payload, current_user=current_user, db=db)


@router.post("/customer/chat/threads/{thread_id}/messages", response_model=StandardResponse)
async def create_customer_chat_message(
    thread_id: uuid.UUID,
    payload: ChatMessageCreateRequest,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([schemas.Role.CUSTOMER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await send_chat_message(thread_id=thread_id, data=payload, current_user=current_user, db=db)


@router.post("/customer/chat/threads/{thread_id}/read", response_model=StandardResponse)
async def read_customer_chat_thread_mark_read(
    thread_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([schemas.Role.CUSTOMER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await mark_chat_thread_as_read(thread_id=thread_id, current_user=current_user, db=db)
