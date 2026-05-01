from __future__ import annotations

import csv
import io
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from pathlib import Path
import arabic_reshaper
from bidi.algorithm import get_display

from app.auth import dependencies
from app.core.responses import StandardResponse
from app.database import get_db
from app.models.enums import Role
from app.models.staff_debt import (
    StaffDebtAccount,
    StaffDebtEntry,
    StaffDebtEntryType,
    StaffDebtMonthlyBalance,
)
from app.models.tenancy import Branch
from app.models.user import User
from app.services.tenancy_service import TenancyService


router = APIRouter()

_PDF_FONT_NAME = "StaffDebtPdfFont"
_PDF_FONT_BOLD_NAME = "StaffDebtPdfFontBold"
_PDF_FONT_REGISTERED = False


def _register_pdf_fonts() -> tuple[str, str]:
    global _PDF_FONT_REGISTERED
    if _PDF_FONT_REGISTERED:
        return _PDF_FONT_NAME, _PDF_FONT_BOLD_NAME

    candidates = [
        ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", _PDF_FONT_NAME),
        ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", _PDF_FONT_BOLD_NAME),
        ("C:/Windows/Fonts/arial.ttf", _PDF_FONT_NAME),
        ("C:/Windows/Fonts/arialbd.ttf", _PDF_FONT_BOLD_NAME),
    ]
    for font_path, font_name in candidates:
        path = Path(font_path)
        if path.exists():
            pdfmetrics.registerFont(TTFont(font_name, str(path)))
    if _PDF_FONT_NAME in pdfmetrics.getRegisteredFontNames() and _PDF_FONT_BOLD_NAME in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFontFamily(_PDF_FONT_NAME, normal=_PDF_FONT_NAME, bold=_PDF_FONT_BOLD_NAME)
    _PDF_FONT_REGISTERED = True
    registered = set(pdfmetrics.getRegisteredFontNames())
    regular = _PDF_FONT_NAME if _PDF_FONT_NAME in registered else "Helvetica"
    bold = _PDF_FONT_BOLD_NAME if _PDF_FONT_BOLD_NAME in registered else "Helvetica-Bold"
    return regular, bold


def _shape_pdf_text(text: str, locale: str | None) -> str:
    if (locale or "en").lower().startswith("ar"):
        return get_display(arabic_reshaper.reshape(text))
    return text


