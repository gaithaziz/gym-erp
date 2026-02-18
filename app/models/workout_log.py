import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Integer, Float, ForeignKey, Text, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class WorkoutLog(Base):
    __tablename__ = "workout_logs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    member_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    plan_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workout_plans.id"), nullable=False)
    date: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    completed: Mapped[bool] = mapped_column(default=False)
    difficulty_rating: Mapped[int] = mapped_column(Integer, nullable=True)  # 1-5
    comment: Mapped[str] = mapped_column(Text, nullable=True)

    member = relationship("User")
    plan = relationship("WorkoutPlan")
