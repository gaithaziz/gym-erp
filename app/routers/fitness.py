from typing import Annotated, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
import uuid

from app.database import get_db
from app.auth import dependencies
from app.models.user import User
from app.models.enums import Role
from app.models.fitness import Exercise, WorkoutPlan, WorkoutExercise, DietPlan
from app.models.workout_log import WorkoutLog
from app.core.responses import StandardResponse
from pydantic import Field
from datetime import datetime

router = APIRouter()

# --- Pydantic Models ---
# --- Pydantic Models ---
class ExerciseCreate(BaseModel):
    name: str
    category: str
    description: str | None = None
    video_url: str | None = None

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
    exercises: List[WorkoutExerciseData] = []

class WorkoutPlanResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None = None
    creator_id: uuid.UUID
    member_id: uuid.UUID | None
    exercises: List[WorkoutExerciseResponse] = []
    
    class Config:
        from_attributes = True

# --- Endpoints ---

@router.post("/exercises", response_model=StandardResponse)
async def create_exercise(
    data: ExerciseCreate,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.COACH]))],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Create a new exercise in the library."""
    exercise = Exercise(**data.model_dump())
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
    # 1. Create Plan
    plan = WorkoutPlan(
        name=data.name,
        description=data.description,
        creator_id=current_user.id,
        member_id=data.member_id
    )
    db.add(plan)
    await db.flush() # Get ID
    
    # 2. Add Exercises
    for ex_data in data.exercises:
        w_ex = WorkoutExercise(
            plan_id=plan.id,
            exercise_id=ex_data.exercise_id,
            sets=ex_data.sets,
            reps=ex_data.reps,
            duration_minutes=ex_data.duration_minutes,
            order=ex_data.order
        )
        db.add(w_ex)
        
    await db.commit()
    return StandardResponse(message="Workout Plan Created", data={"id": str(plan.id)})

@router.get("/plans", response_model=StandardResponse[List[WorkoutPlanResponse]])
async def list_plans(
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """List plans visible to the user (Created by them OR Assigned to them)."""
    if current_user.role in [Role.ADMIN, Role.COACH]:
        # Coaches see plans they created
        stmt = select(WorkoutPlan).where(WorkoutPlan.creator_id == current_user.id).options(selectinload(WorkoutPlan.exercises).selectinload(WorkoutExercise.exercise))
    else:
        # Members see plans assigned to them
        stmt = select(WorkoutPlan).where(WorkoutPlan.member_id == current_user.id).options(selectinload(WorkoutPlan.exercises).selectinload(WorkoutExercise.exercise))
        
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
    stmt = select(WorkoutPlan).where(WorkoutPlan.id == plan_id).options(selectinload(WorkoutPlan.exercises))
    result = await db.execute(stmt)
    plan = result.scalar_one_or_none()
    
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
        
    if current_user.role != Role.ADMIN and plan.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Cannot edit plan created by another user")

    # Update basic fields
    plan.name = data.name
    plan.description = data.description  # type: ignore
    plan.member_id = data.member_id  # type: ignore
    
    # Clear existing exercises
    for ex in plan.exercises:
        await db.delete(ex)
    
    # Add new exercises
    for ex_data in data.exercises:
        w_ex = WorkoutExercise(
            plan_id=plan.id,
            exercise_id=ex_data.exercise_id,
            sets=ex_data.sets,
            reps=ex_data.reps,
            duration_minutes=ex_data.duration_minutes,
            order=ex_data.order
        )
        db.add(w_ex)
        
    await db.commit()
    return StandardResponse(message="Plan updated successfully")


@router.delete("/plans/{plan_id}", response_model=StandardResponse)
async def delete_workout_plan(
    plan_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.COACH]))],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Delete a workout plan."""
    stmt = select(WorkoutPlan).where(WorkoutPlan.id == plan_id)
    result = await db.execute(stmt)
    plan = result.scalar_one_or_none()
    
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
        
    if current_user.role != Role.ADMIN and plan.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Cannot delete plan created by another user")
        
    await db.delete(plan)
    await db.commit()
    return StandardResponse(message="Plan deleted")



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
    if current_user.role in [Role.ADMIN, Role.COACH]:
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
    if current_user.role not in [Role.ADMIN, Role.COACH] and plan.member_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    return StandardResponse(data=DietPlanResponse.model_validate(plan))


# ===== WORKOUT FEEDBACK SCHEMAS =====

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
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Customer logs workout feedback (difficulty, comment)."""
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
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Coach views trainee feedback for a specific plan."""
    stmt = select(WorkoutLog).where(WorkoutLog.plan_id == plan_id).order_by(WorkoutLog.date.desc())
    result = await db.execute(stmt)
    logs = result.scalars().all()
    return StandardResponse(data=[WorkoutLogResponse.model_validate(log) for log in logs])

