import uuid
from sqlalchemy import String, Integer, ForeignKey, Text, Float, DateTime, Boolean
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
    
    creator_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    member_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=True) # Optional assignment

    creator = relationship("User", foreign_keys=[creator_id])
    member = relationship("User", foreign_keys=[member_id])
    exercises = relationship("WorkoutExercise", back_populates="plan", cascade="all, delete-orphan")

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
    
    creator_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    member_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=True)

    creator = relationship("User", foreign_keys=[creator_id])
    creator = relationship("User", foreign_keys=[creator_id])
    member = relationship("User", foreign_keys=[member_id])

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
