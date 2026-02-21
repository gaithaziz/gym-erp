from typing import Annotated, List
from datetime import datetime
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import AnyHttpUrl, BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import dependencies
from app.core.responses import StandardResponse
from app.database import get_db
from app.models.enums import Role
from app.models.fitness import BiometricLog, DietPlan, Exercise, WorkoutExercise, WorkoutPlan
from app.models.user import User
from app.models.workout_log import WorkoutLog

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


def _ensure_plan_owned_by_requester_or_admin(plan: WorkoutPlan, current_user: User, *, action: str) -> None:
    if current_user.role != Role.ADMIN and plan.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail=f"Cannot {action} plan created by another user")


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
    exercise_id: uuid.UUID
    sets: int = 3
    reps: int = 10
    duration_minutes: int | None = None
    order: int = 0

class WorkoutExerciseResponse(BaseModel):
    id: uuid.UUID
    sets: int
    reps: int
    duration_minutes: int | None
    order: int
    exercise: ExerciseResponse # Nested
    
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
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """List all available exercises."""
    stmt = select(Exercise).order_by(Exercise.category, Exercise.name)
    result = await db.execute(stmt)
    exercises = result.scalars().all()
    # Pydantic v2 adapter or manual validation
    return StandardResponse(data=[ExerciseResponse.model_validate(e) for e in exercises])

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
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
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
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
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
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
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


@router.post("/log", response_model=StandardResponse)
async def log_workout(
    data: WorkoutLogCreate,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.CUSTOMER]))],
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

@router.get("/stats", response_model=StandardResponse)
async def get_workout_stats(
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Get aggregated workout stats for the current user (e.g., workouts per day over last 30 days)."""
    from datetime import timedelta
    
    thirty_days_ago = datetime.now() - timedelta(days=30)
    
    # We want to group by date (ignoring time) and count completed workouts
    # Use func.date for SQLite/Postgres compatibility, but here we just cast or extract
    # For a general approach, it's easiest to process in memory if the dataset is small,
    # or use database specific date truncation. AsyncPG handles func.date().
    
    stmt = (
        select(func.date(WorkoutLog.date).label('day'), func.count(WorkoutLog.id).label('count'))
        .where(WorkoutLog.member_id == current_user.id)
        .where(WorkoutLog.completed.is_(True))
        .where(WorkoutLog.date >= thirty_days_ago)
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
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
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
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
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

