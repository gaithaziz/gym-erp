from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import dependencies
from app.core.responses import StandardResponse
from app.database import get_db
from app.models.coaching import CoachingPackage, CoachingPackageLedger
from app.models.enums import Role
from app.models.user import User

router = APIRouter()


class CoachingPackagePayload(BaseModel):
    user_id: uuid.UUID
    coach_id: uuid.UUID | None = None
    package_key: str = Field(min_length=2, max_length=120)
    package_label: str = Field(min_length=2, max_length=255)
    total_sessions: int = Field(ge=0, le=9999)
    start_date: datetime | None = None
    end_date: datetime | None = None
    note: str | None = Field(default=None, max_length=2000)


class CoachingPackageUpdatePayload(BaseModel):
    coach_id: uuid.UUID | None = None
    package_label: str | None = Field(default=None, min_length=2, max_length=255)
    total_sessions: int | None = Field(default=None, ge=0, le=9999)
    used_sessions: int | None = Field(default=None, ge=0, le=9999)
    start_date: datetime | None = None
    end_date: datetime | None = None
    note: str | None = Field(default=None, max_length=2000)
    is_active: bool | None = None


class CoachingPackageUsePayload(BaseModel):
    used_sessions: int = Field(default=1, ge=1, le=9999)
    note: str | None = Field(default=None, max_length=2000)


def _package_to_payload(package: CoachingPackage, *, member_name: str | None = None, coach_name: str | None = None) -> dict[str, Any]:
    remaining = max(0, int(package.total_sessions) - int(package.used_sessions))
    return {
        "id": str(package.id),
        "user_id": str(package.user_id),
        "coach_id": str(package.coach_id) if package.coach_id else None,
        "coach_name": coach_name if coach_name is not None else (package.coach.full_name if package.coach else None),
        "member_name": member_name if member_name is not None else (package.user.full_name if package.user else None),
        "package_key": package.package_key,
        "package_label": package.package_label,
        "total_sessions": int(package.total_sessions),
        "used_sessions": int(package.used_sessions),
        "remaining_sessions": remaining,
        "start_date": package.start_date.isoformat() if package.start_date else None,
        "end_date": package.end_date.isoformat() if package.end_date else None,
        "note": package.note,
        "is_active": package.is_active,
        "updated_at": package.updated_at.isoformat() if package.updated_at else None,
    }


async def _package_name_map(db: AsyncSession, packages: list[CoachingPackage]) -> dict[uuid.UUID, str | None]:
    user_ids = {pkg.user_id for pkg in packages} | {pkg.coach_id for pkg in packages if pkg.coach_id is not None}
    if not user_ids:
        return {}
    result = await db.execute(
        select(User.id, User.full_name).where(User.id.in_(list(user_ids)))
    )
    return {row.id: row.full_name for row in result.all()}


async def _get_package_or_404(db: AsyncSession, package_id: uuid.UUID, gym_id: uuid.UUID) -> CoachingPackage:
    result = await db.execute(
        select(CoachingPackage)
        .where(
            CoachingPackage.id == package_id,
            CoachingPackage.gym_id == gym_id,
        )
        .options(selectinload(CoachingPackage.user), selectinload(CoachingPackage.coach))
    )
    package = result.scalar_one_or_none()
    if package is None:
        raise HTTPException(status_code=404, detail="Coaching package not found")
    return package


@router.get("/packages", response_model=StandardResponse)
async def list_packages(
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    member_id: uuid.UUID | None = Query(default=None),
    coach_id: uuid.UUID | None = Query(default=None),
):
    filters = [CoachingPackage.gym_id == current_user.gym_id]
    if current_user.role == Role.CUSTOMER:
        filters.append(CoachingPackage.user_id == current_user.id)
    elif current_user.role == Role.COACH and coach_id is None:
        filters.append(CoachingPackage.coach_id == current_user.id)
    else:
        if member_id is not None:
            filters.append(CoachingPackage.user_id == member_id)
        if coach_id is not None:
            filters.append(CoachingPackage.coach_id == coach_id)

    result = await db.execute(
        select(CoachingPackage)
        .where(*filters)
        .options(selectinload(CoachingPackage.user), selectinload(CoachingPackage.coach))
        .order_by(CoachingPackage.updated_at.desc())
    )
    packages = list(result.scalars().all())
    name_map = await _package_name_map(db, packages)
    distinct_members = {str(pkg.user_id) for pkg in packages}
    distinct_coaches = {str(pkg.coach_id) for pkg in packages if pkg.coach_id}
    return StandardResponse(data={
        "summary": {
            "total_packages": len(packages),
            "total_remaining": sum(max(0, pkg.total_sessions - pkg.used_sessions) for pkg in packages),
            "total_used": sum(max(0, pkg.used_sessions) for pkg in packages),
            "total_members": len(distinct_members),
            "total_coaches": len(distinct_coaches),
        },
        "packages": [
            _package_to_payload(
                package,
                member_name=name_map.get(package.user_id),
                coach_name=name_map.get(package.coach_id) if package.coach_id else None,
            )
            for package in packages
        ],
    })


