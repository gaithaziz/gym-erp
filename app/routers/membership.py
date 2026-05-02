from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import dependencies
from app.core.responses import StandardResponse
from app.database import get_db
from app.models.enums import Role
from app.models.membership import PerkAccount, PerkUsage, PolicyDocument, PolicySignature
from app.models.user import User
from app.services.policy_versions import POLICY_VERSION, get_gym_policy_version, get_next_gym_policy_version

router = APIRouter()

DEFAULT_POLICY_CONTENT: dict[str, dict[str, Any]] = {
    "en": {
        "title": "Gym Policy & Membership Contract",
        "effectiveDate": "2026-05-01T00:00:00Z",
        "updatedAt": "2026-05-01T00:00:00Z",
        "intro": "This policy defines the membership rules, facility use, subscriptions, guest privileges, and digital acceptance terms for the gym.",
        "sections": [
            {
                "title": "Membership and Access",
                "points": [
                    "Members must have an active subscription to access the facility.",
                    "Access is personal and cannot be shared with other people.",
                    "The gym may suspend access if the subscription is expired, frozen, or unpaid.",
                ],
            },
            {
                "title": "Bundles and Perks",
                "points": [
                    "Bundle perks may include guest visits, InBody tests, private classes, and other admin-defined benefits.",
                    "Some perks reset monthly while others last for the full contract period.",
                    "Any custom bundle terms agreed by the admin are part of the signed contract.",
                ],
            },
            {
                "title": "Contracts and Acceptance",
                "points": [
                    "A customer must review and sign the membership contract before payment completion.",
                    "Contract acceptance is recorded with the active policy version.",
                    "A new policy version may require re-acceptance on the next login or renewal.",
                ],
            },
        ],
        "footerNote": "By continuing, the member confirms they understood the policy and agree to follow it.",
    },
    "ar": {
        "title": "سياسة النادي وعقد العضوية",
        "effectiveDate": "2026-05-01T00:00:00Z",
        "updatedAt": "2026-05-01T00:00:00Z",
        "intro": "تحدد هذه السياسة قواعد العضوية، واستخدام المرافق، والاشتراكات، ومزايا الضيوف، وشروط الموافقة الرقمية للنادي.",
        "sections": [
            {
                "title": "العضوية والدخول",
                "points": [
                    "يجب أن يكون لدى العضو اشتراك نشط للدخول إلى النادي.",
                    "الدخول شخصي ولا يمكن مشاركته مع أي شخص آخر.",
                    "يحق للنادي إيقاف الدخول إذا كان الاشتراك منتهيًا أو مجمدًا أو غير مدفوع.",
                ],
            },
            {
                "title": "الباقات والمزايا",
                "points": [
                    "قد تشمل مزايا الباقة زيارات للضيوف، واختبارات InBody، وحصص خاصة، ومزايا أخرى يحددها المشرف.",
                    "بعض المزايا تتجدد شهريًا وبعضها يبقى طوال مدة العقد.",
                    "أي شروط خاصة يتفق عليها المشرف تعد جزءًا من العقد الموقع.",
                ],
            },
            {
                "title": "العقود والموافقة",
                "points": [
                    "يجب على العميل مراجعة عقد العضوية والتوقيع عليه قبل إكمال الدفع.",
                    "تُسجل الموافقة على العقد مع إصدار السياسة الحالي.",
                    "قد تتطلب نسخة جديدة من السياسة إعادة الموافقة عند الدخول التالي أو التجديد.",
                ],
            },
        ],
        "footerNote": "بالمتابعة، يقر العضو بأنه فهم السياسة ويلتزم بها.",
    },
}


class PolicySection(BaseModel):
    title: str
    points: list[str]


class PolicyContentPayload(BaseModel):
    version: str | None = None
    title: str
    effectiveDate: datetime
    updatedAt: datetime
    intro: str
    sections: list[PolicySection]
    footerNote: str


class PolicySignaturePayload(BaseModel):
    signerName: str = Field(min_length=2, max_length=255)
    accepted: bool = True


class PerkAccountPayload(BaseModel):
    user_id: uuid.UUID
    perk_key: str = Field(min_length=2, max_length=120)
    perk_label: str = Field(min_length=2, max_length=255)
    period_type: Literal["MONTHLY", "CONTRACT"] = "CONTRACT"
    total_allowance: int = Field(ge=0, le=9999)
    contract_starts_at: datetime | None = None
    contract_ends_at: datetime | None = None
    monthly_reset_day: int | None = Field(default=None, ge=1, le=31)
    note: str | None = Field(default=None, max_length=2000)


class PerkUsagePayload(BaseModel):
    used_amount: int = Field(default=1, ge=1, le=9999)
    note: str | None = Field(default=None, max_length=2000)


