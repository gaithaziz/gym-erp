import os
import json
from contextlib import asynccontextmanager
from typing import Any, Annotated, List, Literal
from datetime import date, datetime, timedelta, time
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
from app.database import get_db, set_rls_context
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
from app.services.tenancy_service import TenancyService

DietFeedback = workout_log_models.DietFeedback
GymFeedback = workout_log_models.GymFeedback
WorkoutLog = workout_log_models.WorkoutLog
WorkoutSession = workout_log_models.WorkoutSession
WorkoutSessionEntry = workout_log_models.WorkoutSessionEntry
WorkoutSessionDraft = workout_log_models.WorkoutSessionDraft
WorkoutSessionDraftEntry = workout_log_models.WorkoutSessionDraftEntry
MemberDietTrackingDay = workout_log_models.MemberDietTrackingDay
MemberDietTrackingMeal = workout_log_models.MemberDietTrackingMeal

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
    return user.role in [Role.ADMIN, Role.MANAGER, Role.COACH]


def _snapshot_rls_context(db: AsyncSession) -> tuple[object, object, object, object]:
    return (
        db.info.get("rls_user_id", ""),
        db.info.get("rls_user_role", "ANONYMOUS"),
        db.info.get("rls_gym_id", ""),
        db.info.get("rls_branch_id", ""),
    )


async def _restore_rls_context(db: AsyncSession, snapshot: tuple[object, object, object, object]) -> None:
    user_id, role, gym_id, branch_id = snapshot
    await set_rls_context(
        db,
        user_id=user_id,
        role=role,
        gym_id=gym_id,
        branch_id=branch_id,
    )


@asynccontextmanager
async def _customer_tenant_scope(db: AsyncSession, user: User):
    if user.role != Role.CUSTOMER:
        yield
        return

    snapshot = _snapshot_rls_context(db)
    await set_rls_context(
        db,
        user_id=str(user.id),
        role=Role.ADMIN.value,
        gym_id=str(user.gym_id) if user.gym_id else snapshot[2],
        branch_id=str(user.home_branch_id) if user.home_branch_id else snapshot[3],
    )
    try:
        yield
    finally:
        await _restore_rls_context(db, snapshot)


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
    gym_id: uuid.UUID | None = None,
) -> WorkoutPlan:
    stmt = select(WorkoutPlan).where(WorkoutPlan.id == plan_id)
    if gym_id is not None:
        stmt = stmt.where(WorkoutPlan.gym_id == gym_id)
    if with_exercises:
        stmt = stmt.options(selectinload(WorkoutPlan.exercises).selectinload(WorkoutExercise.exercise))

    result = await db.execute(stmt)
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    return plan


async def _get_diet_plan_or_404(
    db: AsyncSession,
    diet_id: uuid.UUID,
    *,
    gym_id: uuid.UUID | None = None,
) -> DietPlan:
    stmt = select(DietPlan).where(DietPlan.id == diet_id)
    if gym_id is not None:
        stmt = stmt.where(DietPlan.gym_id == gym_id)
    result = await db.execute(stmt)
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Diet plan not found")
    return plan


def _ensure_plan_owned_by_requester_or_admin(plan: WorkoutPlan, current_user: User, *, action: str) -> None:
    if current_user.role not in {Role.ADMIN, Role.MANAGER} and plan.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail=f"Cannot {action} plan created by another user")


def _ensure_diet_owned_by_requester_or_admin(plan: DietPlan, current_user: User, *, action: str) -> None:
    if current_user.role not in {Role.ADMIN, Role.MANAGER} and plan.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail=f"Cannot {action} diet plan created by another user")


def _can_manage_shared_library_item(*, current_user: User, is_global: bool, owner_coach_id: uuid.UUID | None) -> bool:
    if current_user.role == Role.ADMIN:
        return is_global or owner_coach_id == current_user.id
    return (not is_global) and owner_coach_id == current_user.id


async def _get_exercise_library_item_or_404(
    db: AsyncSession,
    *,
    current_user: User,
    item_id: uuid.UUID,
) -> ExerciseLibraryItem:
    item = (
        await db.execute(
            select(ExerciseLibraryItem).where(
                ExerciseLibraryItem.id == item_id,
                ExerciseLibraryItem.gym_id == current_user.gym_id,
            )
        )
    ).scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="Library item not found")
    return item


async def _get_diet_library_item_or_404(
    db: AsyncSession,
    *,
    current_user: User,
    item_id: uuid.UUID,
) -> DietLibraryItem:
    item = (
        await db.execute(
            select(DietLibraryItem).where(
                DietLibraryItem.id == item_id,
                DietLibraryItem.gym_id == current_user.gym_id,
            )
        )
    ).scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="Diet library item not found")
    return item


def _apply_date_filters(stmt, model_date_field, from_date: datetime | None, to_date: datetime | None):
    if from_date:
        stmt = stmt.where(model_date_field >= from_date)
    if to_date:
        stmt = stmt.where(model_date_field <= to_date)
    return stmt


def _normalize_diet_structure(plan: DietPlan) -> list[dict[str, Any]]:
    structured = plan.content_structured
    if isinstance(structured, list):
        raw_days = structured
    elif isinstance(structured, dict):
        raw_days = structured.get("days", [])
    else:
        raw_days = []

    normalized_days: list[dict[str, Any]] = []
    for day_index, raw_day in enumerate(raw_days):
        if not isinstance(raw_day, dict):
            continue
        day_id = str(raw_day.get("id") or f"day-{day_index + 1}")
        meals: list[dict[str, Any]] = []
        raw_meals = raw_day.get("meals", [])
        if isinstance(raw_meals, list):
            for meal_index, raw_meal in enumerate(raw_meals):
                if not isinstance(raw_meal, dict):
                    continue
                meal_id = str(raw_meal.get("id") or f"{day_id}-meal-{meal_index + 1}")
                items: list[dict[str, Any]] = []
                raw_items = raw_meal.get("items", [])
                if isinstance(raw_items, list):
                    for item_index, raw_item in enumerate(raw_items):
                        if isinstance(raw_item, str):
                            items.append(
                                {
                                    "id": f"{meal_id}-item-{item_index + 1}",
                                    "label": raw_item,
                                    "quantity": None,
                                    "notes": None,
                                }
                            )
                            continue
                        if not isinstance(raw_item, dict):
                            continue
                        label = raw_item.get("label") or raw_item.get("name") or raw_item.get("title")
                        if not label:
                            continue
                        items.append(
                            {
                                "id": str(raw_item.get("id") or f"{meal_id}-item-{item_index + 1}"),
                                "label": str(label),
                                "quantity": raw_item.get("quantity"),
                                "notes": raw_item.get("notes"),
                            }
                        )
                meals.append(
                    {
                        "id": meal_id,
                        "name": str(raw_meal.get("name") or raw_meal.get("title") or f"Meal {meal_index + 1}"),
                        "time_label": raw_meal.get("time_label") or raw_meal.get("time"),
                        "instructions": raw_meal.get("instructions") or raw_meal.get("notes"),
                        "items": items,
                    }
                )
        normalized_days.append(
            {
                "id": day_id,
                "name": str(raw_day.get("name") or raw_day.get("title") or f"Day {day_index + 1}"),
                "meals": meals,
            }
        )
    return normalized_days


def _active_entry_index(entries: list[WorkoutSessionDraftEntry]) -> int:
    for idx, entry in enumerate(entries):
        if not entry.skipped and entry.completed_at is None:
            return idx
    return len(entries)


def _parse_set_details(value: str | None) -> list[dict[str, Any]]:
    if not value:
        return []
    try:
        parsed = json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return []
    if not isinstance(parsed, list):
        return []
    return [item for item in parsed if isinstance(item, dict)]


class WorkoutSetDetail(BaseModel):
    set: int = Field(ge=1)
    reps: int = Field(ge=0)
    weightKg: float | None = Field(default=None, ge=0)


def _serialize_validated_set_details(value: list[WorkoutSetDetail] | None) -> str | None:
    if not value:
        return None
    return json.dumps([item.model_dump() if isinstance(item, WorkoutSetDetail) else item for item in value])


def _validate_workout_attachment_owner(data: Any, current_user: User) -> None:
    attachment_url = getattr(data, "attachment_url", None)
    attachment_mime = getattr(data, "attachment_mime", None)
    if not attachment_url:
        return
    expected_prefix = f"/static/workout_session_media/{current_user.id}/"
    if not attachment_url.startswith(expected_prefix):
        raise HTTPException(status_code=403, detail="Workout session attachment does not belong to your account")
    if not attachment_mime or not (
        attachment_mime.startswith("image/") or attachment_mime.startswith("video/")
    ):
        raise HTTPException(status_code=400, detail="Workout session attachment must be an image or video")


