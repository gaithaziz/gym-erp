import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import dependencies, schemas
from app.auth.router import (
    change_password as change_current_user_password,
    read_users_me as read_current_user_profile,
    update_user_me as update_current_user_profile,
    upload_profile_picture as upload_current_user_profile_picture,
)
from app.core.responses import StandardResponse
from app.database import get_db
from app.models.finance import PaymentMethod
from app.models.user import User
from app.routers.chat import (
    MessageCreateRequest as ChatMessageCreateRequest,
    list_chat_contacts,
    list_thread_messages as list_chat_thread_messages,
    ThreadCreateRequest as ChatThreadCreateRequest,
    create_or_get_thread as create_or_get_chat_thread,
    list_threads as list_chat_threads,
    mark_thread_as_read as mark_chat_thread_as_read,
    send_text_message as send_chat_message,
    upload_attachment as upload_chat_attachment,
)
from app.routers.support import (
    SupportMessageCreateRequest,
    SupportTicketCreateRequest,
    add_ticket_attachment as add_support_ticket_attachment,
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
    upload_lost_found_media as upload_customer_lost_found_media,
)
from app.services.mobile_customer_service import MobileCustomerService
from app.services.mobile_bootstrap_service import MobileBootstrapService
from app.services.mobile_staff_service import MobileStaffService
from app.services.mobile_admin_service import MobileAdminService

router = APIRouter()


class MobileCustomerHomeResponse(BaseModel):
    subscription: dict[str, Any]
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
    personal_records: list[dict[str, Any]] = Field(default_factory=list)


class MobileCustomerNotificationsResponse(BaseModel):
    items: list[dict[str, Any]]


class MobileCustomerFeedbackHistoryResponse(BaseModel):
    workout_feedback: list[dict[str, Any]]
    diet_feedback: list[dict[str, Any]]
    gym_feedback: list[dict[str, Any]]


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


class MobileStaffHomeResponse(BaseModel):
    role: str
    headline: str
    stats: dict[str, int | float]
    quick_actions: list[dict[str, str | None]]
    items: list[dict[str, Any]]


class MobileStaffMemberSummaryResponse(BaseModel):
    id: uuid.UUID
    full_name: str | None = None
    email: str
    phone_number: str | None = None
    profile_picture_url: str | None = None
    subscription: dict[str, Any]
    latest_biometric_date: str | None = None


class MobileStaffMemberDetailResponse(BaseModel):
    member: dict[str, Any]
    subscription: dict[str, Any]
    active_workout_plans: list[dict[str, Any]]
    active_diet_plans: list[dict[str, Any]]
    latest_biometric: dict[str, Any] | None = None
    recent_attendance: list[dict[str, Any]]
    biometrics: list[dict[str, Any]] = Field(default_factory=list)
    recent_workout_sessions: list[dict[str, Any]] = Field(default_factory=list)
    workout_feedback: list[dict[str, Any]] = Field(default_factory=list)
    diet_feedback: list[dict[str, Any]] = Field(default_factory=list)
    gym_feedback: list[dict[str, Any]] = Field(default_factory=list)


class MobileStaffMemberRegistrationRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    phone_number: str | None = Field(default=None, max_length=32, pattern=r"^\+?[0-9][0-9\s\-()]{6,19}$")
    password: str = Field(min_length=6, max_length=128)


class MobileStaffMemberRegistrationResponse(BaseModel):
    member: MobileStaffMemberSummaryResponse


class MobileCheckInProcessRequest(BaseModel):
    member_id: uuid.UUID
    kiosk_id: str = Field(min_length=2, max_length=120)


class MobileCheckInLookupResponse(BaseModel):
    query: str
    items: list[dict[str, Any]]


class MobileCheckInResultResponse(BaseModel):
    member_id: str
    member_name: str | None = None
    status: str | None = None
    reason: str | None = None
    kiosk_id: str | None = None
    scan_time: str | None = None


class MobileFinanceSummaryResponse(BaseModel):
    today_sales_total: float
    today_sales_count: int
    low_stock_count: int
    recent_transactions: list[dict[str, Any]]


