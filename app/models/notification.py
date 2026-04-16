import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class WhatsAppDeliveryLog(Base):
    __tablename__ = "whatsapp_delivery_logs"
    __table_args__ = (
        UniqueConstraint("idempotency_key", name="uq_whatsapp_delivery_logs_idempotency_key"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    phone_number: Mapped[str | None] = mapped_column(String, nullable=True)
    template_key: Mapped[str] = mapped_column(String, nullable=False)
    payload_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    event_type: Mapped[str] = mapped_column(String, nullable=False, index=True)
    event_ref: Mapped[str | None] = mapped_column(String, nullable=True)
    idempotency_key: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="QUEUED", index=True)
    provider_message_id: Mapped[str | None] = mapped_column(String, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    failed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user = relationship("User")


class WhatsAppAutomationRule(Base):
    __tablename__ = "whatsapp_automation_rules"
    __table_args__ = (
        UniqueConstraint("event_type", name="uq_whatsapp_automation_rules_event_type"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    event_type: Mapped[str] = mapped_column(String, nullable=False, index=True)
    trigger_name: Mapped[str] = mapped_column(String, nullable=False)
    template_key: Mapped[str] = mapped_column(String, nullable=False)
    message_template: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_enabled: Mapped[bool] = mapped_column(default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    updater = relationship("User")


class MobileNotificationPreference(Base):
    __tablename__ = "mobile_notification_preferences"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    push_enabled: Mapped[bool] = mapped_column(default=True, nullable=False)
    chat_enabled: Mapped[bool] = mapped_column(default=True, nullable=False)
    support_enabled: Mapped[bool] = mapped_column(default=True, nullable=False)
    billing_enabled: Mapped[bool] = mapped_column(default=True, nullable=False)
    announcements_enabled: Mapped[bool] = mapped_column(default=True, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)

    user = relationship("User")


class MobileDevice(Base):
    __tablename__ = "mobile_devices"
    __table_args__ = (
        UniqueConstraint("device_token", name="uq_mobile_devices_device_token"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    device_token: Mapped[str] = mapped_column(String(512), nullable=False, index=True)
    platform: Mapped[str] = mapped_column(String(32), nullable=False)
    device_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    registered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    unregistered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)

    user = relationship("User")


class PushDeliveryLog(Base):
    __tablename__ = "push_delivery_logs"
    __table_args__ = (
        UniqueConstraint("idempotency_key", name="uq_push_delivery_logs_idempotency_key"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    device_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("mobile_devices.id"), nullable=True, index=True)
    device_token: Mapped[str | None] = mapped_column(String(512), nullable=True)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    data_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    event_type: Mapped[str] = mapped_column(String, nullable=False, index=True)
    event_ref: Mapped[str | None] = mapped_column(String, nullable=True)
    idempotency_key: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="QUEUED", index=True)
    provider_message_id: Mapped[str | None] = mapped_column(String, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    failed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user = relationship("User")
    device = relationship("MobileDevice")