def _serialize_tracking_day(
    tracking_day: MemberDietTrackingDay | None,
) -> "MemberDietTrackingDayResponse | None":
    if tracking_day is None:
        return None
    meals = [
        MemberDietTrackingMealResponse(
            id=meal.meal_key,
            name=meal.meal_name,
            completed=meal.completed,
            skipped=meal.skipped,
            note=meal.note,
        )
        for meal in sorted(tracking_day.meals, key=lambda item: item.meal_name.lower())
    ]
    return MemberDietTrackingDayResponse(
        id=tracking_day.id,
        tracked_for=tracking_day.tracked_for,
        active_day_id=tracking_day.active_day_id,
        current_meal_index=tracking_day.current_meal_index,
        adherence_rating=tracking_day.adherence_rating,
        notes=tracking_day.notes,
        meals=meals,
    )


def _normalize_day_id(value: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise HTTPException(status_code=400, detail="Day id is required")
    return normalized


def _diet_days_by_id(plan: DietPlan) -> dict[str, dict[str, Any]]:
    return {day["id"]: day for day in _normalize_diet_structure(plan)}


def _diet_day_or_400(plan: DietPlan, day_id: str) -> dict[str, Any]:
    day = _diet_days_by_id(plan).get(day_id)
    if day is None:
        raise HTTPException(status_code=400, detail="Selected diet day was not found in this plan")
    return day


def _diet_meal_index_or_400(day: dict[str, Any], meal_id: str) -> int:
    for index, meal in enumerate(day["meals"]):
        if meal["id"] == meal_id:
            return index
    raise HTTPException(status_code=400, detail="Selected meal was not found in this plan day")


def _diet_expected_meal_or_400(day: dict[str, Any], tracking_day: MemberDietTrackingDay) -> dict[str, Any]:
    if tracking_day.current_meal_index >= len(day["meals"]):
        raise HTTPException(status_code=400, detail="This diet day is already complete")
    return day["meals"][tracking_day.current_meal_index]


def _diet_tracking_requires_active_day(day_id: str, tracking_day: MemberDietTrackingDay) -> None:
    if tracking_day.active_day_id != day_id:
        raise HTTPException(status_code=400, detail="Start this diet day before logging meals")


def _upsert_tracking_meal_row(
    tracking_day: MemberDietTrackingDay,
    meal_id: str,
    meal_name: str,
) -> MemberDietTrackingMeal:
    by_key = {meal.meal_key: meal for meal in tracking_day.meals}
    row = by_key.get(meal_id)
    if row is None:
        row = MemberDietTrackingMeal(
            tracking_day_id=tracking_day.id,
            meal_key=meal_id,
            meal_name=meal_name,
            completed=False,
            skipped=False,
            note=None,
            updated_at=datetime.utcnow(),
        )
        tracking_day.meals.append(row)
    return row


def _diet_first_pending_meal_index(day: dict[str, Any], tracking_day: MemberDietTrackingDay) -> int:
    by_key = {meal.meal_key: meal for meal in tracking_day.meals}
    for index, meal in enumerate(day["meals"]):
        existing = by_key.get(meal["id"])
        if existing is None or (not existing.completed and not existing.skipped):
            return index
    return len(day["meals"])


def _build_tracker_payload(
    plan: DietPlan,
    tracking_day: MemberDietTrackingDay | None,
) -> "MemberDietTrackerResponse":
    tracked_meals = {meal.meal_key: meal for meal in (tracking_day.meals if tracking_day else [])}
    days: list[DietDayResponse] = []
    for day in _normalize_diet_structure(plan):
        meals = [
            DietMealResponse(
                id=meal["id"],
                name=meal["name"],
                completed=tracked_meals.get(meal["id"]).completed if meal["id"] in tracked_meals else False,
                skipped=tracked_meals.get(meal["id"]).skipped if meal["id"] in tracked_meals else False,
                note=tracked_meals.get(meal["id"]).note if meal["id"] in tracked_meals else None,
                time_label=meal["time_label"],
                instructions=meal["instructions"],
                items=[DietMealItemResponse(**item) for item in meal["items"]],
            )
            for meal in day["meals"]
        ]
        days.append(DietDayResponse(id=day["id"], name=day["name"], meals=meals))
    return MemberDietTrackerResponse(
        plan_id=plan.id,
        plan_name=plan.name,
        description=plan.description,
        has_structured_content=bool(days),
        legacy_content=plan.content,
        active_day_id=tracking_day.active_day_id if tracking_day else None,
        current_meal_index=tracking_day.current_meal_index if tracking_day else 0,
        days=days,
        tracking_day=_serialize_tracking_day(tracking_day),
    )


async def _require_member_workout_plan(
    db: AsyncSession,
    current_user: User,
    plan_id: uuid.UUID,
) -> WorkoutPlan:
    if current_user.role == Role.CUSTOMER:
        snapshot = _snapshot_rls_context(db)
        try:
            await set_rls_context(
                db,
                user_id=str(current_user.id),
                role=Role.ADMIN.value,
                gym_id=str(current_user.gym_id) if current_user.gym_id else snapshot[2],
                branch_id=str(current_user.home_branch_id) if current_user.home_branch_id else snapshot[3],
            )
            plan = await _get_workout_plan_or_404(
                db,
                plan_id,
                with_exercises=True,
                gym_id=current_user.gym_id,
            )
        finally:
            await _restore_rls_context(db, snapshot)
    else:
        plan = await _get_workout_plan_or_404(db, plan_id, with_exercises=True)

    if current_user.role == Role.CUSTOMER and plan.member_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only access workout plans assigned to your account")
    return plan


async def _require_member_diet_plan(
    db: AsyncSession,
    current_user: User,
    diet_id: uuid.UUID,
) -> DietPlan:
    if current_user.role == Role.CUSTOMER:
        snapshot = _snapshot_rls_context(db)
        try:
            await set_rls_context(
                db,
                user_id=str(current_user.id),
                role=Role.ADMIN.value,
                gym_id=str(current_user.gym_id) if current_user.gym_id else snapshot[2],
                branch_id=str(current_user.home_branch_id) if current_user.home_branch_id else snapshot[3],
            )
            plan = await _get_diet_plan_or_404(db, diet_id, gym_id=current_user.gym_id)
        finally:
            await _restore_rls_context(db, snapshot)
    else:
        plan = await _get_diet_plan_or_404(db, diet_id)

    if current_user.role == Role.CUSTOMER and plan.member_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only access diet plans assigned to your account")
    return plan


async def _get_member_diet_tracking_day(
    db: AsyncSession,
    *,
    member_id: uuid.UUID,
    diet_id: uuid.UUID,
    tracked_for: date,
) -> MemberDietTrackingDay | None:
    stmt = (
        select(MemberDietTrackingDay)
        .where(
            MemberDietTrackingDay.member_id == member_id,
            MemberDietTrackingDay.diet_plan_id == diet_id,
            MemberDietTrackingDay.tracked_for == tracked_for,
        )
        .options(selectinload(MemberDietTrackingDay.meals))
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def _get_or_create_member_diet_tracking_day(
    db: AsyncSession,
    *,
    member_id: uuid.UUID,
    diet_id: uuid.UUID,
    tracked_for: date,
) -> MemberDietTrackingDay:
    existing = await _get_member_diet_tracking_day(
        db,
        member_id=member_id,
        diet_id=diet_id,
        tracked_for=tracked_for,
    )
    if existing is not None:
        return existing

    tracking_day = MemberDietTrackingDay(
        member_id=member_id,
        diet_plan_id=diet_id,
        tracked_for=tracked_for,
        current_meal_index=0,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(tracking_day)
    await db.flush()
    await db.refresh(tracking_day, attribute_names=["meals"])
    return tracking_day


async def _get_active_draft_for_member(
    db: AsyncSession,
    *,
    member_id: uuid.UUID,
    plan_id: uuid.UUID | None = None,
) -> WorkoutSessionDraft | None:
    stmt = (
        select(WorkoutSessionDraft)
        .where(WorkoutSessionDraft.member_id == member_id)
        .options(selectinload(WorkoutSessionDraft.entries))
        .order_by(WorkoutSessionDraft.started_at.desc())
    )
    if plan_id is not None:
        stmt = stmt.where(WorkoutSessionDraft.plan_id == plan_id)
    result = await db.execute(stmt)
    draft = result.scalars().first()
    if draft:
        draft.entries.sort(key=lambda entry: entry.order)
        draft.current_exercise_index = _active_entry_index(draft.entries)
    return draft


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


@router.post("/workout-session-media/upload", response_model=StandardResponse)
async def upload_workout_session_media(
    current_user: Annotated[User, Depends(dependencies.require_active_customer_subscription)],
    file: UploadFile = File(...),
):
    """Upload a member workout-session attachment and return a static URL."""
    allowed_types = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "video/mp4", "video/webm", "video/quicktime"}
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Unsupported media type")

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".mp4", ".webm", ".mov"}:
        ext = ".jpg" if (file.content_type or "").startswith("image/") else ".mp4"

    upload_dir = os.path.join("static", "workout_session_media", str(current_user.id))
    os.makedirs(upload_dir, exist_ok=True)

    file_name = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(upload_dir, file_name)
    total = 0
    max_size = 25 * 1024 * 1024

    with open(file_path, "wb") as out_file:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > max_size:
                out_file.close()
                os.remove(file_path)
                raise HTTPException(status_code=400, detail="Media file is too large")
            out_file.write(chunk)

    return StandardResponse(
        data={
            "media_url": f"/static/workout_session_media/{current_user.id}/{file_name}",
            "media_mime": file.content_type,
            "media_size_bytes": total,
        },
        message="Media uploaded",
    )

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
    include_all_creators: bool = Query(False),
    creator_id: uuid.UUID | None = Query(default=None),
):
    """List plans visible to the user (Created by them OR Assigned to them)."""
    async with _customer_tenant_scope(db, current_user):
        plan_exercises = selectinload(WorkoutPlan.exercises).selectinload(WorkoutExercise.exercise)
        if _is_admin_or_coach(current_user):
            if current_user.role == Role.ADMIN and include_all_creators:
                stmt = select(WorkoutPlan).options(plan_exercises)
                if creator_id:
                    stmt = stmt.where(WorkoutPlan.creator_id == creator_id)
            else:
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
    include_all_creators: bool = Query(False),
    templates_only: bool = Query(False),
):
    if not _is_admin_or_coach(current_user):
        raise HTTPException(status_code=403, detail="Only admin/manager/coach can access plan summaries")
    stmt = (
        select(WorkoutPlan)
        .options(selectinload(WorkoutPlan.exercises).selectinload(WorkoutExercise.exercise))
        .order_by(WorkoutPlan.name)
    )
    if current_user.role not in {Role.ADMIN, Role.MANAGER} or not include_all_creators:
        stmt = stmt.where(WorkoutPlan.creator_id == current_user.id)
    if templates_only:
        stmt = stmt.where(WorkoutPlan.member_id.is_(None))
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
            member = await TenancyService.get_user_in_gym(db, gym_id=current_user.gym_id, user_id=member_id)
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
                parent = await _get_workout_plan_or_404(db, plan.parent_plan_id, gym_id=current_user.gym_id)
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
        parent = await _get_workout_plan_or_404(db, plan.parent_plan_id, gym_id=current_user.gym_id)
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
    item = await _get_exercise_library_item_or_404(db, current_user=current_user, item_id=item_id)
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
    item = await _get_exercise_library_item_or_404(db, current_user=current_user, item_id=item_id)
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
    item = await _get_exercise_library_item_or_404(db, current_user=current_user, item_id=item_id)
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
    content_structured: dict[str, Any] | list[Any] | None = None
    member_id: uuid.UUID | None = None
    is_template: bool = False
    status: Literal["DRAFT", "PUBLISHED", "ARCHIVED"] | None = None


