import os
from typing import Annotated, List, Literal
from datetime import datetime, timedelta
import uuid
import re
from urllib.parse import parse_qs, urlparse

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import AnyHttpUrl, BaseModel, Field, field_validator
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import dependencies
from app.core.responses import StandardResponse
from app.database import get_db
from app.models.enums import Role
from app.models.fitness import (
    BiometricLog,
    DietLibraryItem,
    DietPlan,
    Exercise,
    ExerciseLibraryItem,
    ExerciseLibraryRecent,
    WorkoutExercise,
    WorkoutPlan,
)
from app.models.user import User
from app.models import workout_log as workout_log_models

DietFeedback = workout_log_models.DietFeedback
GymFeedback = workout_log_models.GymFeedback
WorkoutLog = workout_log_models.WorkoutLog
WorkoutSession = workout_log_models.WorkoutSession
WorkoutSessionEntry = workout_log_models.WorkoutSessionEntry

router = APIRouter()
ALLOWED_VIDEO_HOSTS = {
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "youtu.be",
    "youtube-nocookie.com",
    "www.youtube-nocookie.com",
}
ALLOWED_DIRECT_VIDEO_EXTENSIONS = (".mp4", ".webm", ".mov", ".avi", ".m4v", ".ogg")
PLAN_STATUSES = {"DRAFT", "PUBLISHED", "ARCHIVED"}


def _is_admin_or_coach(user: User) -> bool:
    return user.role in [Role.ADMIN, Role.COACH]


def _extract_youtube_video_id(url: str) -> str | None:
    try:
        parsed = urlparse(url)
        host = parsed.netloc.lower().replace("www.", "")
        if host in {"youtube.com", "m.youtube.com"}:
            qs = parse_qs(parsed.query or "")
            vid = (qs.get("v") or [None])[0]
            if vid and re.match(r"^[a-zA-Z0-9_-]{11}$", vid):
                return vid
            match = re.search(r"/(shorts|embed|live)/([a-zA-Z0-9_-]{11})", parsed.path or "")
            if match:
                return match.group(2)
        if host == "youtu.be":
            candidate = (parsed.path or "").strip("/").split("/")[0]
            if candidate and re.match(r"^[a-zA-Z0-9_-]{11}$", candidate):
                return candidate
        if host in {"youtube-nocookie.com", "www.youtube-nocookie.com"}:
            match = re.search(r"/embed/([a-zA-Z0-9_-]{11})", parsed.path or "")
            if match:
                return match.group(1)
    except Exception:
        return None
    return None


def _normalize_video_metadata(
    *,
    video_type: Literal["EMBED", "UPLOAD"] | None,
    video_url: str | None,
    uploaded_video_url: str | None,
) -> dict[str, str | None]:
    if video_type == "UPLOAD":
        if not uploaded_video_url:
            raise HTTPException(status_code=400, detail="uploaded_video_url is required when video_type is UPLOAD")
        return {
            "video_provider": "upload",
            "video_id": None,
            "embed_url": uploaded_video_url,
            "playback_type": "DIRECT",
        }

    if video_type == "EMBED":
        if not video_url:
            raise HTTPException(status_code=400, detail="video_url is required when video_type is EMBED")
        parsed = urlparse(video_url)
        host = parsed.netloc.lower()
        if host.startswith("www."):
            host = host[4:]
        if host not in ALLOWED_VIDEO_HOSTS:
            raise HTTPException(status_code=400, detail="Unsupported video host. Only YouTube links are allowed.")
        video_id = _extract_youtube_video_id(video_url)
        if not video_id:
            raise HTTPException(status_code=400, detail="Invalid YouTube URL. Could not resolve video id.")
        embed_url = f"https://www.youtube-nocookie.com/embed/{video_id}"
        return {
            "video_provider": "youtube",
            "video_id": video_id,
            "embed_url": embed_url,
            "playback_type": "EMBED",
        }

    if video_url:
        parsed = urlparse(video_url)
        host = parsed.netloc.lower().replace("www.", "")
        if host in ALLOWED_VIDEO_HOSTS:
            vid = _extract_youtube_video_id(video_url)
            if vid:
                return {
                    "video_provider": "youtube",
                    "video_id": vid,
                    "embed_url": f"https://www.youtube-nocookie.com/embed/{vid}",
                    "playback_type": "EMBED",
                }
        if video_url.lower().endswith(ALLOWED_DIRECT_VIDEO_EXTENSIONS):
            return {
                "video_provider": "direct",
                "video_id": None,
                "embed_url": video_url,
                "playback_type": "DIRECT",
            }

    return {
        "video_provider": None,
        "video_id": None,
        "embed_url": None,
        "playback_type": None,
    }


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