def _pdf_table_bytes(title: str, subtitle: str, rows: list[list[str]], headers: list[str], locale: str | None = "en") -> bytes:
    buffer = io.BytesIO()
    styles = getSampleStyleSheet()
    direction = "rtl" if (locale or "en").lower().startswith("ar") else "ltr"
    alignment = TA_RIGHT if direction == "rtl" else TA_LEFT
    title_style = ParagraphStyle("StaffDebtPdfTitle", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=16, leading=19, alignment=alignment, textColor=colors.HexColor("#1f2937"))
    subtitle_style = ParagraphStyle("StaffDebtPdfSubtitle", parent=styles["BodyText"], fontName="Helvetica", fontSize=10, leading=13, alignment=alignment, textColor=colors.HexColor("#4b5563"))
    cell_style = ParagraphStyle("StaffDebtPdfCell", parent=styles["BodyText"], fontName="Helvetica", fontSize=9, leading=11, alignment=alignment)
    header_style = ParagraphStyle("StaffDebtPdfHeader", parent=styles["BodyText"], fontName="Helvetica-Bold", fontSize=9, leading=11, alignment=alignment, textColor=colors.white)

    doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=14 * mm, rightMargin=14 * mm, topMargin=14 * mm, bottomMargin=14 * mm)
    elements = [
        Paragraph(_shape_pdf_text(title, locale), title_style),
        Spacer(1, 4 * mm),
        Paragraph(_shape_pdf_text(subtitle, locale), subtitle_style),
        Spacer(1, 6 * mm),
    ]
    table_data = [[Paragraph(_shape_pdf_text(header, locale), header_style) for header in headers]]
    for row in rows:
        table_data.append([Paragraph(_shape_pdf_text(str(cell), locale), cell_style) for cell in row])
    table = Table(table_data, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#111827")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
        ("BOX", (0, 0), (-1, -1), 0.75, colors.HexColor("#9ca3af")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (-1, -1), "RIGHT" if direction == "rtl" else "LEFT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    elements.append(table)
    doc.build(elements)
    return buffer.getvalue()

STAFF_ROLES = (
    Role.ADMIN,
    Role.MANAGER,
    Role.COACH,
    Role.EMPLOYEE,
    Role.CASHIER,
    Role.RECEPTION,
    Role.FRONT_DESK,
)


class StaffDebtEntryCreate(BaseModel):
    entry_type: StaffDebtEntryType
    amount: float = Field(..., description="Positive for standard entries; adjustments may be signed")
    notes: str | None = None
    month: int | None = Field(default=None, ge=1, le=12)
    year: int | None = Field(default=None, ge=2000, le=2100)
    branch_id: uuid.UUID | None = None


def _money(value: float | Decimal | None) -> float:
    return round(float(value or 0), 2)


def _decimal(value: float | Decimal | None) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal("0.01"))


def _entry_delta(entry_type: StaffDebtEntryType, amount: float) -> float:
    amount = float(amount)
    if entry_type == StaffDebtEntryType.ADVANCE:
        return amount
    if entry_type in {
        StaffDebtEntryType.DEDUCTION,
        StaffDebtEntryType.REPAYMENT,
        StaffDebtEntryType.SETTLEMENT,
    }:
        return -abs(amount)
    return amount


def _serialize_entry(entry: StaffDebtEntry) -> dict[str, object]:
    return {
        "id": str(entry.id),
        "account_id": str(entry.account_id),
        "entry_type": entry.entry_type.value if hasattr(entry.entry_type, "value") else str(entry.entry_type),
        "amount": _money(entry.amount),
        "balance_before": _money(entry.balance_before),
        "balance_after": _money(entry.balance_after),
        "month": entry.month,
        "year": entry.year,
        "notes": entry.notes,
        "created_at": entry.created_at.isoformat() if entry.created_at else None,
        "created_by_user_id": str(entry.created_by_user_id),
        "branch_id": str(entry.branch_id) if entry.branch_id else None,
    }


def _serialize_balance(balance: StaffDebtMonthlyBalance) -> dict[str, object]:
    return {
        "id": str(balance.id),
        "account_id": str(balance.account_id),
        "month": balance.month,
        "year": balance.year,
        "opening_balance": _money(balance.opening_balance),
        "advances_total": _money(balance.advances_total),
        "deductions_total": _money(balance.deductions_total),
        "repayments_total": _money(balance.repayments_total),
        "settlements_total": _money(balance.settlements_total),
        "adjustments_total": _money(balance.adjustments_total),
        "closing_balance": _money(balance.closing_balance),
        "entry_count": balance.entry_count,
        "updated_at": balance.updated_at.isoformat() if balance.updated_at else None,
        "branch_id": str(balance.branch_id) if balance.branch_id else None,
    }


def _serialize_account(account: StaffDebtAccount | None) -> dict[str, object] | None:
    if account is None:
        return None
    return {
        "id": str(account.id),
        "user_id": str(account.user_id),
        "branch_id": str(account.branch_id) if account.branch_id else None,
        "current_balance": _money(account.current_balance),
        "notes": account.notes,
        "updated_at": account.updated_at.isoformat() if account.updated_at else None,
    }


async def _require_staff_user(db: AsyncSession, *, current_user: User, user_id: uuid.UUID) -> User:
    user = await TenancyService.require_user_in_gym(
        db,
        current_user=current_user,
        user_id=user_id,
        allowed_roles=set(STAFF_ROLES),
        detail="Staff member not found",
    )
    if user.role == Role.SUPER_ADMIN:
        raise HTTPException(status_code=404, detail="Staff member not found")
    return user


async def _get_account_for_user(db: AsyncSession, *, current_user: User, user: User) -> StaffDebtAccount | None:
    return (
        await db.execute(
            select(StaffDebtAccount).where(
                StaffDebtAccount.gym_id == current_user.gym_id,
                StaffDebtAccount.user_id == user.id,
            )
        )
    ).scalar_one_or_none()


async def _create_or_get_account(
    db: AsyncSession,
    *,
    current_user: User,
    user: User,
    branch_id: uuid.UUID | None,
) -> StaffDebtAccount:
    account = await _get_account_for_user(db, current_user=current_user, user=user)
    if account is not None:
        return account

    resolved_branch_id = branch_id or user.home_branch_id
    if resolved_branch_id is None:
        raise HTTPException(status_code=400, detail="Branch is required to create a staff debt account")

    branch = await TenancyService.require_branch_access(
        db,
        current_user=current_user,
        branch_id=resolved_branch_id,
        allow_all_for_admin=True,
    )
    account = StaffDebtAccount(
        gym_id=current_user.gym_id,
        branch_id=branch.id,
        user_id=user.id,
        current_balance=_decimal(0),
        notes=None,
        updated_by_user_id=current_user.id,
    )
    db.add(account)
    await db.flush()
    return account


async def _build_staff_debt_rows(
    db: AsyncSession,
    *,
    current_user: User,
    branch_id: uuid.UUID | None = None,
    search: str | None = None,
) -> tuple[list[dict[str, object]], dict[str, float | int]]:
    if branch_id is not None:
        await TenancyService.require_branch_access(db, current_user=current_user, branch_id=branch_id, allow_all_for_admin=True)

    filters = [
        User.gym_id == current_user.gym_id,
        User.is_active.is_(True),
        User.role.in_(STAFF_ROLES),
        User.role != Role.SUPER_ADMIN,
    ]
    if branch_id is not None:
        filters.append(User.home_branch_id == branch_id)
    if search:
        pattern = f"%{search.strip()}%"
        filters.append((User.full_name.ilike(pattern)) | (User.email.ilike(pattern)))

    stmt = (
        select(
            User.id.label("user_id"),
            User.full_name.label("full_name"),
            User.email.label("email"),
            User.role.label("role"),
            User.home_branch_id.label("branch_id"),
            Branch.name.label("branch_name"),
            Branch.display_name.label("branch_display_name"),
            StaffDebtAccount.id.label("account_id"),
            func.coalesce(StaffDebtAccount.current_balance, 0).label("current_balance"),
            func.count(StaffDebtEntry.id).label("entry_count"),
            func.max(StaffDebtEntry.created_at).label("last_entry_at"),
        )
        .select_from(User)
        .outerjoin(Branch, Branch.id == User.home_branch_id)
        .outerjoin(StaffDebtAccount, StaffDebtAccount.user_id == User.id)
        .outerjoin(StaffDebtEntry, StaffDebtEntry.account_id == StaffDebtAccount.id)
        .where(*filters)
        .group_by(
            User.id,
            User.full_name,
            User.email,
            User.role,
            User.home_branch_id,
            Branch.name,
            Branch.display_name,
            StaffDebtAccount.id,
            StaffDebtAccount.current_balance,
        )
        .order_by(User.full_name.asc().nulls_last(), User.email.asc())
    )
    rows = (await db.execute(stmt)).all()
    items = [
        {
            "user_id": str(row.user_id),
            "full_name": row.full_name,
            "email": row.email,
            "role": row.role.value if hasattr(row.role, "value") else str(row.role),
            "branch_id": str(row.branch_id) if row.branch_id else None,
            "branch_name": row.branch_display_name or row.branch_name,
            "account_id": str(row.account_id) if row.account_id else None,
            "current_balance": _money(row.current_balance),
            "entry_count": int(row.entry_count or 0),
            "last_entry_at": row.last_entry_at.isoformat() if row.last_entry_at else None,
        }
        for row in rows
    ]
    summary = {
        "staff_count": len(items),
        "accounts_count": sum(1 for item in items if item["account_id"]),
        "total_balance": _money(sum(float(item["current_balance"]) for item in items)),
        "debtors_count": sum(1 for item in items if float(item["current_balance"]) > 0),
        "entries_count": sum(int(item["entry_count"]) for item in items),
    }
    return items, summary


@router.get("/staff-debt", response_model=StandardResponse)
async def list_staff_debt(
    *,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(dependencies.get_current_admin),
    branch_id: uuid.UUID | None = Query(default=None),
    search: str | None = Query(default=None, min_length=1),
) -> StandardResponse:
    items, summary = await _build_staff_debt_rows(
        db,
        current_user=current_user,
        branch_id=branch_id,
        search=search,
    )
    return StandardResponse(data={"summary": summary, "items": items})


@router.get("/staff-debt/export")
async def export_staff_debt(
    *,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(dependencies.get_current_admin),
    branch_id: uuid.UUID | None = Query(default=None),
    search: str | None = Query(default=None, min_length=1),
):
    items, _summary = await _build_staff_debt_rows(
        db,
        current_user=current_user,
        branch_id=branch_id,
        search=search,
    )
    output = io.StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=[
            "user_id",
            "full_name",
            "email",
            "role",
            "branch_id",
            "branch_name",
            "account_id",
            "current_balance",
            "entry_count",
            "last_entry_at",
        ],
    )
    writer.writeheader()
    writer.writerows(items)
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=staff_debt_report.csv"},
    )