class DietPlanUpdate(BaseModel):
    name: str
    description: str | None = None
    content: str
    content_structured: dict[str, Any] | list[Any] | None = None
    member_id: uuid.UUID | None = None
    is_template: bool = False

class DietPlanResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None = None
    content: str
    content_structured: dict[str, Any] | list[Any] | None = None
    creator_id: uuid.UUID
    member_id: uuid.UUID | None
    is_template: bool
    status: str
    version: int
    parent_plan_id: uuid.UUID | None = None
    published_at: datetime | None = None
    archived_at: datetime | None = None

    class Config:
        from_attributes = True


class DietMealItemResponse(BaseModel):
    id: str
    label: str
    quantity: str | None = None
    notes: str | None = None


class DietMealResponse(BaseModel):
    id: str
    name: str
    completed: bool = False
    skipped: bool = False
    note: str | None = None
    time_label: str | None = None
    instructions: str | None = None
    items: list[DietMealItemResponse] = Field(default_factory=list)


class DietDayResponse(BaseModel):
    id: str
    name: str
    meals: list[DietMealResponse] = Field(default_factory=list)


class MemberDietTrackingMealUpdate(BaseModel):
    meal_id: str
    completed: bool
    note: str | None = None


class MemberDietTrackingMealResponse(BaseModel):
    id: str
    name: str
    completed: bool
    skipped: bool = False
    note: str | None = None


class MemberDietTrackingDayUpsert(BaseModel):
    tracked_for: date
    adherence_rating: int | None = Field(None, ge=1, le=5)
    notes: str | None = None
    meals: list[MemberDietTrackingMealUpdate] = Field(default_factory=list)


class MemberDietTrackingDayResponse(BaseModel):
    id: uuid.UUID
    tracked_for: date
    active_day_id: str | None = None
    current_meal_index: int = 0
    adherence_rating: int | None = None
    notes: str | None = None
    meals: list[MemberDietTrackingMealResponse] = Field(default_factory=list)


class MemberDietTrackingStartRequest(BaseModel):
    tracked_for: date
    day_id: str


class MemberDietTrackingMealProgressRequest(BaseModel):
    note: str | None = None


class MemberDietTrackerResponse(BaseModel):
    plan_id: uuid.UUID
    plan_name: str
    description: str | None = None
    has_structured_content: bool
    legacy_content: str | None = None
    active_day_id: str | None = None
    current_meal_index: int = 0
    days: list[DietDayResponse] = Field(default_factory=list)
    tracking_day: MemberDietTrackingDayResponse | None = None


class DietPlanSummaryResponse(BaseModel):
    id: uuid.UUID
    name: str
    status: str
    version: int
    member_id: uuid.UUID | None = None
    description_excerpt: str | None = None
    content_length: int
    has_structured_content: bool

    class Config:
        from_attributes = True


class DietBulkAssignRequest(BaseModel):
    member_ids: List[uuid.UUID] = Field(default_factory=list)
    replace_active: bool = True


def _build_diet_summary(plan: DietPlan) -> DietPlanSummaryResponse:
    excerpt = (plan.description or "").strip()
    if excerpt:
        excerpt = excerpt[:120]
    return DietPlanSummaryResponse(
        id=plan.id,
        name=plan.name,
        status=plan.status,
        version=plan.version,
        member_id=plan.member_id,
        description_excerpt=excerpt or None,
        content_length=len((plan.content or "").strip()),
        has_structured_content=plan.content_structured is not None,
    )



