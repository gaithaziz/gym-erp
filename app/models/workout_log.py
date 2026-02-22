import uuid
from datetime import datetime, timezone
from sqlalchemy import Integer, ForeignKey, Text, DateTime, Float, String
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


class WorkoutSession(Base):
    __tablename__ = "workout_sessions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    member_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    plan_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workout_plans.id"), nullable=False)
    performed_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    member = relationship("User")
    plan = relationship("WorkoutPlan")
    entries = relationship("WorkoutSessionEntry", back_populates="session", cascade="all, delete-orphan")


class WorkoutSessionEntry(Base):
    __tablename__ = "workout_session_entries"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workout_sessions.id"), nullable=False)
    exercise_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("exercises.id"), nullable=True)
    exercise_name: Mapped[str | None] = mapped_column(String, nullable=True)
    target_sets: Mapped[int | None] = mapped_column(Integer, nullable=True)
    target_reps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sets_completed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    reps_completed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    session = relationship("WorkoutSession", back_populates="entries")
    exercise = relationship("Exercise")


class DietFeedback(Base):
    __tablename__ = "diet_feedback"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    member_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    diet_plan_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("diet_plans.id"), nullable=False, index=True)
    coach_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False, index=True)

    member = relationship("User", foreign_keys=[member_id])
    coach = relationship("User", foreign_keys=[coach_id])
    diet_plan = relationship("DietPlan")


class GymFeedback(Base):
    __tablename__ = "gym_feedback"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    member_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String, nullable=False, default="GENERAL")
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False, index=True)

    member = relationship("User", foreign_keys=[member_id])
