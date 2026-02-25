import uuid
from sqlalchemy import String, Integer, ForeignKey, Text, Float, DateTime, Boolean, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime, timezone
from app.database import Base

class Exercise(Base):
    __tablename__ = "exercises"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    category: Mapped[str] = mapped_column(String, nullable=False) # e.g. Chest, Legs, Cardio
    video_url: Mapped[str] = mapped_column(String, nullable=True)

class WorkoutPlan(Base):
    __tablename__ = "workout_plans"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    is_template: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="DRAFT")
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    parent_plan_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("workout_plans.id"), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expected_sessions_per_30d: Mapped[int] = mapped_column(Integer, nullable=False, default=12)
    
    creator_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    member_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=True) # Optional assignment

    creator = relationship("User", foreign_keys=[creator_id])
    member = relationship("User", foreign_keys=[member_id])
    exercises = relationship("WorkoutExercise", back_populates="plan", cascade="all, delete-orphan")
    parent_plan = relationship("WorkoutPlan", remote_side=[id], backref="versions")

class WorkoutExercise(Base):
    __tablename__ = "workout_exercises"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    plan_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workout_plans.id"), nullable=False)
    exercise_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("exercises.id"), nullable=True)
    exercise_name: Mapped[str | None] = mapped_column(String, nullable=True)
    section_name: Mapped[str | None] = mapped_column(String, nullable=True)
    video_type: Mapped[str | None] = mapped_column(String, nullable=True)  # EMBED | UPLOAD
    video_url: Mapped[str | None] = mapped_column(String, nullable=True)
    uploaded_video_url: Mapped[str | None] = mapped_column(String, nullable=True)
    video_provider: Mapped[str | None] = mapped_column(String, nullable=True)  # youtube | upload
    video_id: Mapped[str | None] = mapped_column(String, nullable=True)
    embed_url: Mapped[str | None] = mapped_column(String, nullable=True)
    playback_type: Mapped[str | None] = mapped_column(String, nullable=True)  # EMBED | DIRECT
    
    sets: Mapped[int] = mapped_column(Integer, default=3)
    reps: Mapped[int] = mapped_column(Integer, default=10)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=True) # For cardio
    order: Mapped[int] = mapped_column(Integer, default=0)

    plan = relationship("WorkoutPlan", back_populates="exercises")
    exercise = relationship("Exercise")

class DietPlan(Base):
    __tablename__ = "diet_plans"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False) # JSON or markdown content
    is_template: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="DRAFT")
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    parent_plan_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("diet_plans.id"), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    content_structured: Mapped[dict | list | None] = mapped_column(JSON, nullable=True)
    
    creator_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    member_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=True)

    creator = relationship("User", foreign_keys=[creator_id])
    member = relationship("User", foreign_keys=[member_id])
    parent_plan = relationship("DietPlan", remote_side=[id], backref="versions")


class DietLibraryItem(Base):
    __tablename__ = "diet_library_items"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_global: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    owner_coach_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    owner_coach = relationship("User", foreign_keys=[owner_coach_id])

class BiometricLog(Base):
    __tablename__ = "biometric_logs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    member_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    weight_kg: Mapped[float] = mapped_column(Float, nullable=True)
    height_cm: Mapped[float] = mapped_column(Float, nullable=True)
    body_fat_pct: Mapped[float] = mapped_column(Float, nullable=True)
    muscle_mass_kg: Mapped[float] = mapped_column(Float, nullable=True)
    
    member = relationship("User", foreign_keys=[member_id])


class ExerciseLibraryItem(Base):
    __tablename__ = "exercise_library_items"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String, nullable=False)
    category: Mapped[str | None] = mapped_column(String, nullable=True)
    muscle_group: Mapped[str | None] = mapped_column(String, nullable=True)
    equipment: Mapped[str | None] = mapped_column(String, nullable=True)
    tags: Mapped[str | None] = mapped_column(Text, nullable=True)  # comma-separated list
    default_video_url: Mapped[str | None] = mapped_column(String, nullable=True)
    is_global: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    owner_coach_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    owner_coach = relationship("User", foreign_keys=[owner_coach_id])


class CoachExerciseTemplate(Base):
    __tablename__ = "coach_exercise_templates"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    coach_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    section_name: Mapped[str | None] = mapped_column(String, nullable=True)
    exercise_library_item_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("exercise_library_items.id"), nullable=True)
    sets: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    reps: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    coach = relationship("User", foreign_keys=[coach_id])
    exercise_library_item = relationship("ExerciseLibraryItem")


class ExerciseLibraryRecent(Base):
    __tablename__ = "exercise_library_recent"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    coach_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    exercise_library_item_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("exercise_library_items.id"), nullable=False)
    last_used_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    coach = relationship("User", foreign_keys=[coach_id])
    exercise_library_item = relationship("ExerciseLibraryItem")
