import uuid
from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ClassSessionStatus(str, Enum):
    SCHEDULED = "SCHEDULED"
    CANCELLED = "CANCELLED"
    COMPLETED = "COMPLETED"


class ClassReservationStatus(str, Enum):
    PENDING = "PENDING"       # awaiting staff approval
    RESERVED = "RESERVED"     # approved / confirmed
    WAITLISTED = "WAITLISTED" # approved but session full — in queue
    CANCELLED = "CANCELLED"
    REJECTED = "REJECTED"     # staff rejected the request
    NO_SHOW = "NO_SHOW"


class ClassTemplate(Base):
    """Reusable class definition (e.g. 'Yoga Basics', 'HIIT Power')."""

    __tablename__ = "class_templates"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str | None] = mapped_column(String, nullable=True)  # e.g. Yoga, HIIT, Pilates
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=60)
    capacity: Mapped[int] = mapped_column(Integer, nullable=False, default=20)
    color: Mapped[str | None] = mapped_column(String(20), nullable=True)  # hex color for calendar display
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    created_by = relationship("User", foreign_keys=[created_by_id])
    sessions = relationship("ClassSession", back_populates="template", cascade="all, delete-orphan")


class ClassSession(Base):
    """A specific scheduled occurrence of a class template."""

    __tablename__ = "class_sessions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    template_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("class_templates.id"), nullable=False, index=True)
    coach_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)

    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # Optional override of template capacity for this specific session
    capacity_override: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[ClassSessionStatus] = mapped_column(
        SAEnum(ClassSessionStatus, native_enum=False),
        nullable=False,
        default=ClassSessionStatus.SCHEDULED,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    template = relationship("ClassTemplate", back_populates="sessions")
    coach = relationship("User", foreign_keys=[coach_id])
    reservations = relationship("ClassReservation", back_populates="session", cascade="all, delete-orphan")

    @property
    def effective_capacity(self) -> int:
        return self.capacity_override if self.capacity_override is not None else self.template.capacity


class ClassReservation(Base):
    """A member's reservation (or waitlist entry) for a class session."""

    __tablename__ = "class_reservations"
    __table_args__ = (
        UniqueConstraint("session_id", "member_id", name="uq_class_reservation_session_member"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("class_sessions.id"), nullable=False, index=True)
    member_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)

    status: Mapped[ClassReservationStatus] = mapped_column(
        SAEnum(ClassReservationStatus, native_enum=False),
        nullable=False,
        default=ClassReservationStatus.RESERVED,
    )
    attended: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    reserved_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    session = relationship("ClassSession", back_populates="reservations")
    member = relationship("User", foreign_keys=[member_id])