def _can_manage_shared_library_item(*, current_user: User, is_global: bool, owner_coach_id: uuid.UUID | None) -> bool:
    if current_user.role == Role.ADMIN:
        return is_global or owner_coach_id == current_user.id
    return (not is_global) and owner_coach_id == current_user.id


def _apply_date_filters(stmt, model_date_field, from_date: datetime | None, to_date: datetime | None):
    if from_date:
        stmt = stmt.where(model_date_field >= from_date)
    if to_date:
        stmt = stmt.where(model_date_field <= to_date)
    return stmt


def _add_workout_exercises(db: AsyncSession, plan_id: uuid.UUID, exercises: List["WorkoutExerciseData"]) -> None:
    for exercise_data in exercises:
        video_meta = _normalize_video_metadata(
            video_type=exercise_data.video_type,
            video_url=str(exercise_data.video_url) if exercise_data.video_url else None,
            uploaded_video_url=exercise_data.uploaded_video_url,
        )
        db.add(
            WorkoutExercise(
                plan_id=plan_id,
                exercise_id=exercise_data.exercise_id,
                exercise_name=exercise_data.exercise_name,
                section_name=exercise_data.section_name,
                video_type=exercise_data.video_type,
                video_url=str(exercise_data.video_url) if exercise_data.video_url else None,
                uploaded_video_url=exercise_data.uploaded_video_url,
                video_provider=video_meta["video_provider"],
                video_id=video_meta["video_id"],
                embed_url=video_meta["embed_url"],
                playback_type=video_meta["playback_type"],
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
    video_provider: str | None = None
    video_id: str | None = None
    embed_url: str | None = None
    playback_type: str | None = None
    exercise: ExerciseResponse | None = None  # Nested optional
    
    class Config:
        from_attributes = True

class WorkoutPlanCreate(BaseModel):
    name: str
    description: str | None = None
    member_id: uuid.UUID | None = None # Optional assignment
    is_template: bool = False
    status: Literal["DRAFT", "PUBLISHED", "ARCHIVED"] | None = None
    expected_sessions_per_30d: int | None = Field(default=None, ge=1, le=60)
    exercises: List[WorkoutExerciseData] = Field(default_factory=list)

class WorkoutPlanResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None = None
    creator_id: uuid.UUID
    member_id: uuid.UUID | None
    is_template: bool
    status: str
    version: int
    parent_plan_id: uuid.UUID | None = None
    published_at: datetime | None = None
    archived_at: datetime | None = None
    expected_sessions_per_30d: int
    exercises: List[WorkoutExerciseResponse] = Field(default_factory=list)
    
    class Config:
        from_attributes = True


class WorkoutPlanCloneRequest(BaseModel):
    name: str | None = None
    member_id: uuid.UUID | None = None


class BulkAssignRequest(BaseModel):
    member_ids: List[uuid.UUID] = Field(default_factory=list)
    replace_active: bool = True


class PlanPreviewSection(BaseModel):
    section_name: str
    exercise_names: List[str]


class WorkoutPlanSummaryResponse(BaseModel):
    id: uuid.UUID
    name: str
    status: str
    version: int
    member_id: uuid.UUID | None = None
    total_sections: int
    total_exercises: int
    total_videos: int
    preview_sections: List[PlanPreviewSection]


class ExerciseLibraryItemCreate(BaseModel):
    name: str
    category: str | None = None
    muscle_group: str | None = None
    equipment: str | None = None
    tags: List[str] = Field(default_factory=list)
    default_video_url: AnyHttpUrl | None = None
    is_global: bool = False


class ExerciseLibraryItemUpdate(BaseModel):
    name: str
    category: str | None = None
    muscle_group: str | None = None
    equipment: str | None = None
    tags: List[str] = Field(default_factory=list)
    default_video_url: AnyHttpUrl | None = None
    is_global: bool = False


class ExerciseLibraryItemResponse(BaseModel):
    id: uuid.UUID
    name: str
    category: str | None = None
    muscle_group: str | None = None
    equipment: str | None = None
    tags: List[str] = Field(default_factory=list)
    default_video_url: str | None = None
    is_global: bool
    owner_coach_id: uuid.UUID | None = None

    class Config:
        from_attributes = True


class PlanAdherenceRow(BaseModel):
    plan_id: uuid.UUID
    plan_name: str
    assigned_members: int
    adherent_members: int
    adherence_percent: float


class DietPlanCloneRequest(BaseModel):
    name: str | None = None
    member_id: uuid.UUID | None = None


class DietLibraryItemCreate(BaseModel):
    name: str
    description: str | None = None
    content: str
    is_global: bool = False


class DietLibraryItemUpdate(BaseModel):
    name: str
    description: str | None = None
    content: str
    is_global: bool = False


class DietLibraryItemResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None = None
    content: str
    is_global: bool
    owner_coach_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime

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
    status = data.status or "DRAFT"
    if status not in PLAN_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid plan status")
    plan = WorkoutPlan(
        name=data.name,
        description=data.description,
        creator_id=current_user.id,
        member_id=data.member_id,
        is_template=data.is_template,
        status=status,
        version=1,
        expected_sessions_per_30d=data.expected_sessions_per_30d or 12,
        published_at=datetime.utcnow() if status == "PUBLISHED" else None,
        archived_at=datetime.utcnow() if status == "ARCHIVED" else None,
    )
    db.add(plan)
    await db.flush()

    _add_workout_exercises(db, plan.id, data.exercises)
    await db.commit()
    return StandardResponse(message="Workout Plan Created", data={"id": str(plan.id)})

@router.get("/plans", response_model=StandardResponse[List[WorkoutPlanResponse]])
async def list_plans(
    current_user: Annotated[User, Depends(dependencies.require_active_customer_subscription)],
    db: Annotated[AsyncSession, Depends(get_db)],
    include_archived: bool = Query(False),
):
    """List plans visible to the user (Created by them OR Assigned to them)."""
    plan_exercises = selectinload(WorkoutPlan.exercises).selectinload(WorkoutExercise.exercise)
    if _is_admin_or_coach(current_user):
        stmt = select(WorkoutPlan).where(WorkoutPlan.creator_id == current_user.id).options(plan_exercises)
    else:
        stmt = select(WorkoutPlan).where(WorkoutPlan.member_id == current_user.id).options(plan_exercises)
    if not include_archived:
        stmt = stmt.where(WorkoutPlan.status != "ARCHIVED")
        
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
    if plan.status == "PUBLISHED":
        raise HTTPException(status_code=400, detail="Published plans are read-only. Fork a draft first.")
    if plan.status == "ARCHIVED":
        raise HTTPException(status_code=400, detail="Archived plans cannot be edited.")

    # Update basic fields
    plan.name = data.name
    plan.description = data.description  # type: ignore
    plan.member_id = data.member_id  # type: ignore
    plan.is_template = data.is_template
    if data.expected_sessions_per_30d is not None:
        plan.expected_sessions_per_30d = data.expected_sessions_per_30d
    
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
        status="PUBLISHED",
        version=1,
        parent_plan_id=source_plan.id,
        published_at=datetime.utcnow(),
        expected_sessions_per_30d=source_plan.expected_sessions_per_30d or 12,
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


def _build_plan_summary(plan: WorkoutPlan) -> WorkoutPlanSummaryResponse:
    grouped: dict[str, list[str]] = {}
    total_videos = 0
    for ex in sorted(plan.exercises, key=lambda e: e.order):
        section = (ex.section_name or "General").strip() or "General"
        name = (ex.exercise_name or (ex.exercise.name if ex.exercise else None) or "Exercise").strip()
        grouped.setdefault(section, []).append(name)
        if ex.video_url or ex.uploaded_video_url or ex.embed_url:
            total_videos += 1
    preview_sections = [
        PlanPreviewSection(section_name=section, exercise_names=names[:3])
        for section, names in grouped.items()
    ]
    return WorkoutPlanSummaryResponse(
        id=plan.id,
        name=plan.name,
        status=plan.status,
        version=plan.version,
        member_id=plan.member_id,
        total_sections=len(grouped),
        total_exercises=sum(len(v) for v in grouped.values()),
        total_videos=total_videos,
        preview_sections=preview_sections,
    )


@router.get("/plan-summaries", response_model=StandardResponse[List[WorkoutPlanSummaryResponse]])
async def list_plan_summaries(
    current_user: Annotated[User, Depends(dependencies.require_active_customer_subscription)],
    db: Annotated[AsyncSession, Depends(get_db)],
    include_archived: bool = Query(False),
):
    if not _is_admin_or_coach(current_user):
        raise HTTPException(status_code=403, detail="Only admin/coach can access plan summaries")
    stmt = (
        select(WorkoutPlan)
        .where(WorkoutPlan.creator_id == current_user.id)
        .options(selectinload(WorkoutPlan.exercises).selectinload(WorkoutExercise.exercise))
        .order_by(WorkoutPlan.name)
    )
    if not include_archived:
        stmt = stmt.where(WorkoutPlan.status != "ARCHIVED")
    result = await db.execute(stmt)
    plans = result.scalars().all()
    return StandardResponse(data=[_build_plan_summary(plan) for plan in plans])


@router.post("/plans/{plan_id}/bulk-assign", response_model=StandardResponse)
async def bulk_assign_workout_plan(
    plan_id: uuid.UUID,
    payload: BulkAssignRequest,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.COACH]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    source_plan = await _get_workout_plan_or_404(db, plan_id, with_exercises=True)
    _ensure_plan_owned_by_requester_or_admin(source_plan, current_user, action="assign")
    if source_plan.status == "ARCHIVED":
        raise HTTPException(status_code=400, detail="Cannot assign archived plan")
    if not payload.member_ids:
        raise HTTPException(status_code=400, detail="member_ids cannot be empty")

    assigned_count = 0
    replaced_count = 0
    skipped: list[str] = []
    errors: list[str] = []
    unique_member_ids = list(dict.fromkeys(payload.member_ids))

    for member_id in unique_member_ids:
        try:
            member = await db.get(User, member_id)
            if not member:
                skipped.append(f"{member_id}: member not found")
                continue
            if payload.replace_active:
                active_stmt = select(WorkoutPlan).where(
                    WorkoutPlan.member_id == member_id,
                    WorkoutPlan.status != "ARCHIVED",
                )
                active_res = await db.execute(active_stmt)
                active_plans = active_res.scalars().all()
                for active_plan in active_plans:
                    active_plan.status = "ARCHIVED"
                    active_plan.archived_at = datetime.utcnow()
                    replaced_count += 1

            cloned_plan = WorkoutPlan(
                name=f"{source_plan.name} - {member.full_name}",
                description=source_plan.description,
                creator_id=current_user.id,
                member_id=member.id,
                is_template=False,
                status="PUBLISHED",
                version=1,
                parent_plan_id=source_plan.id,
                published_at=datetime.utcnow(),
                expected_sessions_per_30d=source_plan.expected_sessions_per_30d or 12,
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
            assigned_count += 1
        except Exception as exc:
            errors.append(f"{member_id}: {exc}")

    await db.commit()
    return StandardResponse(
        message="Bulk assignment completed",
        data={
            "assigned_count": assigned_count,
            "replaced_count": replaced_count,
            "skipped": skipped,
            "errors": errors,
        },
    )


@router.post("/plans/{plan_id}/publish", response_model=StandardResponse)
async def publish_workout_plan(
    plan_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.COACH]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    plan = await _get_workout_plan_or_404(db, plan_id)
    _ensure_plan_owned_by_requester_or_admin(plan, current_user, action="publish")
    if plan.status == "ARCHIVED":
        raise HTTPException(status_code=400, detail="Archived plans cannot be published")
    plan.status = "PUBLISHED"
    plan.published_at = datetime.utcnow()
    await db.commit()
    return StandardResponse(message="Plan published", data={"id": str(plan.id)})


@router.post("/plans/{plan_id}/archive", response_model=StandardResponse)
async def archive_workout_plan(
    plan_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.COACH]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    plan = await _get_workout_plan_or_404(db, plan_id)
    _ensure_plan_owned_by_requester_or_admin(plan, current_user, action="archive")
    plan.status = "ARCHIVED"
    plan.archived_at = datetime.utcnow()
    await db.commit()
    return StandardResponse(message="Plan archived", data={"id": str(plan.id)})


@router.post("/plans/{plan_id}/fork-draft", response_model=StandardResponse)
async def fork_workout_plan_as_draft(
    plan_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.COACH]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    source_plan = await _get_workout_plan_or_404(db, plan_id, with_exercises=True)
    _ensure_plan_owned_by_requester_or_admin(source_plan, current_user, action="fork")
    draft = WorkoutPlan(
        name=f"{source_plan.name} (Draft)",
        description=source_plan.description,
        creator_id=current_user.id,
        member_id=source_plan.member_id,
        is_template=source_plan.is_template,
        status="DRAFT",
        version=(source_plan.version or 1) + 1,
        parent_plan_id=source_plan.id,
        expected_sessions_per_30d=source_plan.expected_sessions_per_30d or 12,
    )
    db.add(draft)
    await db.flush()
    _add_workout_exercises(
        db,
        draft.id,
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
    return StandardResponse(message="Draft fork created", data={"id": str(draft.id)})


@router.get("/plans/adherence", response_model=StandardResponse[List[PlanAdherenceRow]])
async def get_plan_adherence_summary(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.COACH]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    window_days: int = Query(30, ge=7, le=180),
    threshold: float = Query(0.7, ge=0.1, le=1.0),
):
    from_dt = datetime.utcnow() - timedelta(days=window_days)
    plan_stmt = select(WorkoutPlan).where(
        WorkoutPlan.creator_id == current_user.id,
        WorkoutPlan.member_id.is_not(None),
        WorkoutPlan.status != "ARCHIVED",
    )
    plan_res = await db.execute(plan_stmt)
    plans = plan_res.scalars().all()
    grouped: dict[str, dict[str, int | float | str | uuid.UUID]] = {}
    for plan in plans:
        if not plan.member_id:
            continue
        root_id = plan.parent_plan_id or plan.id
        root_key = str(root_id)
        sessions_stmt = select(func.count(WorkoutSession.id)).where(
            WorkoutSession.plan_id == plan.id,
            WorkoutSession.performed_at >= from_dt,
        )
        sessions_count = (await db.execute(sessions_stmt)).scalar_one() or 0
        expected = max(1, int((plan.expected_sessions_per_30d or 12) * (window_days / 30)))
        score = sessions_count / expected
        adherent = 1 if score >= threshold else 0

        if root_key not in grouped:
            plan_name = plan.name
            if plan.parent_plan_id:
                parent = await db.get(WorkoutPlan, plan.parent_plan_id)
                if parent:
                    plan_name = parent.name
            grouped[root_key] = {
                "plan_id": root_id,
                "plan_name": plan_name,
                "assigned_members": 0,
                "adherent_members": 0,
            }
        grouped[root_key]["assigned_members"] = int(grouped[root_key]["assigned_members"]) + 1
        grouped[root_key]["adherent_members"] = int(grouped[root_key]["adherent_members"]) + adherent

    rows: list[PlanAdherenceRow] = []
    for g in grouped.values():
        assigned_members = int(g["assigned_members"])
        adherent_members = int(g["adherent_members"])
        adherence_percent = round((adherent_members / assigned_members) * 100.0, 2) if assigned_members else 0.0
        rows.append(
            PlanAdherenceRow(
                plan_id=g["plan_id"],  # type: ignore[arg-type]
                plan_name=str(g["plan_name"]),
                assigned_members=assigned_members,
                adherent_members=adherent_members,
                adherence_percent=adherence_percent,
            )
        )
    return StandardResponse(data=rows)


@router.get("/plans/{plan_id}/adherence", response_model=StandardResponse[PlanAdherenceRow])
async def get_single_plan_adherence(
    plan_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.COACH]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    window_days: int = Query(30, ge=7, le=180),
    threshold: float = Query(0.7, ge=0.1, le=1.0),
):
    plan = await _get_workout_plan_or_404(db, plan_id)
    _ensure_plan_owned_by_requester_or_admin(plan, current_user, action="view adherence for")
    root_id = plan.parent_plan_id or plan.id
    from_dt = datetime.utcnow() - timedelta(days=window_days)
    family_stmt = select(WorkoutPlan).where(
        WorkoutPlan.creator_id == current_user.id,
        WorkoutPlan.status != "ARCHIVED",
        ((WorkoutPlan.id == root_id) | (WorkoutPlan.parent_plan_id == root_id)),
    )
    family_plans = (await db.execute(family_stmt)).scalars().all()
    assigned_members = len([p for p in family_plans if p.member_id])
    adherent_members = 0
    root_plan_name = plan.name
    if plan.parent_plan_id:
        parent = await db.get(WorkoutPlan, plan.parent_plan_id)
        if parent:
            root_plan_name = parent.name

    for family_plan in family_plans:
        if not family_plan.member_id:
            continue
        sessions_stmt = select(func.count(WorkoutSession.id)).where(
            WorkoutSession.plan_id == family_plan.id,
            WorkoutSession.performed_at >= from_dt,
        )
        sessions_count = (await db.execute(sessions_stmt)).scalar_one() or 0
        expected = max(1, int((family_plan.expected_sessions_per_30d or 12) * (window_days / 30)))
        score = sessions_count / expected
        if score >= threshold:
            adherent_members += 1

    adherence_percent = round((adherent_members / assigned_members) * 100.0, 2) if assigned_members else 0.0
    row = PlanAdherenceRow(
        plan_id=root_id,
        plan_name=root_plan_name,
        assigned_members=assigned_members,
        adherent_members=adherent_members,
        adherence_percent=adherence_percent,
    )
    return StandardResponse(data=row)


@router.get("/exercise-library", response_model=StandardResponse[List[ExerciseLibraryItemResponse]])
async def list_exercise_library(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.COACH]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    scope: Literal["global", "mine", "all"] = Query("all"),
    query: str | None = Query(default=None),
):
    stmt = select(ExerciseLibraryItem).order_by(ExerciseLibraryItem.name)
    if scope == "global":
        stmt = stmt.where(ExerciseLibraryItem.is_global.is_(True))
    elif scope == "mine":
        stmt = stmt.where(ExerciseLibraryItem.owner_coach_id == current_user.id)
    else:
        stmt = stmt.where(
            (ExerciseLibraryItem.is_global.is_(True)) | (ExerciseLibraryItem.owner_coach_id == current_user.id)
        )
    if query:
        like = f"%{query.strip()}%"
        stmt = stmt.where(
            (ExerciseLibraryItem.name.ilike(like))
            | (ExerciseLibraryItem.category.ilike(like))
            | (ExerciseLibraryItem.muscle_group.ilike(like))
            | (ExerciseLibraryItem.equipment.ilike(like))
            | (ExerciseLibraryItem.tags.ilike(like))
        )
    result = await db.execute(stmt)
    items = result.scalars().all()
    data = [
        ExerciseLibraryItemResponse(
            id=item.id,
            name=item.name,
            category=item.category,
            muscle_group=item.muscle_group,
            equipment=item.equipment,
            tags=[t for t in (item.tags or "").split(",") if t],
            default_video_url=item.default_video_url,
            is_global=item.is_global,
            owner_coach_id=item.owner_coach_id,
        )
        for item in items
    ]
    return StandardResponse(data=data)


@router.post("/exercise-library", response_model=StandardResponse)
async def create_exercise_library_item(
    payload: ExerciseLibraryItemCreate,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.COACH]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    item = ExerciseLibraryItem(
        name=payload.name.strip(),
        category=payload.category.strip() if payload.category else None,
        muscle_group=payload.muscle_group.strip() if payload.muscle_group else None,
        equipment=payload.equipment.strip() if payload.equipment else None,
        tags=",".join(t.strip() for t in payload.tags if t.strip()) or None,
        default_video_url=str(payload.default_video_url) if payload.default_video_url else None,
        is_global=bool(payload.is_global and current_user.role == Role.ADMIN),
        owner_coach_id=None if payload.is_global and current_user.role == Role.ADMIN else current_user.id,
        created_at=datetime.utcnow(),
    )
    db.add(item)
    await db.commit()
    return StandardResponse(message="Library item created", data={"id": str(item.id)})


@router.put("/exercise-library/{item_id}", response_model=StandardResponse)
async def update_exercise_library_item(
    item_id: uuid.UUID,
    payload: ExerciseLibraryItemUpdate,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.COACH]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    item = await db.get(ExerciseLibraryItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Library item not found")
    if not _can_manage_shared_library_item(
        current_user=current_user,
        is_global=item.is_global,
        owner_coach_id=item.owner_coach_id,
    ):
        raise HTTPException(status_code=403, detail="Not allowed to update this library item")

    item.name = payload.name.strip()
    item.category = payload.category.strip() if payload.category else None
    item.muscle_group = payload.muscle_group.strip() if payload.muscle_group else None
    item.equipment = payload.equipment.strip() if payload.equipment else None
    item.tags = ",".join(t.strip() for t in payload.tags if t.strip()) or None
    item.default_video_url = str(payload.default_video_url) if payload.default_video_url else None
    item.is_global = bool(payload.is_global and current_user.role == Role.ADMIN)
    item.owner_coach_id = None if item.is_global else current_user.id

    await db.commit()
    return StandardResponse(message="Library item updated")


@router.delete("/exercise-library/{item_id}", response_model=StandardResponse)
async def delete_exercise_library_item(
    item_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.COACH]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    item = await db.get(ExerciseLibraryItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Library item not found")
    if not _can_manage_shared_library_item(
        current_user=current_user,
        is_global=item.is_global,
        owner_coach_id=item.owner_coach_id,
    ):
        raise HTTPException(status_code=403, detail="Not allowed to delete this library item")

    recent_stmt = select(ExerciseLibraryRecent).where(ExerciseLibraryRecent.exercise_library_item_id == item_id)
    recent_rows = (await db.execute(recent_stmt)).scalars().all()
    for row in recent_rows:
        await db.delete(row)

    await db.delete(item)
    await db.commit()
    return StandardResponse(message="Library item deleted")


@router.post("/exercise-library/{item_id}/quick-add", response_model=StandardResponse)
async def mark_exercise_library_recent(
    item_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.COACH]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    item = await db.get(ExerciseLibraryItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Library item not found")
    stmt = select(ExerciseLibraryRecent).where(
        ExerciseLibraryRecent.coach_id == current_user.id,
        ExerciseLibraryRecent.exercise_library_item_id == item_id,
    )
    existing = (await db.execute(stmt)).scalar_one_or_none()
    if existing:
        existing.last_used_at = datetime.utcnow()
    else:
        db.add(
            ExerciseLibraryRecent(
                coach_id=current_user.id,
                exercise_library_item_id=item_id,
                last_used_at=datetime.utcnow(),
            )
        )
    await db.commit()
    return StandardResponse(message="Recent usage recorded")


@router.get("/exercise-library/recent", response_model=StandardResponse[List[ExerciseLibraryItemResponse]])
async def list_exercise_library_recent(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.COACH]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    stmt = (
        select(ExerciseLibraryRecent)
        .where(ExerciseLibraryRecent.coach_id == current_user.id)
        .options(selectinload(ExerciseLibraryRecent.exercise_library_item))
        .order_by(ExerciseLibraryRecent.last_used_at.desc())
        .limit(10)
    )
    rows = (await db.execute(stmt)).scalars().all()
    data: list[ExerciseLibraryItemResponse] = []
    for row in rows:
        item = row.exercise_library_item
        if not item:
            continue
        data.append(
            ExerciseLibraryItemResponse(
                id=item.id,
                name=item.name,
                category=item.category,
                muscle_group=item.muscle_group,
                equipment=item.equipment,
                tags=[t for t in (item.tags or "").split(",") if t],
                default_video_url=item.default_video_url,
                is_global=item.is_global,
                owner_coach_id=item.owner_coach_id,
            )
        )
    return StandardResponse(data=data)



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


@router.get("/diet-library", response_model=StandardResponse[List[DietLibraryItemResponse]])
async def list_diet_library(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.COACH]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    scope: Literal["global", "mine", "all"] = Query("all"),
    query: str | None = Query(default=None),
):
    stmt = select(DietLibraryItem).order_by(DietLibraryItem.name)
    if scope == "global":
        stmt = stmt.where(DietLibraryItem.is_global.is_(True))
    elif scope == "mine":
        stmt = stmt.where(DietLibraryItem.owner_coach_id == current_user.id)
    else:
        stmt = stmt.where(
            (DietLibraryItem.is_global.is_(True)) | (DietLibraryItem.owner_coach_id == current_user.id)
        )
    if query:
        like = f"%{query.strip()}%"
        stmt = stmt.where(
            (DietLibraryItem.name.ilike(like))
            | (DietLibraryItem.description.ilike(like))
            | (DietLibraryItem.content.ilike(like))
        )
    rows = (await db.execute(stmt)).scalars().all()
    return StandardResponse(data=[DietLibraryItemResponse.model_validate(row) for row in rows])


@router.post("/diet-library", response_model=StandardResponse)
async def create_diet_library_item(
    payload: DietLibraryItemCreate,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.COACH]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    item = DietLibraryItem(
        name=payload.name.strip(),
        description=payload.description.strip() if payload.description else None,
        content=payload.content.strip(),
        is_global=bool(payload.is_global and current_user.role == Role.ADMIN),
        owner_coach_id=None if payload.is_global and current_user.role == Role.ADMIN else current_user.id,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(item)
    await db.commit()
    return StandardResponse(message="Diet library item created", data={"id": str(item.id)})


@router.put("/diet-library/{item_id}", response_model=StandardResponse)
async def update_diet_library_item(
    item_id: uuid.UUID,
    payload: DietLibraryItemUpdate,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.COACH]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    item = await db.get(DietLibraryItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Diet library item not found")
    if not _can_manage_shared_library_item(
        current_user=current_user,
        is_global=item.is_global,
        owner_coach_id=item.owner_coach_id,
    ):
        raise HTTPException(status_code=403, detail="Not allowed to update this diet library item")

    item.name = payload.name.strip()
    item.description = payload.description.strip() if payload.description else None
    item.content = payload.content.strip()
    item.is_global = bool(payload.is_global and current_user.role == Role.ADMIN)
    item.owner_coach_id = None if item.is_global else current_user.id
    item.updated_at = datetime.utcnow()
    await db.commit()
    return StandardResponse(message="Diet library item updated")


@router.delete("/diet-library/{item_id}", response_model=StandardResponse)
async def delete_diet_library_item(
    item_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.COACH]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    item = await db.get(DietLibraryItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Diet library item not found")
    if not _can_manage_shared_library_item(
        current_user=current_user,
        is_global=item.is_global,
        owner_coach_id=item.owner_coach_id,
    ):
        raise HTTPException(status_code=403, detail="Not allowed to delete this diet library item")
    await db.delete(item)
    await db.commit()
    return StandardResponse(message="Diet library item deleted")


@router.post("/diet-library/{item_id}/to-plan", response_model=StandardResponse)
async def diet_library_item_to_plan(
    item_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.COACH]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    item = await db.get(DietLibraryItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Diet library item not found")
    if not (item.is_global or item.owner_coach_id == current_user.id):
        raise HTTPException(status_code=403, detail="Not allowed to use this diet library item")

    plan = DietPlan(
        name=item.name,
        description=item.description,
        content=item.content,
        creator_id=current_user.id,
        member_id=None,
    )
    db.add(plan)
    await db.commit()
    return StandardResponse(message="Diet plan created from library item", data={"id": str(plan.id)})


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

