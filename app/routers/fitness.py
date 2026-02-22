import os
from typing import Annotated, List, Literal
from datetime import datetime, timedelta
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import AnyHttpUrl, BaseModel, Field, field_validator
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import dependencies
from app.core.responses import StandardResponse
from app.database import get_db
from app.models.enums import Role
from app.models.fitness import BiometricLog, DietPlan, Exercise, WorkoutExercise, WorkoutPlan
from app.models.user import User
from app.models import workout_log as workout_log_models

DietFeedback = workout_log_models.DietFeedback
GymFeedback = workout_log_models.GymFeedback
WorkoutLog = workout_log_models.WorkoutLog
WorkoutSession = workout_log_models.WorkoutSession
WorkoutSessionEntry = workout_log_models.WorkoutSessionEntry

router = APIRouter()


def _is_admin_or_coach(user: User) -> bool:
    return user.role in [Role.ADMIN, Role.COACH]


async def _get_workout_plan_or_404(
    db: AsyncSession,
    plan_id: uuid.UUID,
    *,
    with_exercises: bool = False,
) -> WorkoutPlan:
    stmt = select(WorkoutPlan).where(WorkoutPlan.id == plan_id)
    if with_exercises:
        stmt = stmt.options(selectinload(WorkoutPlan.exercises))

    result = await db.execute(stmt)
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    return plan


async def _get_diet_plan_or_404(
    db: AsyncSession,
    diet_id: uuid.UUID,
) -> DietPlan:
    stmt = select(DietPlan).where(DietPlan.id == diet_id)
    result = await db.execute(stmt)
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Diet plan not found")
    return plan


def _ensure_plan_owned_by_requester_or_admin(plan: WorkoutPlan, current_user: User, *, action: str) -> None:
    if current_user.role != Role.ADMIN and plan.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail=f"Cannot {action} plan created by another user")


def _ensure_diet_owned_by_requester_or_admin(plan: DietPlan, current_user: User, *, action: str) -> None:
    if current_user.role != Role.ADMIN and plan.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail=f"Cannot {action} diet plan created by another user")


def _apply_date_filters(stmt, model_date_field, from_date: datetime | None, to_date: datetime | None):
    if from_date:
        stmt = stmt.where(model_date_field >= from_date)
    if to_date:
        stmt = stmt.where(model_date_field <= to_date)
    return stmt


def _add_workout_exercises(db: AsyncSession, plan_id: uuid.UUID, exercises: List["WorkoutExerciseData"]) -> None:
    for exercise_data in exercises:
        db.add(
            WorkoutExercise(
                plan_id=plan_id,
                exercise_id=exercise_data.exercise_id,
                exercise_name=exercise_data.exercise_name,
                section_name=exercise_data.section_name,
                video_type=exercise_data.video_type,
                video_url=str(exercise_data.video_url) if exercise_data.video_url else None,
                uploaded_video_url=exercise_data.uploaded_video_url,
                sets=exercise_data.sets,
                reps=exercise_data.reps,
                duration_minutes=exercise_data.duration_minutes,
                order=exercise_data.order,
            )
        )


# --- Pydantic Models ---
class ExerciseCreate(BaseModel):
    name: str
    category: str
    description: str | None = None
    video_url: AnyHttpUrl | None = None

    @field_validator("video_url")
    @classmethod
    def validate_video_provider(cls, value: AnyHttpUrl | None) -> AnyHttpUrl | None:
        if value is None:
            return value

        allowed_hosts = {"youtube.com", "www.youtube.com", "youtu.be", "vimeo.com", "www.vimeo.com"}
        if value.host not in allowed_hosts:
            raise ValueError("video_url must be a YouTube or Vimeo link")
        return value

class ExerciseResponse(ExerciseCreate):
    id: uuid.UUID
    
    class Config:
        from_attributes = True