class MobilePOSCheckoutItem(BaseModel):
    product_id: uuid.UUID
    quantity: int = Field(ge=1, le=999)


class MobilePOSCheckoutRequest(BaseModel):
    items: list[MobilePOSCheckoutItem] = Field(min_length=1, max_length=50)
    payment_method: PaymentMethod = PaymentMethod.CASH
    member_id: uuid.UUID | None = None
    idempotency_key: str | None = Field(default=None, min_length=8, max_length=160)


class MobilePOSCheckoutResponse(BaseModel):
    transaction_id: uuid.UUID
    date: str
    total: float
    payment_method: str
    member_name: str | None = None
    line_items: list[dict[str, Any]]
    remaining_stock: list[dict[str, Any]]
    receipt_url: str
    receipt_print_url: str
    receipt_export_url: str
    receipt_export_pdf_url: str


class MobileCoachFeedbackResponse(BaseModel):
    stats: dict[str, int]
    workout_feedback: list[dict[str, Any]]
    diet_feedback: list[dict[str, Any]]
    gym_feedback: list[dict[str, Any]]


class MobileCoachPlansResponse(BaseModel):
    workouts: list[dict[str, Any]]
    diets: list[dict[str, Any]]


class MobileDeviceRegistrationRequest(BaseModel):
    device_token: str = Field(min_length=8, max_length=512)
    platform: str = Field(min_length=2, max_length=32)
    device_name: str | None = Field(default=None, max_length=120)


class MobileDeviceRegistrationResponse(BaseModel):
    device_token: str
    platform: str
    device_name: str | None = None
    registered: bool


class MobileAdminMetric(BaseModel):
    id: str
    label: str
    value: int | float | str
    tone: str = "neutral"


class MobileAdminAlert(BaseModel):
    id: str
    severity: str
    title: str
    body: str
    route: str | None = None
    count: int = 0


class MobileAdminApproval(BaseModel):
    id: str
    kind: str
    title: str
    subtitle: str | None = None
    count: int = 0
    route: str | None = None


class MobileAdminActivityItem(BaseModel):
    id: str
    kind: str
    title: str
    subtitle: str | None = None
    timestamp: str | None = None
    route: str | None = None


class MobileAdminHomeResponse(BaseModel):
    headline: str
    metrics: list[MobileAdminMetric]
    alerts: list[MobileAdminAlert]
    approvals: list[MobileAdminApproval]
    recent_activity: list[MobileAdminActivityItem]


class MobileAdminPeopleSummaryResponse(BaseModel):
    members: dict[str, Any]
    staff: dict[str, Any]
    attendance: dict[str, Any]
    recent_members: list[dict[str, Any]]


class MobileAdminOperationsSummaryResponse(BaseModel):
    attendance: dict[str, Any]
    support: dict[str, Any]
    inventory: dict[str, Any]
    notifications: dict[str, Any]
    approvals: dict[str, Any]
    recent_support_tickets: list[dict[str, Any]]


class MobileAdminFinanceSummaryResponse(BaseModel):
    today: dict[str, float]
    month: dict[str, float]
    low_stock_count: int
    recent_transactions: list[dict[str, Any]]


class MobileAdminAuditSummaryResponse(BaseModel):
    total_events: int
    action_counts: list[dict[str, Any]]
    recent_events: list[dict[str, Any]]
    security: dict[str, Any]


class MobileAdminInventorySummaryResponse(BaseModel):
    total_active_products: int
    low_stock_count: int
    out_of_stock_count: int
    low_stock_products: list[dict[str, Any]]


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