@router.post("/diets", response_model=StandardResponse)
async def create_diet_plan(
    data: DietPlanCreate,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.COACH]))],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Create a new diet plan."""
    status = data.status or "DRAFT"
    if status not in PLAN_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid plan status")
    plan = DietPlan(
        name=data.name,
        description=data.description,
        content=data.content,
        content_structured=data.content_structured,
        creator_id=current_user.id,
        member_id=data.member_id,
        is_template=data.is_template,
        status=status,
        version=1,
        published_at=datetime.utcnow() if status == "PUBLISHED" else None,
        archived_at=datetime.utcnow() if status == "ARCHIVED" else None,
    )
    db.add(plan)
    await db.commit()
    return StandardResponse(message="Diet Plan Created", data={"id": str(plan.id)})


@router.get("/diets", response_model=StandardResponse[List[DietPlanResponse]])
async def list_diet_plans(
    current_user: Annotated[User, Depends(dependencies.require_active_customer_subscription)],
    db: Annotated[AsyncSession, Depends(get_db)],
    include_archived: bool = Query(False),
    include_all_creators: bool = Query(False),
    creator_id: uuid.UUID | None = Query(default=None),
    templates_only: bool = Query(False),
):
    """List diet plans visible to the user."""
    async with _customer_tenant_scope(db, current_user):
        if _is_admin_or_coach(current_user):
            if (
                current_user.role == Role.ADMIN
                and include_all_creators
            ):
                stmt = select(DietPlan)
                if creator_id:
                    stmt = stmt.where(DietPlan.creator_id == creator_id)
            else:
                stmt = select(DietPlan).where(DietPlan.creator_id == current_user.id)
        else:
            stmt = select(DietPlan).where(DietPlan.member_id == current_user.id)

        if templates_only:
            stmt = stmt.where(DietPlan.member_id.is_(None))
        if not include_archived:
            stmt = stmt.where(DietPlan.status != "ARCHIVED")
        stmt = stmt.order_by(DietPlan.name)
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
    async with _customer_tenant_scope(db, current_user):
        stmt = select(DietPlan).where(DietPlan.id == diet_id, DietPlan.gym_id == current_user.gym_id)
        result = await db.execute(stmt)
        plan = result.scalar_one_or_none()
        if not plan:
            raise HTTPException(status_code=404, detail="Diet plan not found")

        if _is_admin_or_coach(current_user):
            return StandardResponse(data=DietPlanResponse.model_validate(plan))

        # Data isolation: member can only see their own plan
        if plan.member_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")
        return StandardResponse(data=DietPlanResponse.model_validate(plan))


@router.put("/diets/{diet_id}", response_model=StandardResponse)
async def update_diet_plan(
    diet_id: uuid.UUID,
    data: DietPlanUpdate,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.COACH]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    plan = await _get_diet_plan_or_404(db, diet_id)
    _ensure_diet_owned_by_requester_or_admin(plan, current_user, action="edit")
    if plan.status == "PUBLISHED":
        raise HTTPException(status_code=400, detail="Published plans are read-only. Fork a draft first.")
    if plan.status == "ARCHIVED":
        raise HTTPException(status_code=400, detail="Archived plans cannot be edited.")

    plan.name = data.name
    plan.description = data.description
    plan.content = data.content
    plan.content_structured = data.content_structured
    plan.member_id = data.member_id
    plan.is_template = data.is_template
    await db.commit()
    return StandardResponse(message="Diet plan updated")


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
        content_structured=source_plan.content_structured,
        creator_id=current_user.id,
        member_id=clone_data.member_id,
        is_template=False,
        status="PUBLISHED",
        version=1,
        parent_plan_id=source_plan.id,
        published_at=datetime.utcnow(),
    )
    db.add(cloned_plan)
    await db.commit()
    return StandardResponse(message="Diet plan cloned successfully", data={"id": str(cloned_plan.id)})


@router.post("/diets/{diet_id}/bulk-assign", response_model=StandardResponse)
async def bulk_assign_diet_plan(
    diet_id: uuid.UUID,
    payload: DietBulkAssignRequest,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.MANAGER, Role.COACH]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    source_plan = await _get_diet_plan_or_404(db, diet_id)
    _ensure_diet_owned_by_requester_or_admin(source_plan, current_user, action="assign")
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
            member = await TenancyService.get_user_in_gym(db, gym_id=current_user.gym_id, user_id=member_id)
            if not member:
                skipped.append(f"{member_id}: member not found")
                continue
            if member.role != Role.CUSTOMER:
                skipped.append(f"{member_id}: not a customer")
                continue

            if payload.replace_active:
                active_stmt = select(DietPlan).where(
                    DietPlan.member_id == member_id,
                    DietPlan.status != "ARCHIVED",
                )
                if current_user.role == Role.COACH:
                    active_stmt = active_stmt.where(DietPlan.creator_id == current_user.id)
                active_res = await db.execute(active_stmt)
                active_plans = active_res.scalars().all()
                for active_plan in active_plans:
                    active_plan.status = "ARCHIVED"
                    active_plan.archived_at = datetime.utcnow()
                    replaced_count += 1

            cloned_plan = DietPlan(
                name=f"{source_plan.name} - {member.full_name}",
                description=source_plan.description,
                content=source_plan.content,
                content_structured=source_plan.content_structured,
                creator_id=current_user.id,
                member_id=member.id,
                is_template=False,
                status="PUBLISHED",
                version=1,
                parent_plan_id=source_plan.id,
                published_at=datetime.utcnow(),
            )
            db.add(cloned_plan)
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


@router.post("/diets/{diet_id}/publish", response_model=StandardResponse)
async def publish_diet_plan(
    diet_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.COACH]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    plan = await _get_diet_plan_or_404(db, diet_id)
    _ensure_diet_owned_by_requester_or_admin(plan, current_user, action="publish")
    if plan.status == "ARCHIVED":
        raise HTTPException(status_code=400, detail="Archived plans cannot be published")
    plan.status = "PUBLISHED"
    plan.published_at = datetime.utcnow()
    await db.commit()
    return StandardResponse(message="Diet plan published", data={"id": str(plan.id)})


@router.post("/diets/{diet_id}/archive", response_model=StandardResponse)
async def archive_diet_plan(
    diet_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.COACH]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    plan = await _get_diet_plan_or_404(db, diet_id)
    _ensure_diet_owned_by_requester_or_admin(plan, current_user, action="archive")
    plan.status = "ARCHIVED"
    plan.archived_at = datetime.utcnow()
    await db.commit()
    return StandardResponse(message="Diet plan archived", data={"id": str(plan.id)})


@router.post("/diets/{diet_id}/fork-draft", response_model=StandardResponse)
async def fork_diet_plan_as_draft(
    diet_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.COACH]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    source_plan = await _get_diet_plan_or_404(db, diet_id)
    _ensure_diet_owned_by_requester_or_admin(source_plan, current_user, action="fork")
    draft = DietPlan(
        name=f"{source_plan.name} (Draft)",
        description=source_plan.description,
        content=source_plan.content,
        content_structured=source_plan.content_structured,
        creator_id=current_user.id,
        member_id=source_plan.member_id,
        is_template=source_plan.is_template,
        status="DRAFT",
        version=(source_plan.version or 1) + 1,
        parent_plan_id=source_plan.id,
    )
    db.add(draft)
    await db.commit()
    return StandardResponse(message="Diet draft fork created", data={"id": str(draft.id)})


@router.get("/diet-summaries", response_model=StandardResponse[List[DietPlanSummaryResponse]])
async def list_diet_summaries(
    current_user: Annotated[User, Depends(dependencies.require_active_customer_subscription)],
    db: Annotated[AsyncSession, Depends(get_db)],
    include_archived: bool = Query(False),
    include_all_creators: bool = Query(False),
    creator_id: uuid.UUID | None = Query(default=None),
    templates_only: bool = Query(False),
):
    if not _is_admin_or_coach(current_user):
        raise HTTPException(status_code=403, detail="Only admin/manager/coach can access diet summaries")
    if (
        current_user.role in {Role.ADMIN, Role.MANAGER}
        and include_all_creators
    ):
        stmt = select(DietPlan).order_by(DietPlan.name)
        if creator_id:
            stmt = stmt.where(DietPlan.creator_id == creator_id)
    else:
        stmt = select(DietPlan).where(DietPlan.creator_id == current_user.id)
    if templates_only:
        stmt = stmt.where(DietPlan.member_id.is_(None))
    if not include_archived:
        stmt = stmt.where(DietPlan.status != "ARCHIVED")
    stmt = stmt.order_by(DietPlan.name)
    result = await db.execute(stmt)
    plans = result.scalars().all()
    return StandardResponse(data=[_build_diet_summary(plan) for plan in plans])


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
    item = await _get_diet_library_item_or_404(db, current_user=current_user, item_id=item_id)
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
    item = await _get_diet_library_item_or_404(db, current_user=current_user, item_id=item_id)
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
    item = await _get_diet_library_item_or_404(db, current_user=current_user, item_id=item_id)
    if not (item.is_global or item.owner_coach_id == current_user.id):
        raise HTTPException(status_code=403, detail="Not allowed to use this diet library item")

    plan = DietPlan(
        name=item.name,
        description=item.description,
        content=item.content,
        content_structured=None,
        creator_id=current_user.id,
        member_id=None,
        status="DRAFT",
        version=1,
        is_template=False,
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
    diet_plan_name: str | None = None
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
    is_pr: bool = False
    pr_type: str | None = None
    pr_value: str | None = None
    pr_notes: str | None = None
    set_details: list[WorkoutSetDetail] = Field(default_factory=list)
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
    rpe: int | None = Field(None, ge=1, le=10)
    pain_level: int | None = Field(None, ge=0, le=10)
    effort_feedback: Literal["TOO_EASY", "JUST_RIGHT", "TOO_HARD"] | None = None
    attachment_url: str | None = None
    attachment_mime: str | None = None
    attachment_size_bytes: int | None = Field(None, ge=0)
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
    is_pr: bool
    pr_type: str | None
    pr_value: str | None
    pr_notes: str | None
    skipped: bool = False
    set_details: list[WorkoutSetDetail] = Field(default_factory=list)
    order: int

    @field_validator("set_details", mode="before")
    @classmethod
    def parse_response_set_details(cls, value: Any) -> list[dict[str, Any]]:
        if isinstance(value, str) or value is None:
            return _parse_set_details(value)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
        return []

    class Config:
        from_attributes = True


class WorkoutSessionResponse(BaseModel):
    id: uuid.UUID
    member_id: uuid.UUID
    plan_id: uuid.UUID
    performed_at: datetime
    duration_minutes: int | None
    notes: str | None
    rpe: int | None = None
    pain_level: int | None = None
    effort_feedback: str | None = None
    attachment_url: str | None = None
    attachment_mime: str | None = None
    attachment_size_bytes: int | None = None
    review_status: str = "UNREVIEWED"
    reviewed_at: datetime | None = None
    reviewed_by_user_id: uuid.UUID | None = None
    reviewer_note: str | None = None
    entries: List[WorkoutSessionEntryResponse] = Field(default_factory=list)

    class Config:
        from_attributes = True


class WorkoutSessionDraftEntryResponse(BaseModel):
    id: uuid.UUID
    workout_exercise_id: uuid.UUID | None = None
    exercise_id: uuid.UUID | None = None
    exercise_name: str | None = None
    section_name: str | None = None
    target_sets: int | None = None
    target_reps: int | None = None
    target_duration_minutes: int | None = None
    video_type: str | None = None
    video_url: str | None = None
    uploaded_video_url: str | None = None
    video_provider: str | None = None
    video_id: str | None = None
    embed_url: str | None = None
    playback_type: str | None = None
    sets_completed: int
    reps_completed: int
    weight_kg: float | None = None
    notes: str | None = None
    is_pr: bool
    pr_type: str | None = None
    pr_value: str | None = None
    pr_notes: str | None = None
    skipped: bool
    set_details: list[WorkoutSetDetail] = Field(default_factory=list)
    completed_at: datetime | None = None
    order: int

    @field_validator("set_details", mode="before")
    @classmethod
    def parse_draft_set_details(cls, value: Any) -> list[dict[str, Any]]:
        if isinstance(value, str) or value is None:
            return _parse_set_details(value)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
        return []

    class Config:
        from_attributes = True


class WorkoutSessionDraftResponse(BaseModel):
    id: uuid.UUID
    member_id: uuid.UUID
    plan_id: uuid.UUID
    section_name: str | None = None
    current_exercise_index: int
    started_at: datetime
    updated_at: datetime
    notes: str | None = None
    entries: list[WorkoutSessionDraftEntryResponse] = Field(default_factory=list)

    class Config:
        from_attributes = True


class StartWorkoutSessionRequest(BaseModel):
    plan_id: uuid.UUID
    section_name: str | None = None


class UpdateWorkoutSessionEntryRequest(BaseModel):
    sets_completed: int = Field(0, ge=0)
    reps_completed: int = Field(0, ge=0)
    weight_kg: float | None = Field(None, ge=0)
    notes: str | None = None
    is_pr: bool = False
    pr_type: str | None = None
    pr_value: str | None = None
    pr_notes: str | None = None
    set_details: list[WorkoutSetDetail] = Field(default_factory=list)


class SkipWorkoutExerciseRequest(BaseModel):
    notes: str | None = None


class FinishWorkoutSessionRequest(BaseModel):
    duration_minutes: int | None = Field(None, ge=1)
    notes: str | None = None
    rpe: int | None = Field(None, ge=1, le=10)
    pain_level: int | None = Field(None, ge=0, le=10)
    effort_feedback: Literal["TOO_EASY", "JUST_RIGHT", "TOO_HARD"] | None = None
    attachment_url: str | None = None
    attachment_mime: str | None = None
    attachment_size_bytes: int | None = Field(None, ge=0)


class UpdateWorkoutSessionLogRequest(BaseModel):
    duration_minutes: int | None = Field(None, ge=1)
    notes: str | None = None
    rpe: int | None = Field(None, ge=1, le=10)
    pain_level: int | None = Field(None, ge=0, le=10)
    effort_feedback: Literal["TOO_EASY", "JUST_RIGHT", "TOO_HARD"] | None = None
    attachment_url: str | None = None
    attachment_mime: str | None = None
    attachment_size_bytes: int | None = Field(None, ge=0)
    entries: list[WorkoutSessionEntryCreate] | None = None


class ReviewWorkoutSessionRequest(BaseModel):
    reviewed: bool = True
    reviewer_note: str | None = Field(None, max_length=1000)


@router.post("/log", response_model=StandardResponse)
async def log_workout(
    data: WorkoutLogCreate,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.CUSTOMER]))],
    _subscription_guard: Annotated[User, Depends(dependencies.require_active_customer_subscription)],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Customer logs workout feedback (difficulty, comment)."""
    plan = await _require_member_workout_plan(db, current_user, data.plan_id)

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
    _validate_workout_attachment_owner(data, current_user)

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
        rpe=data.rpe,
        pain_level=data.pain_level,
        effort_feedback=data.effort_feedback,
        attachment_url=data.attachment_url,
        attachment_mime=data.attachment_mime,
        attachment_size_bytes=data.attachment_size_bytes,
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
                is_pr=entry.is_pr,
                pr_type=entry.pr_type,
                pr_value=entry.pr_value,
                pr_notes=entry.pr_notes,
                skipped=False,
                set_details=_serialize_validated_set_details(entry.set_details),
                order=entry.order if entry.order else idx,
            )
        )

    await db.commit()
    return StandardResponse(message="Workout session logged", data={"id": str(session.id)})