class WorkoutExerciseData(BaseModel):
    exercise_id: uuid.UUID | None = None
    exercise_name: str | None = None
    section_name: str | None = None
    video_type: Literal["EMBED", "UPLOAD"] | None = None
    video_url: AnyHttpUrl | None = None
    uploaded_video_url: str | None = None
    sets: int = 3
    reps: int = 10
    duration_minutes: int | None = None
    order: int = 0

    @field_validator("exercise_name")
    @classmethod
    def normalize_exercise_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @field_validator("section_name")
    @classmethod
    def normalize_section_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @field_validator("uploaded_video_url")
    @classmethod
    def normalize_uploaded_video_url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @field_validator("video_type")
    @classmethod
    def normalize_video_type(cls, value: Literal["EMBED", "UPLOAD"] | None) -> Literal["EMBED", "UPLOAD"] | None:
        return value

    def model_post_init(self, __context) -> None:  # type: ignore[override]
        if not self.exercise_id and not self.exercise_name:
            raise ValueError("Each workout exercise requires either exercise_id or exercise_name")
        if self.video_type == "EMBED" and not self.video_url:
            raise ValueError("video_url is required when video_type is EMBED")
        if self.video_type == "UPLOAD" and not self.uploaded_video_url:
            raise ValueError("uploaded_video_url is required when video_type is UPLOAD")

class WorkoutExerciseResponse(BaseModel):
    id: uuid.UUID
    sets: int
    reps: int
    duration_minutes: int | None
    order: int
    exercise_name: str | None = None
    section_name: str | None = None
    video_type: str | None = None
    video_url: str | None = None
    uploaded_video_url: str | None = None
    exercise: ExerciseResponse | None = None  # Nested optional
    
    class Config:
        from_attributes = True

class WorkoutPlanCreate(BaseModel):
    name: str
    description: str | None = None
    member_id: uuid.UUID | None = None # Optional assignment
    is_template: bool = False
    exercises: List[WorkoutExerciseData] = Field(default_factory=list)

class WorkoutPlanResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None = None
    creator_id: uuid.UUID
    member_id: uuid.UUID | None
    is_template: bool
    exercises: List[WorkoutExerciseResponse] = Field(default_factory=list)
    
    class Config:
        from_attributes = True


class WorkoutPlanCloneRequest(BaseModel):
    name: str | None = None
    member_id: uuid.UUID | None = None


class DietPlanCloneRequest(BaseModel):
    name: str | None = None
    member_id: uuid.UUID | None = None

# --- Endpoints ---

@router.post("/exercises", response_model=StandardResponse)
async def create_exercise(
    data: ExerciseCreate,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.COACH]))],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Create a new exercise in the library."""
    exercise = Exercise(**data.model_dump(mode="json"))
    db.add(exercise)
    await db.commit()
    return StandardResponse(message="Exercise created", data={"id": str(exercise.id)})

@router.get("/exercises", response_model=StandardResponse[List[ExerciseResponse]])
async def list_exercises(
    current_user: Annotated[User, Depends(dependencies.require_active_customer_subscription)],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """List all available exercises."""
    stmt = select(Exercise).order_by(Exercise.category, Exercise.name)
    result = await db.execute(stmt)
    exercises = result.scalars().all()
    # Pydantic v2 adapter or manual validation
    return StandardResponse(data=[ExerciseResponse.model_validate(e) for e in exercises])


@router.post("/exercise-videos/upload", response_model=StandardResponse)
async def upload_exercise_video(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.COACH]))],
    file: UploadFile = File(...),
):
    """Upload an exercise demo video and return a static URL."""
    allowed_types = {"video/mp4", "video/webm", "video/quicktime", "video/x-msvideo"}
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Unsupported video type")

    ext = os.path.splitext(file.filename or "")[1].lower() or ".mp4"
    if ext not in {".mp4", ".webm", ".mov", ".avi"}:
        ext = ".mp4"

    upload_dir = os.path.join("static", "workout_videos")
    os.makedirs(upload_dir, exist_ok=True)

    file_name = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(upload_dir, file_name)

    with open(file_path, "wb") as out_file:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            out_file.write(chunk)

    return StandardResponse(data={"video_url": f"/static/workout_videos/{file_name}"}, message="Video uploaded")

@router.post("/plans", response_model=StandardResponse)
async def create_workout_plan(
    data: WorkoutPlanCreate,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.COACH]))],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Create a new workout plan."""
    plan = WorkoutPlan(
        name=data.name,
        description=data.description,
        creator_id=current_user.id,
        member_id=data.member_id,
        is_template=data.is_template,
    )
    db.add(plan)
    await db.flush()

    _add_workout_exercises(db, plan.id, data.exercises)
    await db.commit()
    return StandardResponse(message="Workout Plan Created", data={"id": str(plan.id)})

