import uuid
from datetime import datetime, timezone
from sqlalchemy import String, ForeignKey, DateTime, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Badge(Base):
    """Represents an achievement badge earned by a user."""
    __tablename__ = "badges"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    badge_type: Mapped[str] = mapped_column(String, nullable=False)  # e.g. STREAK_3, STREAK_7, VISITS_50, EARLY_BIRD
    badge_name: Mapped[str] = mapped_column(String, nullable=False)
    badge_description: Mapped[str] = mapped_column(String, nullable=True)
    earned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    user = relationship("User")


class AttendanceStreak(Base):
    """Tracks the current and best attendance streak for a user."""
    __tablename__ = "attendance_streaks"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, unique=True)
    current_streak: Mapped[int] = mapped_column(Integer, default=0)
    best_streak: Mapped[int] = mapped_column(Integer, default=0)
    last_visit_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    user = relationship("User")
