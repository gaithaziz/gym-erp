from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import dependencies
from app.core.responses import StandardResponse
from app.database import get_db
from app.models.facility import (
    FacilityAsset,
    FacilityAssetStatus,
    FacilityAssetType,
    FacilityMachine,
    FacilitySection,
)
from app.models.finance import PaymentMethod, Transaction, TransactionCategory, TransactionType
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


class FacilityAssetPayload(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    asset_type: FacilityAssetType = FacilityAssetType.MACHINE
    status: FacilityAssetStatus = FacilityAssetStatus.GOOD
    fix_expense_amount: Decimal | None = Field(default=None, ge=0)
    note: str | None = Field(default=None, max_length=5000)
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


def _asset_to_payload(row: FacilityAsset) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "branch_id": str(row.branch_id) if row.branch_id else None,
        "name": row.name,
        "asset_type": row.asset_type.value if hasattr(row.asset_type, "value") else str(row.asset_type),
        "status": row.status.value if hasattr(row.status, "value") else str(row.status),
        "fix_expense_amount": float(row.fix_expense_amount) if row.fix_expense_amount is not None else None,
        "fix_expense_transaction_id": str(row.fix_expense_transaction_id) if row.fix_expense_transaction_id else None,
        "note": row.note,
        "is_active": row.is_active,
        "updated_by_user_id": str(row.updated_by_user_id) if row.updated_by_user_id else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def _expense_category_for_asset_type(asset_type: FacilityAssetType) -> TransactionCategory:
    if asset_type == FacilityAssetType.ACCESSORY:
        return TransactionCategory.EQUIPMENT
    return TransactionCategory.MAINTENANCE


async def _sync_fix_expense(
    db: AsyncSession,
    *,
    asset: FacilityAsset,
    current_user: User,
    branch_id: uuid.UUID,
    fix_expense_amount: Decimal | None,
) -> None:
    if fix_expense_amount is None:
        return
    if fix_expense_amount <= 0:
        asset.fix_expense_amount = None
        return

    category = _expense_category_for_asset_type(asset.asset_type)
    description = f"Maintenance fix expense - {asset.name}"
    amount = Decimal(fix_expense_amount)

    if asset.fix_expense_transaction_id:
        tx = await db.get(Transaction, asset.fix_expense_transaction_id)
        if tx is None:
            asset.fix_expense_transaction_id = None
        else:
            tx.amount = amount
            tx.type = TransactionType.EXPENSE
            tx.category = category
            tx.payment_method = PaymentMethod.SYSTEM
            tx.description = description
            tx.branch_id = branch_id
            tx.user_id = current_user.id
            asset.fix_expense_amount = amount
            return

    tx = Transaction(
        amount=amount,
        type=TransactionType.EXPENSE,
        category=category,
        payment_method=PaymentMethod.SYSTEM,
        description=description,
        user_id=current_user.id,
        branch_id=branch_id,
    )
    db.add(tx)
    await db.flush()
    asset.fix_expense_transaction_id = tx.id
    asset.fix_expense_amount = amount


async def _branch_scope(db: AsyncSession, current_user: User, branch_id: uuid.UUID | None) -> list[uuid.UUID]:
    from app.services.tenancy_service import TenancyService

    return await TenancyService.branch_scope_ids(
        db,
        current_user=current_user,
        branch_id=branch_id,
        allow_all_for_admin=True,
    )


@router.get("/assets", response_model=StandardResponse)
async def list_assets(
    current_user: Annotated[User, Depends(dependencies.get_current_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
    branch_id: uuid.UUID | None = Query(default=None),
    asset_type: FacilityAssetType | None = Query(default=None),
):
    branch_ids = await _branch_scope(db, current_user, branch_id)
    stmt = select(FacilityAsset).where(FacilityAsset.gym_id == current_user.gym_id)
    if branch_ids:
        stmt = stmt.where(FacilityAsset.branch_id.in_(branch_ids))
    if asset_type is not None:
        stmt = stmt.where(FacilityAsset.asset_type == asset_type)
    rows = (await db.execute(stmt.order_by(FacilityAsset.updated_at.desc()))).scalars().all()
    return StandardResponse(data=[_asset_to_payload(row) for row in rows])


@router.post("/assets", response_model=StandardResponse)
async def create_asset(
    payload: FacilityAssetPayload,
    current_user: Annotated[User, Depends(dependencies.get_current_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
    branch_id: uuid.UUID | None = Query(default=None),
):
    if branch_id is None:
        raise HTTPException(status_code=400, detail="branch_id is required")
    branch_ids = await _branch_scope(db, current_user, branch_id)
    resolved_branch_id = branch_ids[0] if branch_ids else None
    if resolved_branch_id is None:
        raise HTTPException(status_code=400, detail="branch_id is required")

    asset = FacilityAsset(
        gym_id=current_user.gym_id,
        branch_id=resolved_branch_id,
        name=payload.name.strip(),
        asset_type=payload.asset_type,
        status=payload.status,
        note=payload.note.strip() if payload.note else None,
        is_active=payload.is_active,
        updated_by_user_id=current_user.id,
    )
    db.add(asset)
    await db.flush()
    await _sync_fix_expense(
        db,
        asset=asset,
        current_user=current_user,
        branch_id=resolved_branch_id,
        fix_expense_amount=payload.fix_expense_amount,
    )
    await db.commit()
    await db.refresh(asset)
    return StandardResponse(data=_asset_to_payload(asset))


@router.patch("/assets/{asset_id}", response_model=StandardResponse)
async def update_asset(
    asset_id: uuid.UUID,
    payload: FacilityAssetPayload,
    current_user: Annotated[User, Depends(dependencies.get_current_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(
        select(FacilityAsset).where(
            FacilityAsset.id == asset_id,
            FacilityAsset.gym_id == current_user.gym_id,
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Asset not found")
    row.name = payload.name.strip()
    row.asset_type = payload.asset_type
    row.status = payload.status
    row.note = payload.note.strip() if payload.note else None
    row.is_active = payload.is_active
    row.updated_by_user_id = current_user.id
    if row.branch_id is None:
        raise HTTPException(status_code=400, detail="Asset branch is missing")
    await _sync_fix_expense(
        db,
        asset=row,
        current_user=current_user,
        branch_id=row.branch_id,
        fix_expense_amount=payload.fix_expense_amount,
    )
    await db.commit()
    await db.refresh(row)
    return StandardResponse(data=_asset_to_payload(row))


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