@router.get("/plans", response_model=StandardResponse[List[WorkoutPlanResponse]])
async def list_plans(
    current_user: Annotated[User, Depends(dependencies.require_active_customer_subscription)],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """List plans visible to the user (Created by them OR Assigned to them)."""
    plan_exercises = selectinload(WorkoutPlan.exercises).selectinload(WorkoutExercise.exercise)
    if _is_admin_or_coach(current_user):
        stmt = select(WorkoutPlan).where(WorkoutPlan.creator_id == current_user.id).options(plan_exercises)
    else:
        stmt = select(WorkoutPlan).where(WorkoutPlan.member_id == current_user.id).options(plan_exercises)
        
    result = await db.execute(stmt)
    plans = result.scalars().all()
    
    return StandardResponse(data=[WorkoutPlanResponse.model_validate(p) for p in plans])


@router.put("/plans/{plan_id}", response_model=StandardResponse)
async def update_workout_plan(
    plan_id: uuid.UUID,
    data: WorkoutPlanCreate,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.COACH]))],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Update an existing workout plan (overwrite exercises)."""
    plan = await _get_workout_plan_or_404(db, plan_id, with_exercises=True)
    _ensure_plan_owned_by_requester_or_admin(plan, current_user, action="edit")

    # Update basic fields
    plan.name = data.name
    plan.description = data.description  # type: ignore
    plan.member_id = data.member_id  # type: ignore
    plan.is_template = data.is_template
    
    for ex in plan.exercises:
        await db.delete(ex)

    _add_workout_exercises(db, plan.id, data.exercises)
    await db.commit()
    return StandardResponse(message="Plan updated successfully")


@router.delete("/plans/{plan_id}", response_model=StandardResponse)
async def delete_workout_plan(
    plan_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.COACH]))],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Delete a workout plan."""
    plan = await _get_workout_plan_or_404(db, plan_id)
    _ensure_plan_owned_by_requester_or_admin(plan, current_user, action="delete")

    # Remove dependent workout logs and session logs first to avoid FK violations.
    await db.execute(delete(WorkoutLog).where(WorkoutLog.plan_id == plan_id))
    session_ids_subquery = select(WorkoutSession.id).where(WorkoutSession.plan_id == plan_id)
    await db.execute(delete(WorkoutSessionEntry).where(WorkoutSessionEntry.session_id.in_(session_ids_subquery)))
    await db.execute(delete(WorkoutSession).where(WorkoutSession.plan_id == plan_id))
    await db.delete(plan)
    await db.commit()
    return StandardResponse(message="Plan deleted")