@router.get("/staff-debt/export-pdf")
async def export_staff_debt_pdf(
    *,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(dependencies.get_current_admin),
    branch_id: uuid.UUID | None = Query(default=None),
    search: str | None = Query(default=None, min_length=1),
    locale: str = Query("en"),
):
    items, summary = await _build_staff_debt_rows(
        db,
        current_user=current_user,
        branch_id=branch_id,
        search=search,
    )
    rows = [
        [
            item["full_name"],
            item["branch_name"] or "",
            f'{item["current_balance"]:.2f}',
            str(item["entry_count"]),
            item["last_entry_at"] or "",
        ]
        for item in items
    ]
    content = _pdf_table_bytes(
        title="Employee Debt Report",
        subtitle=f"Staff: {summary['staff_count']} | Accounts: {summary['accounts_count']} | Total: {summary['total_balance']:.2f}",
        rows=rows or [["-", "-", "0.00", "0", "-"]],
        headers=["Name", "Branch", "Balance", "Entries", "Last Entry"],
        locale=locale,
    )
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=staff_debt_report.pdf"},
    )


@router.get("/staff-debt/staff/{user_id}", response_model=StandardResponse)
async def get_staff_debt_detail(
    *,
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(dependencies.get_current_admin),
) -> StandardResponse:
    user = await _require_staff_user(db, current_user=current_user, user_id=user_id)
    branch = None
    if user.home_branch_id is not None:
        branch = await TenancyService.get_branch_in_gym(db, gym_id=current_user.gym_id, branch_id=user.home_branch_id)
    account = await _get_account_for_user(db, current_user=current_user, user=user)

    entries_rows = []
    balance_rows = []
    if account is not None:
        entries_rows = (
            await db.execute(
                select(StaffDebtEntry)
                .where(
                    StaffDebtEntry.account_id == account.id,
                    StaffDebtEntry.gym_id == current_user.gym_id,
                )
                .order_by(StaffDebtEntry.created_at.desc(), StaffDebtEntry.id.desc())
            )
        ).scalars().all()
        balance_rows = (
            await db.execute(
                select(StaffDebtMonthlyBalance)
                .where(
                    StaffDebtMonthlyBalance.account_id == account.id,
                    StaffDebtMonthlyBalance.gym_id == current_user.gym_id,
                )
                .order_by(StaffDebtMonthlyBalance.year.desc(), StaffDebtMonthlyBalance.month.desc())
            )
        ).scalars().all()

    data = {
        "user": {
            "id": str(user.id),
            "full_name": user.full_name,
            "email": user.email,
            "role": user.role.value if hasattr(user.role, "value") else str(user.role),
            "branch_id": str(user.home_branch_id) if user.home_branch_id else None,
            "branch_name": (branch.display_name or branch.name) if branch else None,
        },
        "account": _serialize_account(account),
        "entries": [_serialize_entry(entry) for entry in entries_rows],
        "monthly_balances": [_serialize_balance(balance) for balance in balance_rows],
    }
    return StandardResponse(data=data)