@router.post("/workout-sessions/start", response_model=StandardResponse[WorkoutSessionDraftResponse])
async def start_workout_session(
    data: StartWorkoutSessionRequest,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.CUSTOMER]))],
    _subscription_guard: Annotated[User, Depends(dependencies.require_active_customer_subscription)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    async with _customer_tenant_scope(db, current_user):
        plan = await _require_member_workout_plan(db, current_user, data.plan_id)
        existing = await _get_active_draft_for_member(db, member_id=current_user.id)
        if existing:
            if existing.plan_id != plan.id:
                raise HTTPException(status_code=409, detail="Finish or abandon your active workout session before starting another plan")
            return StandardResponse(data=WorkoutSessionDraftResponse.model_validate(existing))

        plan_exercises = sorted(plan.exercises, key=lambda exercise: exercise.order)
        if data.section_name:
            section_name = data.section_name.strip()
            plan_exercises = [
                exercise for exercise in plan_exercises if (exercise.section_name or "").strip() == section_name
            ]
            if not plan_exercises:
                raise HTTPException(status_code=400, detail="Selected workout section was not found in this plan")

        if not plan_exercises:
            raise HTTPException(status_code=400, detail="This plan has no exercises to start")

        draft = WorkoutSessionDraft(
            member_id=current_user.id,
            plan_id=plan.id,
            section_name=data.section_name.strip() if data.section_name else None,
            current_exercise_index=0,
            started_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(draft)
        await db.flush()

        for idx, exercise in enumerate(plan_exercises):
            db.add(
                WorkoutSessionDraftEntry(
                    draft_id=draft.id,
                    workout_exercise_id=exercise.id,
                    exercise_id=exercise.exercise_id,
                    exercise_name=exercise.exercise_name or (exercise.exercise.name if exercise.exercise else None),
                    section_name=exercise.section_name,
                    target_sets=exercise.sets,
                    target_reps=exercise.reps,
                    target_duration_minutes=exercise.duration_minutes,
                    video_type=exercise.video_type,
                    video_url=exercise.video_url,
                    uploaded_video_url=exercise.uploaded_video_url,
                    video_provider=exercise.video_provider,
                    video_id=exercise.video_id,
                    embed_url=exercise.embed_url,
                    playback_type=exercise.playback_type,
                    order=idx,
                )
            )

        await db.commit()
        created = await _get_active_draft_for_member(db, member_id=current_user.id, plan_id=plan.id)
        assert created is not None
        return StandardResponse(data=WorkoutSessionDraftResponse.model_validate(created))


@router.get("/workout-sessions/active", response_model=StandardResponse[WorkoutSessionDraftResponse | None])
async def get_active_workout_session(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.CUSTOMER]))],
    _subscription_guard: Annotated[User, Depends(dependencies.require_active_customer_subscription)],
    db: Annotated[AsyncSession, Depends(get_db)],
    plan_id: uuid.UUID = Query(...),
):
    async with _customer_tenant_scope(db, current_user):
        await _require_member_workout_plan(db, current_user, plan_id)
        draft = await _get_active_draft_for_member(db, member_id=current_user.id, plan_id=plan_id)
        return StandardResponse(data=WorkoutSessionDraftResponse.model_validate(draft) if draft else None)