@router.post("/plans/{plan_id}/clone", response_model=StandardResponse)
async def clone_workout_plan(
    plan_id: uuid.UUID,
    clone_data: WorkoutPlanCloneRequest,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.COACH]))],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Clone a workout plan and optionally assign it to a member."""
    source_plan = await _get_workout_plan_or_404(db, plan_id, with_exercises=True)
    _ensure_plan_owned_by_requester_or_admin(source_plan, current_user, action="clone")

    cloned_plan = WorkoutPlan(
        name=clone_data.name or f"{source_plan.name} (Copy)",
        description=source_plan.description,
        creator_id=current_user.id,
        member_id=clone_data.member_id,
        is_template=False,
    )
    db.add(cloned_plan)
    await db.flush()

    _add_workout_exercises(
        db,
        cloned_plan.id,
        [
            WorkoutExerciseData(
                exercise_id=exercise.exercise_id,
                exercise_name=exercise.exercise_name,
                section_name=exercise.section_name,
                video_type=exercise.video_type,  # type: ignore[arg-type]
                video_url=exercise.video_url,
                uploaded_video_url=exercise.uploaded_video_url,
                sets=exercise.sets,
                reps=exercise.reps,
                duration_minutes=exercise.duration_minutes,
                order=exercise.order,
            )
            for exercise in source_plan.exercises
        ],
    )

    await db.commit()
    return StandardResponse(message="Plan cloned successfully", data={"id": str(cloned_plan.id)})



# ===== DIET PLAN SCHEMAS =====

class DietPlanCreate(BaseModel):
    name: str
    description: str | None = None
    content: str  # JSON or markdown
    member_id: uuid.UUID | None = None

class DietPlanResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None = None
    content: str
    creator_id: uuid.UUID
    member_id: uuid.UUID | None

    class Config:
        from_attributes = True


@router.post("/diets", response_model=StandardResponse)
async def create_diet_plan(
    data: DietPlanCreate,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.COACH]))],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Create a new diet plan."""
    plan = DietPlan(
        name=data.name,
        description=data.description,
        content=data.content,
        creator_id=current_user.id,
        member_id=data.member_id
    )
    db.add(plan)
    await db.commit()
    return StandardResponse(message="Diet Plan Created", data={"id": str(plan.id)})


@router.get("/diets", response_model=StandardResponse[List[DietPlanResponse]])
async def list_diet_plans(
    current_user: Annotated[User, Depends(dependencies.require_active_customer_subscription)],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """List diet plans visible to the user."""
    if _is_admin_or_coach(current_user):
        stmt = select(DietPlan).where(DietPlan.creator_id == current_user.id)
    else:
        stmt = select(DietPlan).where(DietPlan.member_id == current_user.id)
    result = await db.execute(stmt)
    plans = result.scalars().all()
    return StandardResponse(data=[DietPlanResponse.model_validate(p) for p in plans])


@router.get("/diets/{diet_id}", response_model=StandardResponse[DietPlanResponse])
async def get_diet_plan(
    diet_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.require_active_customer_subscription)],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Get a specific diet plan."""
    stmt = select(DietPlan).where(DietPlan.id == diet_id)
    result = await db.execute(stmt)
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Diet plan not found")
    # Data isolation: member can only see their own plan
    if not _is_admin_or_coach(current_user) and plan.member_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    return StandardResponse(data=DietPlanResponse.model_validate(plan))


@router.post("/diets/{diet_id}/clone", response_model=StandardResponse)
async def clone_diet_plan(
    diet_id: uuid.UUID,
    clone_data: DietPlanCloneRequest,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.COACH]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Clone a diet plan and optionally assign it to a member."""
    source_plan = await _get_diet_plan_or_404(db, diet_id)
    _ensure_diet_owned_by_requester_or_admin(source_plan, current_user, action="clone")

    cloned_plan = DietPlan(
        name=clone_data.name or f"{source_plan.name} (Copy)",
        description=source_plan.description,
        content=source_plan.content,
        creator_id=current_user.id,
        member_id=clone_data.member_id,
    )
    db.add(cloned_plan)
    await db.commit()
    return StandardResponse(message="Diet plan cloned successfully", data={"id": str(cloned_plan.id)})