def _policy_to_payload(row: PolicyDocument | None, locale: str, version: str | None = None) -> PolicyContentPayload:
    if row is None:
        default = DEFAULT_POLICY_CONTENT[locale]
        return PolicyContentPayload(
            version=version or POLICY_VERSION,
            title=default["title"],
            effectiveDate=datetime.fromisoformat(default["effectiveDate"].replace("Z", "+00:00")),
            updatedAt=datetime.fromisoformat(default["updatedAt"].replace("Z", "+00:00")),
            intro=default["intro"],
            sections=[PolicySection(**item) for item in default["sections"]],
            footerNote=default["footerNote"],
        )
    try:
        sections_raw = json.loads(row.sections_json)
    except Exception:
        sections_raw = []
    return PolicyContentPayload(
        version=row.version,
        title=row.title,
        effectiveDate=row.effective_date,
        updatedAt=row.updated_at,
        intro=row.intro,
        sections=[PolicySection(**item) for item in sections_raw],
        footerNote=row.footer_note,
    )


def _perk_account_to_payload(account: PerkAccount) -> dict[str, Any]:
    remaining = max(0, int(account.total_allowance) - int(account.used_allowance))
    return {
        "id": str(account.id),
        "user_id": str(account.user_id),
        "perk_key": account.perk_key,
        "perk_label": account.perk_label,
        "period_type": account.period_type,
        "total_allowance": int(account.total_allowance),
        "used_allowance": int(account.used_allowance),
        "remaining_allowance": remaining,
        "contract_starts_at": account.contract_starts_at.isoformat() if account.contract_starts_at else None,
        "contract_ends_at": account.contract_ends_at.isoformat() if account.contract_ends_at else None,
        "monthly_reset_day": account.monthly_reset_day,
        "note": account.note,
        "is_active": account.is_active,
        "updated_at": account.updated_at.isoformat() if account.updated_at else None,
    }


async def _get_policy_row(db: AsyncSession, gym_id: uuid.UUID, locale: str) -> PolicyDocument | None:
    result = await db.execute(
        select(PolicyDocument).where(
            PolicyDocument.gym_id == gym_id,
            PolicyDocument.locale == locale,
        )
    )
    return result.scalar_one_or_none()


@router.get("/policy", response_model=StandardResponse)
async def get_policy(
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    locale: str = Query(default="en", pattern="^(en|ar)$"),
):
    row = await _get_policy_row(db, current_user.gym_id, locale)
    current_version = await get_gym_policy_version(db, current_user.gym_id)
    if row is None:
        payload = _policy_to_payload(None, locale, current_version)
    else:
        payload = _policy_to_payload(row, locale)
    return StandardResponse(data=payload.model_dump())