@router.post("/staff-debt/staff/{user_id}/entries", response_model=StandardResponse)
async def create_staff_debt_entry(
    *,
    user_id: uuid.UUID,
    request: StaffDebtEntryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(dependencies.get_current_admin),
) -> StandardResponse:
    user = await _require_staff_user(db, current_user=current_user, user_id=user_id)
    amount = float(request.amount)
    if request.entry_type != StaffDebtEntryType.ADJUSTMENT and amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than zero")
    if request.entry_type == StaffDebtEntryType.ADJUSTMENT and amount == 0:
        raise HTTPException(status_code=400, detail="Adjustment amount cannot be zero")

    account = await _create_or_get_account(
        db,
        current_user=current_user,
        user=user,
        branch_id=request.branch_id,
    )

    now = datetime.now(timezone.utc)
    month = request.month or now.month
    year = request.year or now.year
    balance_before = _decimal(account.current_balance)
    delta = _decimal(_entry_delta(request.entry_type, amount))
    balance_after = _decimal(balance_before + delta)

    entry = StaffDebtEntry(
        gym_id=current_user.gym_id,
        branch_id=account.branch_id,
        account_id=account.id,
        entry_type=request.entry_type,
        amount=_decimal(amount),
        balance_before=balance_before,
        balance_after=balance_after,
        month=month,
        year=year,
        notes=request.notes,
        created_by_user_id=current_user.id,
    )
    db.add(entry)

    balance_stmt = (
        select(StaffDebtMonthlyBalance)
        .where(
            StaffDebtMonthlyBalance.account_id == account.id,
            StaffDebtMonthlyBalance.year == year,
            StaffDebtMonthlyBalance.month == month,
            StaffDebtMonthlyBalance.gym_id == current_user.gym_id,
        )
    )
    monthly_balance = (await db.execute(balance_stmt)).scalar_one_or_none()
    if monthly_balance is None:
        monthly_balance = StaffDebtMonthlyBalance(
            gym_id=current_user.gym_id,
            branch_id=account.branch_id,
            account_id=account.id,
            month=month,
            year=year,
            opening_balance=balance_before,
            advances_total=_decimal(0),
            deductions_total=_decimal(0),
            repayments_total=_decimal(0),
            settlements_total=_decimal(0),
            adjustments_total=_decimal(0),
            closing_balance=balance_before,
            entry_count=0,
            updated_by_user_id=current_user.id,
        )
        db.add(monthly_balance)
        await db.flush()

    amount_abs = _decimal(abs(amount))
    if request.entry_type == StaffDebtEntryType.ADVANCE:
        monthly_balance.advances_total = _decimal(monthly_balance.advances_total) + _decimal(amount_abs)
    elif request.entry_type == StaffDebtEntryType.DEDUCTION:
        monthly_balance.deductions_total = _decimal(monthly_balance.deductions_total) + _decimal(amount_abs)
    elif request.entry_type == StaffDebtEntryType.REPAYMENT:
        monthly_balance.repayments_total = _decimal(monthly_balance.repayments_total) + _decimal(amount_abs)
    elif request.entry_type == StaffDebtEntryType.SETTLEMENT:
        monthly_balance.settlements_total = _decimal(monthly_balance.settlements_total) + _decimal(amount_abs)
    else:
        monthly_balance.adjustments_total = _decimal(monthly_balance.adjustments_total) + _decimal(delta)
    monthly_balance.entry_count = int(monthly_balance.entry_count or 0) + 1
    monthly_balance.closing_balance = balance_after
    monthly_balance.updated_by_user_id = current_user.id

    account.current_balance = balance_after
    account.updated_by_user_id = current_user.id

    await db.commit()
    await db.refresh(entry)
    await db.refresh(account)
    await db.refresh(monthly_balance)

    detail = await get_staff_debt_detail(user_id=user.id, db=db, current_user=current_user)
    return StandardResponse(message="Staff debt entry recorded", data=detail.data)