@router.delete("/diets/{diet_id}", response_model=StandardResponse)
async def delete_diet_plan(
    diet_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.COACH]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Delete a diet plan."""
    plan = await _get_diet_plan_or_404(db, diet_id)
    _ensure_diet_owned_by_requester_or_admin(plan, current_user, action="delete")

    await db.delete(plan)
    await db.commit()
    return StandardResponse(message="Diet plan deleted")


# ===== WORKOUT FEEDBACK SCHEMAS =====

class BiometricLogCreate(BaseModel):
    weight_kg: float | None = None
    height_cm: float | None = None
    body_fat_pct: float | None = None
    muscle_mass_kg: float | None = None

class BiometricLogResponse(BiometricLogCreate):
    id: uuid.UUID
    member_id: uuid.UUID
    date: datetime

    class Config:
        from_attributes = True

class WorkoutLogCreate(BaseModel):
    plan_id: uuid.UUID
    completed: bool = False
    difficulty_rating: int | None = Field(None, ge=1, le=5)
    comment: str | None = None

class WorkoutLogResponse(BaseModel):
    id: uuid.UUID
    member_id: uuid.UUID
    plan_id: uuid.UUID
    date: datetime
    completed: bool
    difficulty_rating: int | None
    comment: str | None

    class Config:
        from_attributes = True


class DietFeedbackCreate(BaseModel):
    diet_plan_id: uuid.UUID
    rating: int = Field(..., ge=1, le=5)
    comment: str | None = None


class DietFeedbackResponse(BaseModel):
    id: uuid.UUID
    member_id: uuid.UUID
    diet_plan_id: uuid.UUID
    coach_id: uuid.UUID | None
    rating: int
    comment: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class GymFeedbackCreate(BaseModel):
    category: Literal["EQUIPMENT", "CLEANLINESS", "STAFF", "CLASSES", "GENERAL"] = "GENERAL"
    rating: int = Field(..., ge=1, le=5)
    comment: str | None = None


class GymFeedbackResponse(BaseModel):
    id: uuid.UUID
    member_id: uuid.UUID
    category: str
    rating: int
    comment: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class WorkoutSessionEntryCreate(BaseModel):
    exercise_id: uuid.UUID | None = None
    exercise_name: str | None = None
    target_sets: int | None = Field(None, ge=0)
    target_reps: int | None = Field(None, ge=0)
    sets_completed: int = Field(0, ge=0)
    reps_completed: int = Field(0, ge=0)
    weight_kg: float | None = Field(None, ge=0)
    notes: str | None = None
    order: int = 0

    @field_validator("exercise_name")
    @classmethod
    def normalize_entry_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    def model_post_init(self, __context) -> None:  # type: ignore[override]
        if not self.exercise_id and not self.exercise_name:
            raise ValueError("Each session entry requires exercise_id or exercise_name")


class WorkoutSessionCreate(BaseModel):
    plan_id: uuid.UUID
    performed_at: datetime | None = None
    duration_minutes: int | None = Field(None, ge=1)
    notes: str | None = None
    entries: List[WorkoutSessionEntryCreate] = Field(default_factory=list)

    def model_post_init(self, __context) -> None:  # type: ignore[override]
        if len(self.entries) == 0:
            raise ValueError("At least one session entry is required")


class WorkoutSessionEntryResponse(BaseModel):
    id: uuid.UUID
    exercise_id: uuid.UUID | None
    exercise_name: str | None
    target_sets: int | None
    target_reps: int | None
    sets_completed: int
    reps_completed: int
    weight_kg: float | None
    notes: str | None
    order: int

    class Config:
        from_attributes = True


class WorkoutSessionResponse(BaseModel):
    id: uuid.UUID
    member_id: uuid.UUID
    plan_id: uuid.UUID
    performed_at: datetime
    duration_minutes: int | None
    notes: str | None
    entries: List[WorkoutSessionEntryResponse] = Field(default_factory=list)

    class Config:
        from_attributes = True


@router.post("/log", response_model=StandardResponse)
async def log_workout(
    data: WorkoutLogCreate,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.CUSTOMER]))],
    _subscription_guard: Annotated[User, Depends(dependencies.require_active_customer_subscription)],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Customer logs workout feedback (difficulty, comment)."""
    plan = await _get_workout_plan_or_404(db, data.plan_id)

    if current_user.role == Role.CUSTOMER and plan.member_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only log workouts assigned to your account")

    log = WorkoutLog(
        member_id=current_user.id,
        plan_id=data.plan_id,
        completed=data.completed,
        difficulty_rating=data.difficulty_rating,
        comment=data.comment
    )
    db.add(log)
    await db.commit()
    return StandardResponse(message="Workout logged", data={"id": str(log.id)})