@router.put("/policy", response_model=StandardResponse)
async def save_policy(
    payload: PolicyContentPayload,
    current_user: Annotated[User, Depends(dependencies.get_current_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
    locale: str = Query(default="en", pattern="^(en|ar)$"),
):
    sections_json = json.dumps([section.model_dump() for section in payload.sections], ensure_ascii=False)
    next_version = await get_next_gym_policy_version(db, current_user.gym_id)
    row = await _get_policy_row(db, current_user.gym_id, locale)
    if row is None:
        row = PolicyDocument(
            gym_id=current_user.gym_id,
            locale=locale,
            version=next_version,
            title=payload.title,
            effective_date=payload.effectiveDate,
            intro=payload.intro,
            sections_json=sections_json,
            footer_note=payload.footerNote,
            created_by_user_id=current_user.id,
        )
        db.add(row)
    else:
        row.title = payload.title
        row.effective_date = payload.effectiveDate
        row.intro = payload.intro
        row.sections_json = sections_json
        row.footer_note = payload.footerNote
        row.updated_at = payload.updatedAt
        row.created_by_user_id = current_user.id
        row.version = next_version
    await db.execute(
        update(PolicyDocument)
        .where(PolicyDocument.gym_id == current_user.gym_id)
        .values(version=next_version)
    )
    await db.execute(
        delete(PolicySignature).where(
            PolicySignature.gym_id == current_user.gym_id,
        )
    )
    await db.commit()
    await db.refresh(row)
    return StandardResponse(data=_policy_to_payload(row, locale).model_dump())


@router.get("/policy/signature/me", response_model=StandardResponse)
async def get_my_policy_signature(
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    locale: str = Query(default="en", pattern="^(en|ar)$"),
):
    result = await db.execute(
        select(PolicySignature).where(
            PolicySignature.gym_id == current_user.gym_id,
            PolicySignature.user_id == current_user.id,
            PolicySignature.accepted.is_(True),
        )
        .order_by(PolicySignature.signed_at.desc())
    )
    row = result.scalars().first()
    if row is None:
        return StandardResponse(data=None)
    return StandardResponse(data={
        "version": row.policy_version,
        "signedAt": row.signed_at.isoformat() if row.signed_at else None,
        "signerName": row.signer_name,
        "accepted": row.accepted,
    })


@router.post("/policy/signature", response_model=StandardResponse)
async def sign_policy(
    payload: PolicySignaturePayload,
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    locale: str = Query(default="en", pattern="^(en|ar)$"),
):
    policy_row = await _get_policy_row(db, current_user.gym_id, locale)
    version = policy_row.version if policy_row else await get_gym_policy_version(db, current_user.gym_id)
    result = await db.execute(
        select(PolicySignature).where(
            PolicySignature.gym_id == current_user.gym_id,
            PolicySignature.user_id == current_user.id,
        )
        .order_by(PolicySignature.signed_at.desc())
    )
    row = result.scalars().first()
    now = datetime.now(timezone.utc)
    if row is not None and row.accepted and row.policy_version == version:
        return StandardResponse(data={
            "version": row.policy_version,
            "signedAt": row.signed_at.isoformat() if row.signed_at else None,
            "signerName": row.signer_name,
            "accepted": row.accepted,
        })
    await db.execute(
        delete(PolicySignature).where(
            PolicySignature.gym_id == current_user.gym_id,
            PolicySignature.user_id == current_user.id,
        )
    )
    row = PolicySignature(
        gym_id=current_user.gym_id,
        user_id=current_user.id,
        locale=locale,
        policy_version=version,
        signer_name=payload.signerName,
        accepted=payload.accepted,
        signed_at=now,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return StandardResponse(data={
        "version": row.policy_version,
        "signedAt": row.signed_at.isoformat() if row.signed_at else None,
        "signerName": row.signer_name,
        "accepted": row.accepted,
    })


@router.get("/perks", response_model=StandardResponse)
async def list_perks(
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    member_id: uuid.UUID | None = Query(default=None),
):
    target_member_id = member_id if (member_id and current_user.role in {Role.ADMIN, Role.MANAGER, Role.COACH}) else current_user.id
    result = await db.execute(
        select(PerkAccount).where(
            PerkAccount.gym_id == current_user.gym_id,
            PerkAccount.user_id == target_member_id,
        ).order_by(PerkAccount.updated_at.desc())
    )
    accounts = list(result.scalars().all())
    return StandardResponse(data={
        "member_id": str(target_member_id),
        "summary": {
            "total_accounts": len(accounts),
            "total_remaining": sum(max(0, acc.total_allowance - acc.used_allowance) for acc in accounts),
            "total_used": sum(max(0, acc.used_allowance) for acc in accounts),
        },
        "accounts": [_perk_account_to_payload(account) for account in accounts],
    })


@router.post("/perks", response_model=StandardResponse)
async def create_perk_account(
    payload: PerkAccountPayload,
    current_user: Annotated[User, Depends(dependencies.get_current_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    account = PerkAccount(
        gym_id=current_user.gym_id,
        user_id=payload.user_id,
        perk_key=payload.perk_key,
        perk_label=payload.perk_label,
        period_type=payload.period_type,
        total_allowance=payload.total_allowance,
        used_allowance=0,
        contract_starts_at=payload.contract_starts_at,
        contract_ends_at=payload.contract_ends_at,
        monthly_reset_day=payload.monthly_reset_day,
        note=payload.note,
        is_active=True,
    )
    db.add(account)
    await db.commit()
    await db.refresh(account)
    return StandardResponse(data=_perk_account_to_payload(account))


@router.post("/perks/{perk_account_id}/use", response_model=StandardResponse)
async def use_perk_account(
    perk_account_id: uuid.UUID,
    payload: PerkUsagePayload,
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(
        select(PerkAccount).where(
            PerkAccount.id == perk_account_id,
            PerkAccount.gym_id == current_user.gym_id,
        )
    )
    account = result.scalar_one_or_none()
    if account is None:
        raise HTTPException(status_code=404, detail="Perk account not found")
    if current_user.role == Role.CUSTOMER and account.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed to use this perk")
    account.used_allowance = min(account.total_allowance, account.used_allowance + payload.used_amount)
    usage = PerkUsage(
        gym_id=current_user.gym_id,
        perk_account_id=account.id,
        used_amount=payload.used_amount,
        note=payload.note,
        used_by_user_id=current_user.id,
    )
    db.add(usage)
    await db.commit()
    await db.refresh(account)
    return StandardResponse(data=_perk_account_to_payload(account))


@router.get("/perks/{perk_account_id}/ledger", response_model=StandardResponse)
async def list_perk_ledger(
    perk_account_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(
        select(PerkAccount).where(
            PerkAccount.id == perk_account_id,
            PerkAccount.gym_id == current_user.gym_id,
        )
    )
    account = result.scalar_one_or_none()
    if account is None:
        raise HTTPException(status_code=404, detail="Perk account not found")
    if current_user.role == Role.CUSTOMER and account.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed to view this perk")
    usages = (
        await db.execute(
            select(PerkUsage).where(
                PerkUsage.perk_account_id == account.id,
                PerkUsage.gym_id == current_user.gym_id,
            ).order_by(PerkUsage.used_at.desc())
        )
    ).scalars().all()
    return StandardResponse(data={
        "perk_account": _perk_account_to_payload(account),
        "entries": [
            {
                "id": str(row.id),
                "used_amount": row.used_amount,
                "note": row.note,
                "used_at": row.used_at.isoformat() if row.used_at else None,
                "used_by_user_id": str(row.used_by_user_id) if row.used_by_user_id else None,
            }
            for row in usages
        ],
    })