@router.post("/packages", response_model=StandardResponse)
async def create_package(
    payload: CoachingPackagePayload,
    current_user: Annotated[User, Depends(dependencies.get_current_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    package = CoachingPackage(
        gym_id=current_user.gym_id,
        user_id=payload.user_id,
        coach_id=payload.coach_id,
        package_key=payload.package_key,
        package_label=payload.package_label,
        total_sessions=payload.total_sessions,
        used_sessions=0,
        start_date=payload.start_date,
        end_date=payload.end_date,
        note=payload.note,
        is_active=True,
    )
    db.add(package)
    await db.commit()
    await db.refresh(package)
    name_map = await _package_name_map(db, [package])
    return StandardResponse(data=_package_to_payload(
        package,
        member_name=name_map.get(package.user_id),
        coach_name=name_map.get(package.coach_id) if package.coach_id else None,
    ))


@router.patch("/packages/{package_id}", response_model=StandardResponse)
async def update_package(
    package_id: uuid.UUID,
    payload: CoachingPackageUpdatePayload,
    current_user: Annotated[User, Depends(dependencies.get_current_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    package = await _get_package_or_404(db, package_id, current_user.gym_id)
    if payload.coach_id is not None:
        package.coach_id = payload.coach_id
    if payload.package_label is not None:
        package.package_label = payload.package_label
    if payload.total_sessions is not None:
        package.total_sessions = payload.total_sessions
    if payload.used_sessions is not None:
        package.used_sessions = min(payload.used_sessions, package.total_sessions)
    if payload.start_date is not None:
        package.start_date = payload.start_date
    if payload.end_date is not None:
        package.end_date = payload.end_date
    if payload.note is not None:
        package.note = payload.note
    if payload.is_active is not None:
        package.is_active = payload.is_active
    await db.commit()
    await db.refresh(package)
    name_map = await _package_name_map(db, [package])
    return StandardResponse(data=_package_to_payload(
        package,
        member_name=name_map.get(package.user_id),
        coach_name=name_map.get(package.coach_id) if package.coach_id else None,
    ))


@router.post("/packages/{package_id}/use", response_model=StandardResponse)
async def use_package(
    package_id: uuid.UUID,
    payload: CoachingPackageUsePayload,
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    package = await _get_package_or_404(db, package_id, current_user.gym_id)
    if current_user.role == Role.CUSTOMER and package.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed to use this package")
    if current_user.role == Role.COACH and package.coach_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed to use this package")
    if not package.is_active:
        raise HTTPException(status_code=409, detail="Package is inactive")
    package.used_sessions = min(package.total_sessions, package.used_sessions + payload.used_sessions)
    ledger = CoachingPackageLedger(
        gym_id=current_user.gym_id,
        package_id=package.id,
        session_delta=-payload.used_sessions,
        note=payload.note,
        performed_by_user_id=current_user.id,
        performed_at=datetime.now(timezone.utc),
    )
    db.add(ledger)
    await db.commit()
    await db.refresh(package)
    name_map = await _package_name_map(db, [package])
    return StandardResponse(data=_package_to_payload(
        package,
        member_name=name_map.get(package.user_id),
        coach_name=name_map.get(package.coach_id) if package.coach_id else None,
    ))


@router.get("/packages/{package_id}/ledger", response_model=StandardResponse)
async def list_package_ledger(
    package_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    package = await _get_package_or_404(db, package_id, current_user.gym_id)
    if current_user.role == Role.CUSTOMER and package.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed to view this package")
    if current_user.role == Role.COACH and package.coach_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed to view this package")
    entries = (
        await db.execute(
            select(CoachingPackageLedger)
            .where(
                CoachingPackageLedger.package_id == package.id,
                CoachingPackageLedger.gym_id == current_user.gym_id,
            )
            .order_by(CoachingPackageLedger.performed_at.desc())
        )
    ).scalars().all()
    return StandardResponse(data={
        "package": _package_to_payload(package),
        "entries": [
            {
                "id": str(row.id),
                "session_delta": row.session_delta,
                "note": row.note,
                "performed_at": row.performed_at.isoformat() if row.performed_at else None,
                "performed_by_user_id": str(row.performed_by_user_id) if row.performed_by_user_id else None,
            }
            for row in entries
        ],
    })