@router.get("/logs/{plan_id}", response_model=StandardResponse[List[WorkoutLogResponse]])
async def get_workout_logs(
    plan_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.COACH]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    from_date: datetime | None = Query(None),
    to_date: datetime | None = Query(None),
):
    """Coach views trainee feedback for a specific plan."""
    plan = await _get_workout_plan_or_404(db, plan_id)

    if current_user.role == Role.COACH and plan.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Cannot view logs for plans created by another coach")

    stmt = select(WorkoutLog).where(WorkoutLog.plan_id == plan_id)
    stmt = _apply_date_filters(stmt, WorkoutLog.date, from_date, to_date)
    stmt = stmt.order_by(WorkoutLog.date.desc()).offset(offset).limit(limit)
    result = await db.execute(stmt)
    logs = result.scalars().all()
    return StandardResponse(data=[WorkoutLogResponse.model_validate(log) for log in logs])


@router.post("/session-logs", response_model=StandardResponse)
async def create_workout_session_log(
    data: WorkoutSessionCreate,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.CUSTOMER]))],
    _subscription_guard: Annotated[User, Depends(dependencies.require_active_customer_subscription)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Customer logs per-exercise workout session details."""
    plan = await _get_workout_plan_or_404(db, data.plan_id, with_exercises=True)

    if current_user.role == Role.CUSTOMER and plan.member_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only log sessions for plans assigned to your account")

    exercise_name_by_id = {
        exercise.exercise_id: (exercise.exercise_name or (exercise.exercise.name if exercise.exercise else None))
        for exercise in plan.exercises
        if exercise.exercise_id
    }

    session = WorkoutSession(
        member_id=current_user.id,
        plan_id=plan.id,
        performed_at=data.performed_at or datetime.utcnow(),
        duration_minutes=data.duration_minutes,
        notes=data.notes,
    )
    db.add(session)
    await db.flush()

    for idx, entry in enumerate(data.entries):
        resolved_name = entry.exercise_name
        if not resolved_name and entry.exercise_id:
            resolved_name = exercise_name_by_id.get(entry.exercise_id)
        db.add(
            WorkoutSessionEntry(
                session_id=session.id,
                exercise_id=entry.exercise_id,
                exercise_name=resolved_name,
                target_sets=entry.target_sets,
                target_reps=entry.target_reps,
                sets_completed=entry.sets_completed,
                reps_completed=entry.reps_completed,
                weight_kg=entry.weight_kg,
                notes=entry.notes,
                order=entry.order if entry.order else idx,
            )
        )

    await db.commit()
    return StandardResponse(message="Workout session logged", data={"id": str(session.id)})


@router.post("/diet-feedback", response_model=StandardResponse)
async def create_diet_feedback(
    data: DietFeedbackCreate,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.CUSTOMER]))],
    _subscription_guard: Annotated[User, Depends(dependencies.require_active_customer_subscription)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    diet_plan = await _get_diet_plan_or_404(db, data.diet_plan_id)

    if current_user.role == Role.CUSTOMER and diet_plan.member_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only submit feedback for diets assigned to your account")

    feedback = DietFeedback(
        member_id=current_user.id,
        diet_plan_id=diet_plan.id,
        coach_id=diet_plan.creator_id,
        rating=data.rating,
        comment=data.comment,
    )
    db.add(feedback)
    await db.commit()
    return StandardResponse(message="Diet feedback submitted", data={"id": str(feedback.id)})


@router.get("/diet-feedback", response_model=StandardResponse[List[DietFeedbackResponse]])
async def list_diet_feedback(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.COACH]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    diet_plan_id: uuid.UUID | None = Query(None),
    member_id: uuid.UUID | None = Query(None),
    min_rating: int | None = Query(None, ge=1, le=5),
    from_date: datetime | None = Query(None),
    to_date: datetime | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    stmt = select(DietFeedback).join(DietPlan, DietFeedback.diet_plan_id == DietPlan.id)
    if current_user.role == Role.COACH:
        stmt = stmt.where(DietPlan.creator_id == current_user.id)
    if diet_plan_id:
        stmt = stmt.where(DietFeedback.diet_plan_id == diet_plan_id)
    if member_id:
        stmt = stmt.where(DietFeedback.member_id == member_id)
    if min_rating:
        stmt = stmt.where(DietFeedback.rating >= min_rating)
    stmt = _apply_date_filters(stmt, DietFeedback.created_at, from_date, to_date)
    stmt = stmt.order_by(DietFeedback.created_at.desc()).offset(offset).limit(limit)

    result = await db.execute(stmt)
    rows = result.scalars().all()
    return StandardResponse(data=[DietFeedbackResponse.model_validate(row) for row in rows])


@router.post("/gym-feedback", response_model=StandardResponse)
async def create_gym_feedback(
    data: GymFeedbackCreate,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.CUSTOMER]))],
    _subscription_guard: Annotated[User, Depends(dependencies.require_active_customer_subscription)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    feedback = GymFeedback(
        member_id=current_user.id,
        category=data.category,
        rating=data.rating,
        comment=data.comment,
    )
    db.add(feedback)
    await db.commit()
    return StandardResponse(message="Gym feedback submitted", data={"id": str(feedback.id)})


@router.get("/gym-feedback", response_model=StandardResponse[List[GymFeedbackResponse]])
async def list_gym_feedback(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.COACH]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    member_id: uuid.UUID | None = Query(None),
    category: str | None = Query(None),
    min_rating: int | None = Query(None, ge=1, le=5),
    from_date: datetime | None = Query(None),
    to_date: datetime | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    stmt = select(GymFeedback)
    if member_id:
        stmt = stmt.where(GymFeedback.member_id == member_id)
    if category:
        stmt = stmt.where(GymFeedback.category == category)
    if min_rating:
        stmt = stmt.where(GymFeedback.rating >= min_rating)
    stmt = _apply_date_filters(stmt, GymFeedback.created_at, from_date, to_date)
    stmt = stmt.order_by(GymFeedback.created_at.desc()).offset(offset).limit(limit)

    result = await db.execute(stmt)
    rows = result.scalars().all()
    return StandardResponse(data=[GymFeedbackResponse.model_validate(row) for row in rows])


@router.get("/session-logs/me", response_model=StandardResponse[List[WorkoutSessionResponse]])
async def get_my_workout_session_logs(
    current_user: Annotated[User, Depends(dependencies.require_active_customer_subscription)],
    db: Annotated[AsyncSession, Depends(get_db)],
    plan_id: uuid.UUID | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    from_date: datetime | None = Query(None),
    to_date: datetime | None = Query(None),
):
    """Get current user's per-session workout logs."""
    stmt = (
        select(WorkoutSession)
        .where(WorkoutSession.member_id == current_user.id)
        .options(selectinload(WorkoutSession.entries))
    )
    if plan_id:
        stmt = stmt.where(WorkoutSession.plan_id == plan_id)
    stmt = _apply_date_filters(stmt, WorkoutSession.performed_at, from_date, to_date)
    stmt = stmt.order_by(WorkoutSession.performed_at.desc()).offset(offset).limit(limit)
    result = await db.execute(stmt)
    sessions = result.scalars().all()
    return StandardResponse(data=[WorkoutSessionResponse.model_validate(session) for session in sessions])


@router.get("/session-logs/member/{member_id}", response_model=StandardResponse[List[WorkoutSessionResponse]])
async def get_member_workout_session_logs(
    member_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.COACH]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    plan_id: uuid.UUID | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    from_date: datetime | None = Query(None),
    to_date: datetime | None = Query(None),
):
    """Coach/Admin views member per-session workout logs."""
    stmt = (
        select(WorkoutSession)
        .join(WorkoutPlan, WorkoutSession.plan_id == WorkoutPlan.id)
        .where(WorkoutSession.member_id == member_id)
        .options(selectinload(WorkoutSession.entries))
    )
    if current_user.role == Role.COACH:
        stmt = stmt.where(WorkoutPlan.creator_id == current_user.id)
    if plan_id:
        stmt = stmt.where(WorkoutSession.plan_id == plan_id)
    stmt = _apply_date_filters(stmt, WorkoutSession.performed_at, from_date, to_date)
    stmt = stmt.order_by(WorkoutSession.performed_at.desc()).offset(offset).limit(limit)
    result = await db.execute(stmt)
    sessions = result.scalars().all()
    return StandardResponse(data=[WorkoutSessionResponse.model_validate(session) for session in sessions])

