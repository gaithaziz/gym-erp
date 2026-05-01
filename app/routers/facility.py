from __future__ import annotations

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import dependencies
from app.core.responses import StandardResponse
from app.database import get_db
from app.models.facility import FacilityMachine, FacilitySection
from app.models.user import User

router = APIRouter()


class FacilityMachinePayload(BaseModel):
    machine_name: str = Field(min_length=2, max_length=255)
    accessories_summary: str | None = Field(default=None, max_length=5000)
    condition_notes: str | None = Field(default=None, max_length=5000)
    maintenance_notes: str | None = Field(default=None, max_length=5000)
    is_active: bool = True


class FacilitySectionPayload(BaseModel):
    section_key: str = Field(min_length=2, max_length=120)
    title: str = Field(min_length=2, max_length=255)
    body: str = Field(min_length=2, max_length=5000)
    sort_order: int = 0
    is_active: bool = True


def _machine_to_payload(row: FacilityMachine) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "branch_id": str(row.branch_id) if row.branch_id else None,
        "machine_name": row.machine_name,
        "accessories_summary": row.accessories_summary,
        "condition_notes": row.condition_notes,
        "maintenance_notes": row.maintenance_notes,
        "is_active": row.is_active,
        "updated_by_user_id": str(row.updated_by_user_id) if row.updated_by_user_id else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def _section_to_payload(row: FacilitySection) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "branch_id": str(row.branch_id) if row.branch_id else None,
        "section_key": row.section_key,
        "title": row.title,
        "body": row.body,
        "sort_order": row.sort_order,
        "is_active": row.is_active,
        "updated_by_user_id": str(row.updated_by_user_id) if row.updated_by_user_id else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


async def _branch_scope(db: AsyncSession, current_user: User, branch_id: uuid.UUID | None) -> list[uuid.UUID]:
    from app.services.tenancy_service import TenancyService

    return await TenancyService.branch_scope_ids(
        db,
        current_user=current_user,
        branch_id=branch_id,
        allow_all_for_admin=True,
    )


@router.get("/machines", response_model=StandardResponse)
async def list_machines(
    current_user: Annotated[User, Depends(dependencies.get_current_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
    branch_id: uuid.UUID | None = Query(default=None),
):
    branch_ids = await _branch_scope(db, current_user, branch_id)
    stmt = select(FacilityMachine).where(FacilityMachine.gym_id == current_user.gym_id)
    if branch_ids:
        stmt = stmt.where(FacilityMachine.branch_id.in_(branch_ids))
    rows = (await db.execute(stmt.order_by(FacilityMachine.updated_at.desc()))).scalars().all()
    return StandardResponse(data=[_machine_to_payload(row) for row in rows])


@router.post("/machines", response_model=StandardResponse)
async def create_machine(
    payload: FacilityMachinePayload,
    current_user: Annotated[User, Depends(dependencies.get_current_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
    branch_id: uuid.UUID | None = Query(default=None),
):
    if branch_id is None:
        raise HTTPException(status_code=400, detail="branch_id is required")
    branch_ids = await _branch_scope(db, current_user, branch_id)
    resolved_branch_id = branch_ids[0] if branch_ids else None
    machine = FacilityMachine(
        gym_id=current_user.gym_id,
        branch_id=resolved_branch_id,
        machine_name=payload.machine_name.strip(),
        accessories_summary=payload.accessories_summary.strip() if payload.accessories_summary else None,
        condition_notes=payload.condition_notes.strip() if payload.condition_notes else None,
        maintenance_notes=payload.maintenance_notes.strip() if payload.maintenance_notes else None,
        is_active=payload.is_active,
        updated_by_user_id=current_user.id,
    )
    db.add(machine)
    await db.commit()
    await db.refresh(machine)
    return StandardResponse(data=_machine_to_payload(machine))


@router.patch("/machines/{machine_id}", response_model=StandardResponse)
async def update_machine(
    machine_id: uuid.UUID,
    payload: FacilityMachinePayload,
    current_user: Annotated[User, Depends(dependencies.get_current_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(
        select(FacilityMachine).where(
            FacilityMachine.id == machine_id,
            FacilityMachine.gym_id == current_user.gym_id,
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Machine not found")
    row.machine_name = payload.machine_name.strip()
    row.accessories_summary = payload.accessories_summary.strip() if payload.accessories_summary else None
    row.condition_notes = payload.condition_notes.strip() if payload.condition_notes else None
    row.maintenance_notes = payload.maintenance_notes.strip() if payload.maintenance_notes else None
    row.is_active = payload.is_active
    row.updated_by_user_id = current_user.id
    await db.commit()
    await db.refresh(row)
    return StandardResponse(data=_machine_to_payload(row))


@router.get("/sections", response_model=StandardResponse)
async def list_sections(
    current_user: Annotated[User, Depends(dependencies.get_current_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
    branch_id: uuid.UUID | None = Query(default=None),
):
    branch_ids = await _branch_scope(db, current_user, branch_id)
    stmt = select(FacilitySection).where(FacilitySection.gym_id == current_user.gym_id)
    if branch_ids:
        stmt = stmt.where(FacilitySection.branch_id.in_(branch_ids))
    rows = (await db.execute(stmt.order_by(FacilitySection.sort_order.asc(), FacilitySection.updated_at.desc()))).scalars().all()
    return StandardResponse(data=[_section_to_payload(row) for row in rows])


@router.post("/sections", response_model=StandardResponse)
async def create_section(
    payload: FacilitySectionPayload,
    current_user: Annotated[User, Depends(dependencies.get_current_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
    branch_id: uuid.UUID | None = Query(default=None),
):
    if branch_id is None:
        raise HTTPException(status_code=400, detail="branch_id is required")
    branch_ids = await _branch_scope(db, current_user, branch_id)
    resolved_branch_id = branch_ids[0] if branch_ids else None
    section = FacilitySection(
        gym_id=current_user.gym_id,
        branch_id=resolved_branch_id,
        section_key=payload.section_key.strip(),
        title=payload.title.strip(),
        body=payload.body.strip(),
        sort_order=payload.sort_order,
        is_active=payload.is_active,
        updated_by_user_id=current_user.id,
    )
    db.add(section)
    await db.commit()
    await db.refresh(section)
    return StandardResponse(data=_section_to_payload(section))


@router.patch("/sections/{section_id}", response_model=StandardResponse)
async def update_section(
    section_id: uuid.UUID,
    payload: FacilitySectionPayload,
    current_user: Annotated[User, Depends(dependencies.get_current_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(
        select(FacilitySection).where(
            FacilitySection.id == section_id,
            FacilitySection.gym_id == current_user.gym_id,
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Section not found")
    row.section_key = payload.section_key.strip()
    row.title = payload.title.strip()
    row.body = payload.body.strip()
    row.sort_order = payload.sort_order
    row.is_active = payload.is_active
    row.updated_by_user_id = current_user.id
    await db.commit()
    await db.refresh(row)
    return StandardResponse(data=_section_to_payload(row))