@router.put("/workout-sessions/{draft_id}/entries/{entry_id}", response_model=StandardResponse[WorkoutSessionDraftResponse])
async def update_workout_session_entry(
    draft_id: uuid.UUID,
    entry_id: uuid.UUID,
    data: UpdateWorkoutSessionEntryRequest,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.CUSTOMER]))],
    _subscription_guard: Annotated[User, Depends(dependencies.require_active_customer_subscription)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    async with _customer_tenant_scope(db, current_user):
        stmt = (
            select(WorkoutSessionDraft)
            .where(WorkoutSessionDraft.id == draft_id)
            .options(selectinload(WorkoutSessionDraft.entries))
        )
        draft = (await db.execute(stmt)).scalar_one_or_none()
        if not draft:
            raise HTTPException(status_code=404, detail="Workout session draft not found")
        if current_user.role == Role.CUSTOMER and draft.member_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")

        draft.entries.sort(key=lambda entry: entry.order)
        current_index = _active_entry_index(draft.entries)
        if current_index >= len(draft.entries):
            raise HTTPException(status_code=400, detail="This workout session is already complete")

        current_entry = draft.entries[current_index]
        if current_entry.id != entry_id:
            raise HTTPException(status_code=400, detail="Exercises must be logged in order")

        current_entry.sets_completed = data.sets_completed
        current_entry.reps_completed = data.reps_completed
        current_entry.weight_kg = data.weight_kg
        current_entry.notes = data.notes
        current_entry.is_pr = data.is_pr
        current_entry.pr_type = data.pr_type
        current_entry.pr_value = data.pr_value
        current_entry.pr_notes = data.pr_notes
        current_entry.set_details = _serialize_validated_set_details(data.set_details)
        current_entry.skipped = False
        current_entry.completed_at = datetime.utcnow()
        draft.updated_at = datetime.utcnow()
        draft.current_exercise_index = _active_entry_index(draft.entries)
        await db.commit()
        await db.refresh(draft, attribute_names=["entries"])
        draft.entries.sort(key=lambda entry: entry.order)
        draft.current_exercise_index = _active_entry_index(draft.entries)
        return StandardResponse(data=WorkoutSessionDraftResponse.model_validate(draft))


@router.post("/workout-sessions/{draft_id}/entries/{entry_id}/skip", response_model=StandardResponse[WorkoutSessionDraftResponse])
async def skip_workout_session_entry(
    draft_id: uuid.UUID,
    entry_id: uuid.UUID,
    data: SkipWorkoutExerciseRequest,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.CUSTOMER]))],
    _subscription_guard: Annotated[User, Depends(dependencies.require_active_customer_subscription)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    stmt = (
        select(WorkoutSessionDraft)
        .where(WorkoutSessionDraft.id == draft_id)
        .options(selectinload(WorkoutSessionDraft.entries))
    )
    draft = (await db.execute(stmt)).scalar_one_or_none()
    if not draft:
        raise HTTPException(status_code=404, detail="Workout session draft not found")
    if current_user.role == Role.CUSTOMER and draft.member_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    _validate_workout_attachment_owner(data, current_user)

    draft.entries.sort(key=lambda entry: entry.order)
    current_index = _active_entry_index(draft.entries)
    if current_index >= len(draft.entries):
        raise HTTPException(status_code=400, detail="This workout session is already complete")

    current_entry = draft.entries[current_index]
    if current_entry.id != entry_id:
        raise HTTPException(status_code=400, detail="Exercises must be skipped in order")

    current_entry.skipped = True
    current_entry.notes = data.notes
    current_entry.completed_at = datetime.utcnow()
    current_entry.is_pr = False
    current_entry.pr_type = None
    current_entry.pr_value = None
    current_entry.pr_notes = None
    current_entry.set_details = None
    draft.updated_at = datetime.utcnow()
    draft.current_exercise_index = _active_entry_index(draft.entries)
    await db.commit()
    await db.refresh(draft, attribute_names=["entries"])
    draft.entries.sort(key=lambda entry: entry.order)
    draft.current_exercise_index = _active_entry_index(draft.entries)
    return StandardResponse(data=WorkoutSessionDraftResponse.model_validate(draft))


@router.post("/workout-sessions/{draft_id}/previous", response_model=StandardResponse[WorkoutSessionDraftResponse])
async def rewind_workout_session_entry(
    draft_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.CUSTOMER]))],
    _subscription_guard: Annotated[User, Depends(dependencies.require_active_customer_subscription)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    async with _customer_tenant_scope(db, current_user):
        stmt = (
            select(WorkoutSessionDraft)
            .where(WorkoutSessionDraft.id == draft_id)
            .options(selectinload(WorkoutSessionDraft.entries))
        )
        draft = (await db.execute(stmt)).scalar_one_or_none()
        if not draft:
            raise HTTPException(status_code=404, detail="Workout session draft not found")
        if current_user.role == Role.CUSTOMER and draft.member_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")

        draft.entries.sort(key=lambda entry: entry.order)
        current_index = _active_entry_index(draft.entries)
        previous_index = min(current_index - 1, len(draft.entries) - 1)
        if previous_index < 0:
            raise HTTPException(status_code=400, detail="No previous exercise to edit")

        previous_entry = draft.entries[previous_index]
        previous_entry.sets_completed = 0
        previous_entry.reps_completed = 0
        previous_entry.weight_kg = None
        previous_entry.notes = None
        previous_entry.is_pr = False
        previous_entry.pr_type = None
        previous_entry.pr_value = None
        previous_entry.pr_notes = None
        previous_entry.skipped = False
        previous_entry.set_details = None
        previous_entry.completed_at = None
        draft.updated_at = datetime.utcnow()
        draft.current_exercise_index = previous_index
        await db.commit()
        await db.refresh(draft, attribute_names=["entries"])
        draft.entries.sort(key=lambda entry: entry.order)
        draft.current_exercise_index = _active_entry_index(draft.entries)
        return StandardResponse(data=WorkoutSessionDraftResponse.model_validate(draft))


@router.post("/workout-sessions/{draft_id}/finish", response_model=StandardResponse[WorkoutSessionResponse])
async def finish_workout_session(
    draft_id: uuid.UUID,
    data: FinishWorkoutSessionRequest,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.CUSTOMER]))],
    _subscription_guard: Annotated[User, Depends(dependencies.require_active_customer_subscription)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    async with _customer_tenant_scope(db, current_user):
        stmt = (
            select(WorkoutSessionDraft)
            .where(WorkoutSessionDraft.id == draft_id)
            .options(selectinload(WorkoutSessionDraft.entries))
        )
        draft = (await db.execute(stmt)).scalar_one_or_none()
        if not draft:
            raise HTTPException(status_code=404, detail="Workout session draft not found")
        if current_user.role == Role.CUSTOMER and draft.member_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")

        draft.entries.sort(key=lambda entry: entry.order)
        session = WorkoutSession(
            member_id=draft.member_id,
            plan_id=draft.plan_id,
            performed_at=datetime.utcnow(),
            duration_minutes=data.duration_minutes,
            notes=data.notes if data.notes is not None else draft.notes,
            rpe=data.rpe,
            pain_level=data.pain_level,
            effort_feedback=data.effort_feedback,
            attachment_url=data.attachment_url,
            attachment_mime=data.attachment_mime,
            attachment_size_bytes=data.attachment_size_bytes,
        )
        db.add(session)
        await db.flush()

        for entry in draft.entries:
            db.add(
                WorkoutSessionEntry(
                    session_id=session.id,
                    exercise_id=entry.exercise_id,
                    exercise_name=entry.exercise_name,
                    target_sets=entry.target_sets,
                    target_reps=entry.target_reps,
                    sets_completed=entry.sets_completed,
                    reps_completed=entry.reps_completed,
                    weight_kg=entry.weight_kg,
                    notes=entry.notes,
                    is_pr=entry.is_pr,
                    pr_type=entry.pr_type,
                    pr_value=entry.pr_value,
                    pr_notes=entry.pr_notes,
                    skipped=entry.skipped,
                    set_details=entry.set_details,
                    order=entry.order,
                )
            )

        await db.delete(draft)
        await db.commit()
        session_stmt = select(WorkoutSession).where(WorkoutSession.id == session.id).options(selectinload(WorkoutSession.entries))
        saved = (await db.execute(session_stmt)).scalar_one()
        return StandardResponse(data=WorkoutSessionResponse.model_validate(saved))


@router.delete("/workout-sessions/{draft_id}", response_model=StandardResponse)
async def abandon_workout_session(
    draft_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.CUSTOMER]))],
    _subscription_guard: Annotated[User, Depends(dependencies.require_active_customer_subscription)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    draft = (
        await db.execute(
            select(WorkoutSessionDraft).where(
                WorkoutSessionDraft.id == draft_id,
                WorkoutSessionDraft.gym_id == current_user.gym_id,
            )
        )
    ).scalar_one_or_none()
    if not draft:
        raise HTTPException(status_code=404, detail="Workout session draft not found")
    if current_user.role == Role.CUSTOMER and draft.member_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    await db.delete(draft)
    await db.commit()
    return StandardResponse(message="Workout session discarded")


@router.put("/session-logs/{session_id}", response_model=StandardResponse[WorkoutSessionResponse])
async def update_completed_workout_session(
    session_id: uuid.UUID,
    data: UpdateWorkoutSessionLogRequest,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.CUSTOMER]))],
    _subscription_guard: Annotated[User, Depends(dependencies.require_active_customer_subscription)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    async with _customer_tenant_scope(db, current_user):
        stmt = select(WorkoutSession).where(WorkoutSession.id == session_id).options(selectinload(WorkoutSession.entries))
        session = (await db.execute(stmt)).scalar_one_or_none()
        if not session:
            raise HTTPException(status_code=404, detail="Workout session not found")
        if current_user.role == Role.CUSTOMER:
            if session.member_id != current_user.id:
                raise HTTPException(status_code=403, detail="Access denied")
            if datetime.utcnow() - session.performed_at > timedelta(days=1):
                raise HTTPException(status_code=400, detail="Completed sessions can only be edited on the same day")

        _validate_workout_attachment_owner(data, current_user)
        session.duration_minutes = data.duration_minutes
        session.notes = data.notes
        session.rpe = data.rpe
        session.pain_level = data.pain_level
        session.effort_feedback = data.effort_feedback
        session.attachment_url = data.attachment_url
        session.attachment_mime = data.attachment_mime
        session.attachment_size_bytes = data.attachment_size_bytes
        session.review_status = "UNREVIEWED"
        session.reviewed_at = None
        session.reviewed_by_user_id = None
        session.reviewer_note = None

        if data.entries is not None:
            for entry in list(session.entries):
                await db.delete(entry)
            await db.flush()
            for idx, entry in enumerate(data.entries):
                db.add(
                    WorkoutSessionEntry(
                        session_id=session.id,
                        exercise_id=entry.exercise_id,
                        exercise_name=entry.exercise_name,
                        target_sets=entry.target_sets,
                        target_reps=entry.target_reps,
                        sets_completed=entry.sets_completed,
                        reps_completed=entry.reps_completed,
                        weight_kg=entry.weight_kg,
                        notes=entry.notes,
                        is_pr=entry.is_pr,
                        pr_type=entry.pr_type,
                        pr_value=entry.pr_value,
                        pr_notes=entry.pr_notes,
                        skipped=False,
                        set_details=_serialize_validated_set_details(entry.set_details),
                        order=entry.order if entry.order else idx,
                    )
                )

        await db.commit()
        saved = (await db.execute(stmt)).scalar_one()
        saved.entries.sort(key=lambda entry: entry.order)
        return StandardResponse(data=WorkoutSessionResponse.model_validate(saved))


@router.post("/session-logs/{session_id}/review", response_model=StandardResponse[WorkoutSessionResponse])
async def review_workout_session(
    session_id: uuid.UUID,
    data: ReviewWorkoutSessionRequest,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.COACH]))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    stmt = (
        select(WorkoutSession)
        .join(WorkoutPlan, WorkoutPlan.id == WorkoutSession.plan_id)
        .where(WorkoutSession.id == session_id)
        .options(selectinload(WorkoutSession.entries))
    )
    session = (await db.execute(stmt)).scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Workout session not found")
    plan = await _get_workout_plan_or_404(db, session.plan_id, gym_id=current_user.gym_id)
    if current_user.role == Role.COACH and plan and plan.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Cannot review sessions for plans created by another coach")

    if data.reviewed:
        session.review_status = "REVIEWED"
        session.reviewed_at = datetime.utcnow()
        session.reviewed_by_user_id = current_user.id
        session.reviewer_note = data.reviewer_note
    else:
        session.review_status = "UNREVIEWED"
        session.reviewed_at = None
        session.reviewed_by_user_id = None
        session.reviewer_note = data.reviewer_note

    await db.commit()
    await db.refresh(session, attribute_names=["entries"])
    session.entries.sort(key=lambda entry: entry.order)
    return StandardResponse(data=WorkoutSessionResponse.model_validate(session))