@router.get("/stats", response_model=StandardResponse)
async def get_workout_stats(
    current_user: Annotated[User, Depends(dependencies.require_active_customer_subscription)],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Get aggregated workout stats for the current user (e.g., workouts per day over last 30 days)."""
    thirty_days_ago = datetime.now() - timedelta(days=30)

    stmt = (
        select(func.date(WorkoutSession.performed_at).label('day'), func.count(WorkoutSession.id).label('count'))
        .where(WorkoutSession.member_id == current_user.id)
        .where(WorkoutSession.performed_at >= thirty_days_ago)
        .group_by('day')
        .order_by('day')
    )
    result = await db.execute(stmt)
    rows = result.all()
    
    data = [{"date": str(row.day), "workouts": row.count} for row in rows]
    return StandardResponse(data=data)

# ===== BIOMETRICS ENDPOINTS =====

@router.post("/biometrics", response_model=StandardResponse)
async def log_biometrics(
    data: BiometricLogCreate,
    current_user: Annotated[User, Depends(dependencies.require_active_customer_subscription)],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Log a new biometric entry for the current user."""
    log = BiometricLog(
        member_id=current_user.id,
        **data.model_dump(exclude_unset=True)
    )
    db.add(log)
    await db.commit()
    return StandardResponse(message="Biometrics logged", data={"id": str(log.id)})

@router.get("/biometrics", response_model=StandardResponse[List[BiometricLogResponse]])
async def get_biometrics(
    current_user: Annotated[User, Depends(dependencies.require_active_customer_subscription)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    from_date: datetime | None = Query(None),
    to_date: datetime | None = Query(None),
):
    """Get biometric history for the current user."""
    stmt = select(BiometricLog).where(BiometricLog.member_id == current_user.id)
    stmt = _apply_date_filters(stmt, BiometricLog.date, from_date, to_date)
    stmt = stmt.order_by(BiometricLog.date.asc()).offset(offset).limit(limit)
    result = await db.execute(stmt)
    logs = result.scalars().all()
    return StandardResponse(data=[BiometricLogResponse.model_validate(log) for log in logs])


@router.get("/biometrics/member/{member_id}", response_model=StandardResponse[List[BiometricLogResponse]])
async def get_member_biometrics(
    member_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.COACH]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    from_date: datetime | None = Query(None),
    to_date: datetime | None = Query(None),
):
    """Admin/coach views biometric history for a specific member."""
    stmt = select(BiometricLog).where(BiometricLog.member_id == member_id)
    stmt = _apply_date_filters(stmt, BiometricLog.date, from_date, to_date)
    stmt = stmt.order_by(BiometricLog.date.asc()).offset(offset).limit(limit)
    result = await db.execute(stmt)
    logs = result.scalars().all()
    return StandardResponse(data=[BiometricLogResponse.model_validate(log) for log in logs])

