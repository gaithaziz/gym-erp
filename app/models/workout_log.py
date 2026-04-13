import uuid
from datetime import date, datetime
from sqlalchemy import Boolean, Date, Integer, ForeignKey, Text, DateTime, Float, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

__all__ = [
    "WorkoutLog",
    "WorkoutSession",
    "WorkoutSessionEntry",
    "WorkoutSessionDraft",
    "WorkoutSessionDraftEntry",
    "MemberDietTrackingDay",
    "MemberDietTrackingMeal",
    "DietFeedback",
    "GymFeedback",
]


class WorkoutLog(Base):
    __tablename__ = "workout_logs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    member_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    plan_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workout_plans.id"), nullable=False)
    date: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
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
    performed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
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
    is_pr: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    pr_type: Mapped[str | None] = mapped_column(String, nullable=True)
    pr_value: Mapped[str | None] = mapped_column(String, nullable=True)
    pr_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    session = relationship("WorkoutSession", back_populates="entries")
    exercise = relationship("Exercise")


class WorkoutSessionDraft(Base):
    __tablename__ = "workout_session_drafts"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    member_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    plan_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workout_plans.id"), nullable=False, index=True)
    section_name: Mapped[str | None] = mapped_column(String, nullable=True)
    current_exercise_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    member = relationship("User")
    plan = relationship("WorkoutPlan")
    entries = relationship("WorkoutSessionDraftEntry", back_populates="draft", cascade="all, delete-orphan")


class WorkoutSessionDraftEntry(Base):
    __tablename__ = "workout_session_draft_entries"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    draft_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workout_session_drafts.id"), nullable=False, index=True)
    workout_exercise_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("workout_exercises.id"), nullable=True)
    exercise_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("exercises.id"), nullable=True)
    exercise_name: Mapped[str | None] = mapped_column(String, nullable=True)
    section_name: Mapped[str | None] = mapped_column(String, nullable=True)
    target_sets: Mapped[int | None] = mapped_column(Integer, nullable=True)
    target_reps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    target_duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    video_type: Mapped[str | None] = mapped_column(String, nullable=True)
    video_url: Mapped[str | None] = mapped_column(String, nullable=True)
    uploaded_video_url: Mapped[str | None] = mapped_column(String, nullable=True)
    video_provider: Mapped[str | None] = mapped_column(String, nullable=True)
    video_id: Mapped[str | None] = mapped_column(String, nullable=True)
    embed_url: Mapped[str | None] = mapped_column(String, nullable=True)
    playback_type: Mapped[str | None] = mapped_column(String, nullable=True)
    sets_completed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    reps_completed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_pr: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    pr_type: Mapped[str | None] = mapped_column(String, nullable=True)
    pr_value: Mapped[str | None] = mapped_column(String, nullable=True)
    pr_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    skipped: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    draft = relationship("WorkoutSessionDraft", back_populates="entries")
    exercise = relationship("Exercise")
    workout_exercise = relationship("WorkoutExercise")


class MemberDietTrackingDay(Base):
    __tablename__ = "member_diet_tracking_days"
    __table_args__ = (
        UniqueConstraint("member_id", "diet_plan_id", "tracked_for", name="uq_member_diet_tracking_day"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    member_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    diet_plan_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("diet_plans.id"), nullable=False, index=True)
    tracked_for: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    adherence_rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    member = relationship("User")
    diet_plan = relationship("DietPlan")
    meals = relationship("MemberDietTrackingMeal", back_populates="tracking_day", cascade="all, delete-orphan")


class MemberDietTrackingMeal(Base):
    __tablename__ = "member_diet_tracking_meals"
    __table_args__ = (
        UniqueConstraint("tracking_day_id", "meal_key", name="uq_member_diet_tracking_meal"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tracking_day_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("member_diet_tracking_days.id"), nullable=False, index=True)
    meal_key: Mapped[str] = mapped_column(String, nullable=False)
    meal_name: Mapped[str] = mapped_column(String, nullable=False)
    completed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    tracking_day = relationship("MemberDietTrackingDay", back_populates="meals")


class DietFeedback(Base):
    __tablename__ = "diet_feedback"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    member_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    diet_plan_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("diet_plans.id"), nullable=False, index=True)
    coach_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False, index=True)

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
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    member = relationship("User", foreign_keys=[member_id])