@router.get("/customer/feedback/history", response_model=StandardResponse[MobileCustomerFeedbackHistoryResponse])
async def read_customer_feedback_history(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([schemas.Role.CUSTOMER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    payload = await MobileCustomerService.get_feedback_history(current_user=current_user, db=db)
    return StandardResponse(data=MobileCustomerFeedbackHistoryResponse(**payload))


@router.get("/customer/profile", response_model=StandardResponse[schemas.UserResponse])
async def read_customer_profile(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([schemas.Role.CUSTOMER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await read_current_user_profile(current_user=current_user, db=db)


@router.put("/customer/profile", response_model=StandardResponse[schemas.UserResponse])
async def update_customer_profile(
    payload: schemas.UserUpdate,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([schemas.Role.CUSTOMER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await update_current_user_profile(user_update=payload, current_user=current_user, db=db)


@router.put("/customer/profile/password", response_model=StandardResponse)
async def update_customer_password(
    payload: schemas.PasswordChange,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([schemas.Role.CUSTOMER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await change_current_user_password(password_data=payload, current_user=current_user, db=db)


@router.post("/customer/profile/picture", response_model=StandardResponse[schemas.UserResponse])
async def update_customer_profile_picture(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([schemas.Role.CUSTOMER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
):
    return await upload_current_user_profile_picture(current_user=current_user, db=db, file=file)


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
    result = await list_support_tickets(
        current_user=current_user,
        db=db,
        response=response,
        status_filter=None,
        is_active=None,
        category=None,
        limit=50,
        offset=0,
    )
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


@router.post("/customer/support/tickets/{ticket_id}/attachments", response_model=StandardResponse)
async def create_customer_support_ticket_attachment(
    ticket_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([schemas.Role.CUSTOMER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
    message: str | None = Form(None),
):
    return await add_support_ticket_attachment(
        ticket_id=ticket_id,
        current_user=current_user,
        db=db,
        file=file,
        message=message,
    )


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


@router.post("/customer/lost-found/items/{item_id}/media", response_model=StandardResponse)
async def create_customer_lost_found_media(
    item_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([schemas.Role.CUSTOMER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
):
    return await upload_customer_lost_found_media(item_id=item_id, current_user=current_user, db=db, file=file)


@router.get("/customer/chat/threads", response_model=StandardResponse)
async def read_customer_chat_threads(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([schemas.Role.CUSTOMER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await list_chat_threads(
        current_user=current_user,
        db=db,
        limit=30,
        offset=0,
        sort_by="last_message_at",
        sort_order="desc",
        coach_id=None,
        customer_id=None,
    )


@router.get("/customer/chat/coaches", response_model=StandardResponse)
async def read_customer_chat_coaches(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([schemas.Role.CUSTOMER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return StandardResponse(data=await MobileCustomerService.list_relevant_chat_coaches(current_user=current_user, db=db))


@router.post("/customer/chat/threads", response_model=StandardResponse)
async def create_customer_chat_thread(
    payload: ChatThreadCreateRequest,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([schemas.Role.CUSTOMER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await create_or_get_chat_thread(data=payload, current_user=current_user, db=db)


@router.get("/customer/chat/threads/{thread_id}/messages", response_model=StandardResponse)
async def read_customer_chat_messages(
    thread_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([schemas.Role.CUSTOMER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(50, ge=1, le=100),
):
    return await list_chat_thread_messages(
        thread_id=thread_id,
        current_user=current_user,
        db=db,
        limit=limit,
        before=None,
    )


@router.post("/customer/chat/threads/{thread_id}/messages", response_model=StandardResponse)
async def create_customer_chat_message(
    thread_id: uuid.UUID,
    payload: ChatMessageCreateRequest,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([schemas.Role.CUSTOMER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await send_chat_message(thread_id=thread_id, data=payload, current_user=current_user, db=db)


@router.post("/customer/chat/threads/{thread_id}/attachments", response_model=StandardResponse)
async def create_customer_chat_attachment(
    thread_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([schemas.Role.CUSTOMER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
    text_content: str | None = Form(None),
    voice_duration_seconds: int | None = Form(None),
):
    return await upload_chat_attachment(
        thread_id=thread_id,
        current_user=current_user,
        db=db,
        file=file,
        text_content=text_content,
        voice_duration_seconds=voice_duration_seconds,
    )


@router.post("/customer/chat/threads/{thread_id}/read", response_model=StandardResponse)
async def read_customer_chat_thread_mark_read(
    thread_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([schemas.Role.CUSTOMER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await mark_chat_thread_as_read(thread_id=thread_id, current_user=current_user, db=db)


@router.get("/me/profile", response_model=StandardResponse[schemas.UserResponse])
async def read_my_profile(
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await read_current_user_profile(current_user=current_user, db=db)


@router.put("/me/profile", response_model=StandardResponse[schemas.UserResponse])
async def update_my_profile(
    payload: schemas.UserUpdate,
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await update_current_user_profile(user_update=payload, current_user=current_user, db=db)


@router.put("/me/profile/password", response_model=StandardResponse)
async def update_my_password(
    payload: schemas.PasswordChange,
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await change_current_user_password(password_data=payload, current_user=current_user, db=db)


@router.post("/me/profile/picture", response_model=StandardResponse[schemas.UserResponse])
async def update_my_profile_picture(
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
):
    return await upload_current_user_profile_picture(current_user=current_user, db=db, file=file)


@router.get("/me/notifications", response_model=StandardResponse[MobileCustomerNotificationsResponse])
async def read_my_notifications(
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    items = await MobileCustomerService.get_notifications(current_user=current_user, db=db)
    return StandardResponse(data=MobileCustomerNotificationsResponse(items=items))


@router.get("/me/notification-settings", response_model=StandardResponse[schemas.NotificationPreference])
async def read_my_notification_settings(
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    prefs = await MobileStaffService.get_notification_preferences(current_user=current_user, db=db)
    return StandardResponse(data=schemas.NotificationPreference(**prefs))


@router.put("/me/notification-settings", response_model=StandardResponse[schemas.NotificationPreference])
async def update_my_notification_settings(
    payload: MobileNotificationPreferenceUpdate,
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    prefs = await MobileStaffService.update_notification_preferences(
        current_user=current_user,
        db=db,
        **payload.model_dump(),
    )
    return StandardResponse(data=schemas.NotificationPreference(**prefs), message="Notification settings updated")


@router.get("/chat/contacts", response_model=StandardResponse)
async def read_chat_contacts(
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    if current_user.role not in [schemas.Role.CUSTOMER, schemas.Role.COACH, schemas.Role.ADMIN]:
        raise HTTPException(status_code=403, detail="Chat is not available for this role")
    if current_user.role == schemas.Role.CUSTOMER:
        return StandardResponse(data=await MobileCustomerService.list_relevant_chat_coaches(current_user=current_user, db=db))
    return await list_chat_contacts(current_user=current_user, db=db)


@router.get("/chat/threads", response_model=StandardResponse)
async def read_chat_threads(
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await list_chat_threads(
        current_user=current_user,
        db=db,
        limit=30,
        offset=0,
        sort_by="last_message_at",
        sort_order="desc",
        coach_id=None,
        customer_id=None,
    )


@router.post("/chat/threads", response_model=StandardResponse)
async def create_chat_thread(
    payload: ChatThreadCreateRequest,
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await create_or_get_chat_thread(data=payload, current_user=current_user, db=db)


@router.get("/chat/threads/{thread_id}/messages", response_model=StandardResponse)
async def read_chat_messages(
    thread_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(50, ge=1, le=100),
):
    return await list_chat_thread_messages(thread_id=thread_id, current_user=current_user, db=db, limit=limit, before=None)


@router.post("/chat/threads/{thread_id}/messages", response_model=StandardResponse)
async def create_chat_message(
    thread_id: uuid.UUID,
    payload: ChatMessageCreateRequest,
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await send_chat_message(thread_id=thread_id, data=payload, current_user=current_user, db=db)


@router.post("/chat/threads/{thread_id}/attachments", response_model=StandardResponse)
async def create_chat_attachment(
    thread_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
    text_content: str | None = Form(None),
    voice_duration_seconds: int | None = Form(None),
):
    return await upload_chat_attachment(
        thread_id=thread_id,
        current_user=current_user,
        db=db,
        file=file,
        text_content=text_content,
        voice_duration_seconds=voice_duration_seconds,
    )


@router.post("/chat/threads/{thread_id}/read", response_model=StandardResponse)
async def mark_chat_thread_read(
    thread_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await mark_chat_thread_as_read(thread_id=thread_id, current_user=current_user, db=db)


@router.get("/support/tickets", response_model=StandardResponse)
async def read_support_tickets(
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    response = type("ResponseStub", (), {"headers": {}})()
    return await list_support_tickets(
        current_user=current_user,
        db=db,
        response=response,
        status_filter=None,
        is_active=None,
        category=None,
        limit=50,
        offset=0,
    )


@router.post("/support/tickets", response_model=StandardResponse)
async def create_support_ticket_mobile(
    payload: SupportTicketCreateRequest,
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await create_support_ticket(data=payload, current_user=current_user, db=db)


@router.post("/support/tickets/{ticket_id}/messages", response_model=StandardResponse)
async def create_support_ticket_message_mobile(
    ticket_id: uuid.UUID,
    payload: SupportMessageCreateRequest,
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await add_support_ticket_message(ticket_id=ticket_id, data=payload, current_user=current_user, db=db)


@router.post("/support/tickets/{ticket_id}/attachments", response_model=StandardResponse)
async def create_support_ticket_attachment_mobile(
    ticket_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
    message: str | None = Form(None),
):
    return await add_support_ticket_attachment(ticket_id=ticket_id, current_user=current_user, db=db, file=file, message=message)


@router.get("/lost-found/items", response_model=StandardResponse)
async def read_lost_found_items_mobile(
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
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


@router.post("/lost-found/items", response_model=StandardResponse)
async def create_lost_found_item_mobile(
    payload: LostFoundItemCreateRequest,
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await create_customer_lost_found_item_record(payload=payload, current_user=current_user, db=db)


@router.get("/lost-found/items/{item_id}", response_model=StandardResponse)
async def read_lost_found_item_mobile(
    item_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await get_customer_lost_found_item(item_id=item_id, current_user=current_user, db=db)


@router.post("/lost-found/items/{item_id}/comments", response_model=StandardResponse)
async def create_lost_found_comment_mobile(
    item_id: uuid.UUID,
    payload: LostFoundCommentCreateRequest,
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await add_lost_found_comment(item_id=item_id, payload=payload, current_user=current_user, db=db)


@router.post("/lost-found/items/{item_id}/media", response_model=StandardResponse)
async def create_lost_found_media_mobile(
    item_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
):
    return await upload_customer_lost_found_media(item_id=item_id, current_user=current_user, db=db, file=file)


@router.get("/admin/home", response_model=StandardResponse[MobileAdminHomeResponse])
async def read_admin_mobile_home(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([schemas.Role.ADMIN, schemas.Role.MANAGER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    data = await MobileAdminService.get_home_summary(current_user=current_user, db=db)
    return StandardResponse(data=MobileAdminHomeResponse(**data))


@router.get("/admin/people/summary", response_model=StandardResponse[MobileAdminPeopleSummaryResponse])
async def read_admin_mobile_people_summary(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([schemas.Role.ADMIN, schemas.Role.MANAGER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    data = await MobileAdminService.get_people_summary(current_user=current_user, db=db)
    return StandardResponse(data=MobileAdminPeopleSummaryResponse(**data))


@router.get("/admin/operations/summary", response_model=StandardResponse[MobileAdminOperationsSummaryResponse])
async def read_admin_mobile_operations_summary(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([schemas.Role.ADMIN, schemas.Role.MANAGER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    data = await MobileAdminService.get_operations_summary(current_user=current_user, db=db)
    return StandardResponse(data=MobileAdminOperationsSummaryResponse(**data))


@router.get("/admin/finance/summary", response_model=StandardResponse[MobileAdminFinanceSummaryResponse])
async def read_admin_mobile_finance_summary(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([schemas.Role.ADMIN, schemas.Role.MANAGER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    data = await MobileAdminService.get_finance_summary(current_user=current_user, db=db)
    return StandardResponse(data=MobileAdminFinanceSummaryResponse(**data))


@router.get("/admin/audit/summary", response_model=StandardResponse[MobileAdminAuditSummaryResponse])
async def read_admin_mobile_audit_summary(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([schemas.Role.ADMIN, schemas.Role.MANAGER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    data = await MobileAdminService.get_audit_summary(current_user=current_user, db=db)
    return StandardResponse(data=MobileAdminAuditSummaryResponse(**data))


@router.get("/admin/inventory/summary", response_model=StandardResponse[MobileAdminInventorySummaryResponse])
async def read_admin_mobile_inventory_summary(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([schemas.Role.ADMIN, schemas.Role.MANAGER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    data = await MobileAdminService.get_inventory_summary(current_user=current_user, db=db)
    return StandardResponse(data=MobileAdminInventorySummaryResponse(**data))


@router.get("/staff/home", response_model=StandardResponse[MobileStaffHomeResponse])
async def read_staff_home(
    current_user: Annotated[
        User,
        Depends(
            dependencies.RoleChecker(
                [schemas.Role.COACH, schemas.Role.RECEPTION, schemas.Role.FRONT_DESK, schemas.Role.CASHIER, schemas.Role.EMPLOYEE]
            )
        ),
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    data = await MobileStaffService.get_home_summary(current_user=current_user, db=db)
    return StandardResponse(data=MobileStaffHomeResponse(**data))


@router.get("/staff/members", response_model=StandardResponse[list[MobileStaffMemberSummaryResponse]])
async def read_staff_members(
    current_user: Annotated[
        User,
        Depends(
            dependencies.RoleChecker(
                [schemas.Role.COACH, schemas.Role.RECEPTION, schemas.Role.FRONT_DESK, schemas.Role.ADMIN, schemas.Role.MANAGER]
            )
        ),
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
    q: str | None = Query(default=None),
):
    items = await MobileStaffService.list_members(current_user=current_user, db=db, query=q)
    return StandardResponse(data=[MobileStaffMemberSummaryResponse(**item) for item in items])


@router.post("/staff/members/register", response_model=StandardResponse[MobileStaffMemberRegistrationResponse])
async def register_staff_member(
    payload: MobileStaffMemberRegistrationRequest,
    current_user: Annotated[
        User,
        Depends(
            dependencies.RoleChecker(
                [schemas.Role.RECEPTION, schemas.Role.FRONT_DESK, schemas.Role.ADMIN, schemas.Role.MANAGER]
            )
        ),
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    try:
        member = await MobileStaffService.register_member(
            current_user=current_user,
            db=db,
            email=payload.email,
            full_name=payload.full_name,
            phone_number=payload.phone_number,
            password=payload.password,
        )
    except ValueError as exc:
        detail = str(exc)
        status_code = 403 if detail == "Not allowed" else 400
        raise HTTPException(status_code=status_code, detail=detail) from exc
    return StandardResponse(
        data=MobileStaffMemberRegistrationResponse(member=MobileStaffMemberSummaryResponse(**member)),
        message="Member registered successfully",
    )


@router.get("/staff/members/{member_id}", response_model=StandardResponse[MobileStaffMemberDetailResponse])
async def read_staff_member_detail(
    member_id: uuid.UUID,
    current_user: Annotated[
        User,
        Depends(
            dependencies.RoleChecker(
                [schemas.Role.COACH, schemas.Role.RECEPTION, schemas.Role.FRONT_DESK, schemas.Role.ADMIN, schemas.Role.MANAGER]
            )
        ),
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    try:
        data = await MobileStaffService.get_member_detail(current_user=current_user, member_id=member_id, db=db)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return StandardResponse(data=MobileStaffMemberDetailResponse(**data))


@router.get("/staff/check-in/lookup", response_model=StandardResponse[MobileCheckInLookupResponse])
async def lookup_staff_check_in(
    q: str,
    current_user: Annotated[
        User,
        Depends(
            dependencies.RoleChecker(
                [schemas.Role.COACH, schemas.Role.RECEPTION, schemas.Role.FRONT_DESK, schemas.Role.ADMIN, schemas.Role.MANAGER]
            )
        ),
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    data = await MobileStaffService.lookup_members(current_user=current_user, db=db, query=q)
    return StandardResponse(data=MobileCheckInLookupResponse(**data))


@router.post("/staff/check-in/process", response_model=StandardResponse[MobileCheckInResultResponse])
async def process_staff_check_in(
    payload: MobileCheckInProcessRequest,
    current_user: Annotated[
        User,
        Depends(
            dependencies.RoleChecker(
                [schemas.Role.COACH, schemas.Role.RECEPTION, schemas.Role.FRONT_DESK, schemas.Role.ADMIN, schemas.Role.MANAGER]
            )
        ),
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    try:
        data = await MobileStaffService.process_check_in(
            current_user=current_user,
            db=db,
            member_id=payload.member_id,
            kiosk_id=payload.kiosk_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return StandardResponse(data=MobileCheckInResultResponse(**data))


@router.get("/staff/finance/summary", response_model=StandardResponse[MobileFinanceSummaryResponse])
async def read_staff_finance_summary(
    current_user: Annotated[
        User,
        Depends(dependencies.RoleChecker([schemas.Role.CASHIER, schemas.Role.ADMIN, schemas.Role.MANAGER])),
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    data = await MobileStaffService.get_finance_summary(current_user=current_user, db=db)
    return StandardResponse(data=MobileFinanceSummaryResponse(**data))


@router.post("/staff/pos/checkout", response_model=StandardResponse[MobilePOSCheckoutResponse])
async def checkout_staff_pos_cart(
    payload: MobilePOSCheckoutRequest,
    current_user: Annotated[
        User,
        Depends(dependencies.RoleChecker([schemas.Role.CASHIER, schemas.Role.ADMIN, schemas.Role.MANAGER])),
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    try:
        data = await MobileStaffService.checkout_pos_cart(
            current_user=current_user,
            db=db,
            items=[item.model_dump() for item in payload.items],
            payment_method=payload.payment_method,
            member_id=payload.member_id,
            idempotency_key=payload.idempotency_key,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return StandardResponse(data=MobilePOSCheckoutResponse(**data))


@router.get("/staff/transactions/recent", response_model=StandardResponse[list[dict[str, Any]]])
async def read_staff_recent_transactions(
    current_user: Annotated[
        User,
        Depends(dependencies.RoleChecker([schemas.Role.CASHIER, schemas.Role.ADMIN, schemas.Role.MANAGER])),
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(20, ge=1, le=100),
):
    return StandardResponse(data=await MobileStaffService.get_recent_transactions(current_user=current_user, db=db, limit=limit))


@router.get("/staff/coach/feedback", response_model=StandardResponse[MobileCoachFeedbackResponse])
async def read_coach_feedback_summary(
    current_user: Annotated[
        User,
        Depends(dependencies.RoleChecker([schemas.Role.COACH])),
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    data = await MobileStaffService.get_coach_feedback_summary(current_user=current_user, db=db)
    return StandardResponse(data=MobileCoachFeedbackResponse(**data))


@router.get("/staff/coach/plans", response_model=StandardResponse[MobileCoachPlansResponse])
async def read_coach_plans_summary(
    current_user: Annotated[
        User,
        Depends(dependencies.RoleChecker([schemas.Role.COACH])),
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    data = await MobileStaffService.get_coach_plans_summary(current_user=current_user, db=db)
    return StandardResponse(data=MobileCoachPlansResponse(**data))


@router.post("/devices/register", response_model=StandardResponse[MobileDeviceRegistrationResponse])
async def register_device(
    payload: MobileDeviceRegistrationRequest,
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    data = await MobileStaffService.register_device(
        current_user=current_user,
        db=db,
        device_token=payload.device_token,
        platform=payload.platform,
        device_name=payload.device_name,
    )
    return StandardResponse(
        data=MobileDeviceRegistrationResponse(**data),
        message="Device registered",
    )


@router.post("/devices/unregister", response_model=StandardResponse[MobileDeviceRegistrationResponse])
async def unregister_device(
    payload: MobileDeviceRegistrationRequest,
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    data = await MobileStaffService.unregister_device(
        current_user=current_user,
        db=db,
        device_token=payload.device_token,
        platform=payload.platform,
        device_name=payload.device_name,
    )
    return StandardResponse(
        data=MobileDeviceRegistrationResponse(**data),
        message="Device unregistered",
    )