@router.get("/diets/{diet_id}/tracking", response_model=StandardResponse[MemberDietTrackerResponse])
async def get_member_diet_tracking(
    diet_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.CUSTOMER]))],
    _subscription_guard: Annotated[User, Depends(dependencies.require_active_customer_subscription)],
    db: Annotated[AsyncSession, Depends(get_db)],
    tracked_for: date | None = Query(None),
):
    async with _customer_tenant_scope(db, current_user):
        plan = await _require_member_diet_plan(db, current_user, diet_id)
        tracked_date = tracked_for or date.today()
        tracking_day = await _get_member_diet_tracking_day(
            db,
            member_id=current_user.id,
            diet_id=diet_id,
            tracked_for=tracked_date,
        )
        return StandardResponse(data=_build_tracker_payload(plan, tracking_day))


@router.post("/diets/{diet_id}/tracking/start", response_model=StandardResponse[MemberDietTrackerResponse])
async def start_member_diet_tracking_day(
    diet_id: uuid.UUID,
    data: MemberDietTrackingStartRequest,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.CUSTOMER]))],
    _subscription_guard: Annotated[User, Depends(dependencies.require_active_customer_subscription)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    async with _customer_tenant_scope(db, current_user):
        plan = await _require_member_diet_plan(db, current_user, diet_id)
        day_id = _normalize_day_id(data.day_id)
        selected_day = _diet_day_or_400(plan, day_id)
        tracking_day = await _get_or_create_member_diet_tracking_day(
            db,
            member_id=current_user.id,
            diet_id=diet_id,
            tracked_for=data.tracked_for,
        )
        tracking_day.active_day_id = day_id
        tracking_day.current_meal_index = _diet_first_pending_meal_index(selected_day, tracking_day)
        tracking_day.updated_at = datetime.utcnow()
        await db.commit()
        refreshed = await _get_member_diet_tracking_day(
            db,
            member_id=current_user.id,
            diet_id=diet_id,
            tracked_for=data.tracked_for,
        )
        return StandardResponse(data=_build_tracker_payload(plan, refreshed))


@router.put("/diets/{diet_id}/tracking/days/{day_id}/meals/{meal_id}", response_model=StandardResponse[MemberDietTrackerResponse])
async def complete_member_diet_tracking_meal(
    diet_id: uuid.UUID,
    day_id: str,
    meal_id: str,
    data: MemberDietTrackingMealProgressRequest,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.CUSTOMER]))],
    _subscription_guard: Annotated[User, Depends(dependencies.require_active_customer_subscription)],
    db: Annotated[AsyncSession, Depends(get_db)],
    tracked_for: date | None = Query(None),
):
    async with _customer_tenant_scope(db, current_user):
        plan = await _require_member_diet_plan(db, current_user, diet_id)
        tracked_date = tracked_for or date.today()
        day_id = _normalize_day_id(day_id)
        meal_id = meal_id.strip()
        if not meal_id:
            raise HTTPException(status_code=400, detail="Meal id is required")

        selected_day = _diet_day_or_400(plan, day_id)
        _diet_meal_index_or_400(selected_day, meal_id)
        tracking_day = await _get_member_diet_tracking_day(
            db,
            member_id=current_user.id,
            diet_id=diet_id,
            tracked_for=tracked_date,
        )
        if tracking_day is None:
            raise HTTPException(status_code=400, detail="Start a diet day before logging meals")
        _diet_tracking_requires_active_day(day_id, tracking_day)
        expected = _diet_expected_meal_or_400(selected_day, tracking_day)
        if expected["id"] != meal_id:
            raise HTTPException(status_code=400, detail="Meals must be logged in order")

        meal_row = _upsert_tracking_meal_row(tracking_day, meal_id, expected["name"])
        meal_row.completed = True
        meal_row.skipped = False
        meal_row.note = data.note
        meal_row.updated_at = datetime.utcnow()
        tracking_day.current_meal_index = min(tracking_day.current_meal_index + 1, len(selected_day["meals"]))
        tracking_day.updated_at = datetime.utcnow()

        await db.commit()
        refreshed = await _get_member_diet_tracking_day(
            db,
            member_id=current_user.id,
            diet_id=diet_id,
            tracked_for=tracked_date,
        )
        return StandardResponse(data=_build_tracker_payload(plan, refreshed))


@router.post("/diets/{diet_id}/tracking/days/{day_id}/meals/{meal_id}/skip", response_model=StandardResponse[MemberDietTrackerResponse])
async def skip_member_diet_tracking_meal(
    diet_id: uuid.UUID,
    day_id: str,
    meal_id: str,
    data: MemberDietTrackingMealProgressRequest,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.CUSTOMER]))],
    _subscription_guard: Annotated[User, Depends(dependencies.require_active_customer_subscription)],
    db: Annotated[AsyncSession, Depends(get_db)],
    tracked_for: date | None = Query(None),
):
    async with _customer_tenant_scope(db, current_user):
        plan = await _require_member_diet_plan(db, current_user, diet_id)
        tracked_date = tracked_for or date.today()
        day_id = _normalize_day_id(day_id)
        meal_id = meal_id.strip()
        if not meal_id:
            raise HTTPException(status_code=400, detail="Meal id is required")

        selected_day = _diet_day_or_400(plan, day_id)
        _diet_meal_index_or_400(selected_day, meal_id)
        tracking_day = await _get_member_diet_tracking_day(
            db,
            member_id=current_user.id,
            diet_id=diet_id,
            tracked_for=tracked_date,
        )
        if tracking_day is None:
            raise HTTPException(status_code=400, detail="Start a diet day before logging meals")
        _diet_tracking_requires_active_day(day_id, tracking_day)
        expected = _diet_expected_meal_or_400(selected_day, tracking_day)
        if expected["id"] != meal_id:
            raise HTTPException(status_code=400, detail="Meals must be skipped in order")

        meal_row = _upsert_tracking_meal_row(tracking_day, meal_id, expected["name"])
        meal_row.completed = False
        meal_row.skipped = True
        meal_row.note = data.note
        meal_row.updated_at = datetime.utcnow()
        tracking_day.current_meal_index = min(tracking_day.current_meal_index + 1, len(selected_day["meals"]))
        tracking_day.updated_at = datetime.utcnow()

        await db.commit()
        refreshed = await _get_member_diet_tracking_day(
            db,
            member_id=current_user.id,
            diet_id=diet_id,
            tracked_for=tracked_date,
        )
        return StandardResponse(data=_build_tracker_payload(plan, refreshed))


@router.post("/diets/{diet_id}/tracking/days/{day_id}/previous", response_model=StandardResponse[MemberDietTrackerResponse])
async def previous_member_diet_tracking_meal(
    diet_id: uuid.UUID,
    day_id: str,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.CUSTOMER]))],
    _subscription_guard: Annotated[User, Depends(dependencies.require_active_customer_subscription)],
    db: Annotated[AsyncSession, Depends(get_db)],
    tracked_for: date | None = Query(None),
):
    async with _customer_tenant_scope(db, current_user):
        plan = await _require_member_diet_plan(db, current_user, diet_id)
        tracked_date = tracked_for or date.today()
        day_id = _normalize_day_id(day_id)
        selected_day = _diet_day_or_400(plan, day_id)
        tracking_day = await _get_member_diet_tracking_day(
            db,
            member_id=current_user.id,
            diet_id=diet_id,
            tracked_for=tracked_date,
        )
        if tracking_day is None:
            raise HTTPException(status_code=400, detail="Start a diet day before logging meals")
        _diet_tracking_requires_active_day(day_id, tracking_day)
        if tracking_day.current_meal_index <= 0:
            raise HTTPException(status_code=400, detail="No previous meal to edit")

        previous_index = tracking_day.current_meal_index - 1
        previous_meal = selected_day["meals"][previous_index]
        meal_row = _upsert_tracking_meal_row(tracking_day, previous_meal["id"], previous_meal["name"])
        meal_row.completed = False
        meal_row.skipped = False
        meal_row.note = None
        meal_row.updated_at = datetime.utcnow()
        tracking_day.current_meal_index = previous_index
        tracking_day.updated_at = datetime.utcnow()

        await db.commit()
        refreshed = await _get_member_diet_tracking_day(
            db,
            member_id=current_user.id,
            diet_id=diet_id,
            tracked_for=tracked_date,
        )
        return StandardResponse(data=_build_tracker_payload(plan, refreshed))


@router.put("/diets/{diet_id}/tracking", response_model=StandardResponse[MemberDietTrackerResponse])
async def upsert_member_diet_tracking(
    diet_id: uuid.UUID,
    data: MemberDietTrackingDayUpsert,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.CUSTOMER]))],
    _subscription_guard: Annotated[User, Depends(dependencies.require_active_customer_subscription)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    async with _customer_tenant_scope(db, current_user):
        plan = await _require_member_diet_plan(db, current_user, diet_id)
        tracking_day = await _get_or_create_member_diet_tracking_day(
            db,
            member_id=current_user.id,
            diet_id=diet_id,
            tracked_for=data.tracked_for,
        )
        tracking_day.adherence_rating = data.adherence_rating
        tracking_day.notes = data.notes
        tracking_day.updated_at = datetime.utcnow()

        for meal_update in data.meals:
            if not tracking_day.active_day_id:
                raise HTTPException(status_code=400, detail="Start a diet day before logging meals")
            selected_day = _diet_day_or_400(plan, tracking_day.active_day_id)
            _diet_meal_index_or_400(selected_day, meal_update.meal_id)
            expected = _diet_expected_meal_or_400(selected_day, tracking_day)
            if expected["id"] != meal_update.meal_id:
                raise HTTPException(status_code=400, detail="Meals must be logged in order")

            meal = _upsert_tracking_meal_row(tracking_day, meal_update.meal_id, expected["name"])
            meal.completed = meal_update.completed
            meal.skipped = not meal_update.completed
            meal.note = meal_update.note
            meal.updated_at = datetime.utcnow()
            tracking_day.current_meal_index = min(tracking_day.current_meal_index + 1, len(selected_day["meals"]))

        await db.commit()
        refreshed_day = await _get_member_diet_tracking_day(
            db,
            member_id=current_user.id,
            diet_id=diet_id,
            tracked_for=data.tracked_for,
        )
        return StandardResponse(data=_build_tracker_payload(plan, refreshed_day))


@router.get("/diets/{diet_id}/tracking/history", response_model=StandardResponse[list[MemberDietTrackingDayResponse]])
async def list_member_diet_tracking_history(
    diet_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.CUSTOMER]))],
    _subscription_guard: Annotated[User, Depends(dependencies.require_active_customer_subscription)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(14, ge=1, le=90),
):
    async with _customer_tenant_scope(db, current_user):
        await _require_member_diet_plan(db, current_user, diet_id)
        stmt = (
            select(MemberDietTrackingDay)
            .where(
                MemberDietTrackingDay.member_id == current_user.id,
                MemberDietTrackingDay.diet_plan_id == diet_id,
            )
            .options(selectinload(MemberDietTrackingDay.meals))
            .order_by(MemberDietTrackingDay.tracked_for.desc())
            .limit(limit)
        )
        rows = (await db.execute(stmt)).scalars().all()
        serialized = [_serialize_tracking_day(row) for row in rows]
        return StandardResponse(data=[row for row in serialized if row is not None])


@router.post("/diet-feedback", response_model=StandardResponse)
async def create_diet_feedback(
    data: DietFeedbackCreate,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.CUSTOMER]))],
    _subscription_guard: Annotated[User, Depends(dependencies.require_active_customer_subscription)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    async with _customer_tenant_scope(db, current_user):
        diet_plan = await _require_member_diet_plan(db, current_user, data.diet_plan_id)

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
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.MANAGER, Role.COACH]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    diet_plan_id: uuid.UUID | None = Query(None),
    member_id: uuid.UUID | None = Query(None),
    min_rating: int | None = Query(None, ge=1, le=5),
    from_date: datetime | None = Query(None),
    to_date: datetime | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    stmt = select(DietFeedback, DietPlan.name).join(DietPlan, DietFeedback.diet_plan_id == DietPlan.id)
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
    rows = result.all()
    data: list[DietFeedbackResponse] = []
    for feedback, diet_name in rows:
        payload = DietFeedbackResponse.model_validate(feedback).model_dump()
        payload["diet_plan_name"] = diet_name
        data.append(DietFeedbackResponse(**payload))
    return StandardResponse(data=data)


@router.post("/gym-feedback", response_model=StandardResponse)
async def create_gym_feedback(
    data: GymFeedbackCreate,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.CUSTOMER]))],
    _subscription_guard: Annotated[User, Depends(dependencies.require_active_customer_subscription)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    async with _customer_tenant_scope(db, current_user):
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
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN, Role.MANAGER, Role.COACH]))],
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
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
):
    """Get current user's per-session workout logs."""
    stmt = (
        select(WorkoutSession)
        .where(WorkoutSession.member_id == current_user.id)
        .options(selectinload(WorkoutSession.entries))
    )
    if plan_id:
        stmt = stmt.where(WorkoutSession.plan_id == plan_id)
    from_date_dt = datetime.combine(from_date, time.min) if from_date else None
    to_date_dt = datetime.combine(to_date, time.max) if to_date else None
    stmt = _apply_date_filters(stmt, WorkoutSession.performed_at, from_date_dt, to_date_dt)
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
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
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
    from_date_dt = datetime.combine(from_date, time.min) if from_date else None
    to_date_dt = datetime.combine(to_date, time.max) if to_date else None
    stmt = _apply_date_filters(stmt, WorkoutSession.performed_at, from_date_dt, to_date_dt)
    stmt = stmt.order_by(WorkoutSession.performed_at.desc()).offset(offset).limit(limit)
    result = await db.execute(stmt)
    sessions = result.scalars().all()
    return StandardResponse(data=[WorkoutSessionResponse.model_validate(session) for session in sessions])

@router.get("/stats", response_model=StandardResponse)
async def get_workout_stats(
    current_user: Annotated[User, Depends(dependencies.require_active_customer_subscription)],
    db: Annotated[AsyncSession, Depends(get_db)],
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
):
    """Get aggregated workout stats for the current user (e.g., workouts per day over last 30 days)."""
    if from_date and to_date and from_date > to_date:
        raise HTTPException(status_code=400, detail="from_date must be on or before to_date")

    from_date_dt = datetime.combine(from_date, time.min) if from_date else datetime.now() - timedelta(days=30)
    to_date_dt = datetime.combine(to_date, time.max) if to_date else None

    stmt = (
        select(func.date(WorkoutSession.performed_at).label('day'), func.count(WorkoutSession.id).label('count'))
        .where(WorkoutSession.member_id == current_user.id)
        .where(WorkoutSession.performed_at >= from_date_dt)
        .group_by('day')
        .order_by('day')
    )
    if to_date_dt is not None:
        stmt = stmt.where(WorkoutSession.performed_at <= to_date_dt)
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
    async with _customer_tenant_scope(db, current_user):
        latest_stmt = (
            select(BiometricLog)
            .where(BiometricLog.member_id == current_user.id)
            .order_by(BiometricLog.date.desc())
            .limit(1)
        )
        latest = (await db.execute(latest_stmt)).scalar_one_or_none()
        payload = data.model_dump(exclude_unset=True)

        def _merged(metric: str) -> float | None:
            incoming = payload.get(metric, None)
            if incoming is not None:
                return incoming
            if latest is not None:
                return getattr(latest, metric)
            return None

        merged_height = _merged("height_cm")
        merged_weight = _merged("weight_kg")
        merged_body_fat = _merged("body_fat_pct")
        merged_muscle = _merged("muscle_mass_kg")

        if all(value is None for value in [merged_height, merged_weight, merged_body_fat, merged_muscle]):
            raise HTTPException(status_code=400, detail="At least one biometric metric is required")

        log = BiometricLog(
            member_id=current_user.id,
            height_cm=merged_height,
            weight_kg=merged_weight,
            body_fat_pct=merged_body_fat,
            muscle_mass_kg=merged_muscle,
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
    async with _customer_tenant_scope(db, current_user):
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
