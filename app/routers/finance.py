from typing import Annotated, Optional
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from html import escape
from pathlib import Path
from fastapi import APIRouter, Depends, Query, HTTPException, Response
from fastapi.responses import HTMLResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, extract
from pydantic import BaseModel, Field
import arabic_reshaper
from bidi.algorithm import get_display

from app.database import get_db
from app.auth import dependencies
from app.models.user import User
from app.models.enums import Role
from app.models.finance import Transaction, TransactionType, TransactionCategory, PaymentMethod
from app.services.audit_service import AuditService
from app.core.responses import StandardResponse
import uuid
import csv
import io
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


router = APIRouter()

_PDF_FONT_NAME = "FinancePdfFont"
_PDF_FONT_BOLD_NAME = "FinancePdfFontBold"
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
    _PDF_FONT_REGISTERED = True
    registered = set(pdfmetrics.getRegisteredFontNames())
    regular = _PDF_FONT_NAME if _PDF_FONT_NAME in registered else "Helvetica"
    bold = _PDF_FONT_BOLD_NAME if _PDF_FONT_BOLD_NAME in registered else "Helvetica-Bold"
    return regular, bold


def _shape_pdf_text(text: str, locale: str | None) -> str:
    if _finance_locale(locale) != "ar":
        return text
    return get_display(arabic_reshaper.reshape(text))


def _pdf_bytes(title: str, lines: list[str], locale: str | None = "en") -> bytes:
    buffer = io.BytesIO()
    font_name, font_bold_name = _register_pdf_fonts()
    direction = _finance_direction(locale)
    alignment = TA_RIGHT if direction == "rtl" else TA_LEFT
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "FinancePdfTitle",
        parent=styles["Heading1"],
        fontName=font_bold_name,
        fontSize=16,
        leading=20,
        alignment=alignment,
        textColor=colors.HexColor("#1f2937"),
    )
    body_style = ParagraphStyle(
        "FinancePdfBody",
        parent=styles["BodyText"],
        fontName=font_name,
        fontSize=10,
        leading=14,
        alignment=alignment,
        textColor=colors.HexColor("#111827"),
    )
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=14 * mm,
        rightMargin=14 * mm,
        topMargin=12 * mm,
        bottomMargin=12 * mm,
    )
    story: list[object] = [Paragraph(_shape_pdf_text(title, locale), title_style), Spacer(1, 6 * mm)]
    for line in lines:
        story.append(Paragraph(_shape_pdf_text(line, locale), body_style))
        story.append(Spacer(1, 2 * mm))
    doc.build(story)
    content = buffer.getvalue()
    buffer.close()
    return content


def _pdf_table_bytes(
    *,
    title: str,
    subtitle: str,
    badge: str,
    meta_rows: list[tuple[str, str]],
    summary_rows: list[tuple[str, str]],
    table_title: str,
    table_headers: list[str],
    table_rows: list[list[str]],
    locale: str | None = "en",
) -> bytes:
    buffer = io.BytesIO()
    font_name, font_bold_name = _register_pdf_fonts()
    direction = _finance_direction(locale)
    alignment = TA_RIGHT if direction == "rtl" else TA_LEFT
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("FinancePdfTableTitle", parent=styles["Heading1"], fontName=font_bold_name, fontSize=16, leading=20, alignment=alignment, textColor=colors.HexColor("#1f2937"))
    subtitle_style = ParagraphStyle("FinancePdfSubTitle", parent=styles["BodyText"], fontName=font_name, fontSize=10, leading=14, alignment=alignment, textColor=colors.HexColor("#6b7280"))
    section_style = ParagraphStyle("FinancePdfSection", parent=styles["Heading2"], fontName=font_bold_name, fontSize=12, leading=16, alignment=alignment, textColor=colors.HexColor("#1f2937"))
    body_style = ParagraphStyle("FinancePdfBody2", parent=styles["BodyText"], fontName=font_name, fontSize=9, leading=12, alignment=alignment, textColor=colors.HexColor("#111827"))
    label_style = ParagraphStyle("FinancePdfLabel", parent=body_style, fontName=font_bold_name, textColor=colors.HexColor("#6b7280"))

    doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=12 * mm, rightMargin=12 * mm, topMargin=12 * mm, bottomMargin=12 * mm)
    story: list[object] = [
        Paragraph(_shape_pdf_text(title, locale), title_style),
        Spacer(1, 2 * mm),
        Paragraph(_shape_pdf_text(f"{subtitle} | {badge}", locale), subtitle_style),
        Spacer(1, 5 * mm),
        Paragraph(_shape_pdf_text(_finance_copy(locale)["details_heading"], locale), section_style),
        Spacer(1, 2 * mm),
    ]

    meta_table_rows = []
    for label, value in meta_rows:
        meta_table_rows.append([
            Paragraph(_shape_pdf_text(label, locale), label_style),
            Paragraph(_shape_pdf_text(value, locale), body_style),
        ])
    meta_table = Table(meta_table_rows, colWidths=[42 * mm, 120 * mm])
    meta_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.whitesmoke),
        ("BOX", (0, 0), (-1, -1), 0.75, colors.HexColor("#d6d3d1")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e7e5e4")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.extend([meta_table, Spacer(1, 5 * mm), Paragraph(_shape_pdf_text(_finance_copy(locale)["summary_heading"], locale), section_style), Spacer(1, 2 * mm)])

    summary_table_rows = [[Paragraph(_shape_pdf_text(label, locale), label_style), Paragraph(_shape_pdf_text(value, locale), body_style)] for label, value in summary_rows]
    summary_table = Table(summary_table_rows, colWidths=[60 * mm, 102 * mm])
    summary_table.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.75, colors.HexColor("#d6d3d1")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e7e5e4")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.extend([summary_table, Spacer(1, 5 * mm), Paragraph(_shape_pdf_text(table_title, locale), section_style), Spacer(1, 2 * mm)])

    pdf_rows: list[list[Paragraph]] = [[Paragraph(_shape_pdf_text(h, locale), label_style) for h in table_headers]]
    for row in table_rows:
        pdf_rows.append([Paragraph(_shape_pdf_text(cell, locale), body_style) for cell in row])

    col_count = len(table_headers)
    widths = [28 * mm, 54 * mm, 28 * mm, 22 * mm, 28 * mm, 24 * mm][:col_count]
    data_table = Table(pdf_rows, colWidths=widths, repeatRows=1)
    data_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#fff7ed")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#9a3412")),
        ("BOX", (0, 0), (-1, -1), 0.75, colors.HexColor("#d6d3d1")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e7e5e4")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(data_table)
    doc.build(story)
    content = buffer.getvalue()
    buffer.close()
    return content


def _format_money(amount: float | Decimal) -> str:
    return f"{float(amount):,.2f}"


def _finance_locale(locale: str | None) -> str:
    return "ar" if locale == "ar" else "en"


def _finance_direction(locale: str | None) -> str:
    return "rtl" if _finance_locale(locale) == "ar" else "ltr"


def _finance_copy(locale: str | None) -> dict[str, str]:
    if _finance_locale(locale) == "ar":
        return {
            "brand": "Gym ERP",
            "details_heading": "تفاصيل المستند",
            "summary_heading": "الملخص المالي",
            "receipt_title": "إيصال Gym ERP",
            "receipt_subtitle": "إيصال للعميل",
            "receipt_badge": "إيصال رقم",
            "receipt_no": "رقم الإيصال",
            "date": "التاريخ",
            "billed_to": "العميل",
            "category": "الفئة",
            "payment_method": "طريقة الدفع",
            "type": "النوع",
            "description": "الوصف",
            "amount": "المبلغ",
            "total": "الإجمالي",
            "report_title": "التقرير المالي",
            "report_subtitle": "ملخص المعاملات المالية",
            "report_badge": "عدد السجلات",
            "filters": "الفلاتر",
            "range": "النطاق",
            "rows": "عدد السجلات",
            "total_income": "إجمالي الدخل",
            "total_expenses": "إجمالي المصروفات",
            "net_profit": "صافي الربح",
            "transactions": "المعاملات",
            "all_dates": "كل التواريخ",
            "all": "الكل",
            "income": "دخل",
            "expense": "مصروف",
            "cash": "نقد",
            "card": "بطاقة",
            "bank_transfer": "تحويل بنكي",
            "system": "نظام",
            "subscription": "اشتراك",
            "pos_sale": "بيع نقطة البيع",
            "other_income": "دخل آخر",
            "salary": "راتب",
            "rent": "إيجار",
            "utilities": "مرافق",
            "maintenance": "صيانة",
            "equipment": "معدات",
            "other_expense": "مصروف آخر",
            "gym_service_item": "خدمة/منتج النادي",
        }
    return {
        "brand": "Gym ERP",
        "details_heading": "Document Details",
        "summary_heading": "Financial Summary",
        "receipt_title": "Gym ERP Receipt",
        "receipt_subtitle": "Receipt for customer",
        "receipt_badge": "Receipt #",
        "receipt_no": "Receipt No",
        "date": "Date",
        "billed_to": "Billed To",
        "category": "Category",
        "payment_method": "Payment Method",
        "type": "Type",
        "description": "Description",
        "amount": "Amount",
        "total": "Total",
        "report_title": "Financial Report",
        "report_subtitle": "Transaction summary",
        "report_badge": "Rows",
        "filters": "Filters",
        "range": "Range",
        "rows": "Rows",
        "total_income": "Total Income",
        "total_expenses": "Total Expenses",
        "net_profit": "Net Profit",
        "transactions": "Transactions",
        "all_dates": "All Dates",
        "all": "All",
        "income": "Income",
        "expense": "Expense",
        "cash": "Cash",
        "card": "Card",
        "bank_transfer": "Bank Transfer",
        "system": "System",
        "subscription": "Subscription",
        "pos_sale": "POS Sale",
        "other_income": "Other Income",
        "salary": "Salary",
        "rent": "Rent",
        "utilities": "Utilities",
        "maintenance": "Maintenance",
        "equipment": "Equipment",
        "other_expense": "Other Expense",
        "gym_service_item": "Gym Service/Item",
    }


def _finance_label(locale: str | None, value: str) -> str:
    copy = _finance_copy(locale)
    return copy.get(value.lower(), value.replace("_", " ").title())


def _render_print_document(
    *,
    title: str,
    subtitle: str,
    badge: str,
    meta_rows: list[tuple[str, str]],
    summary_rows: list[tuple[str, str]],
    total_label: str | None = None,
    total_value: str | None = None,
    locale: str = "en",
    details_heading: str = "Transaction Details",
    summary_heading: str = "Amount Summary",
    sections_html: str = "",
) -> str:
    lang = _finance_locale(locale)
    direction = _finance_direction(locale)
    align = "right" if direction == "rtl" else "left"
    reverse_align = "left" if direction == "rtl" else "right"
    meta_html = "".join(
        f"""
        <div class="meta-item">
          <span class="label">{escape(label)}</span>
          <span class="value">{escape(value)}</span>
        </div>
        """
        for label, value in meta_rows
    )
    summary_html = "".join(
        f"""
        <tr>
          <th>{escape(label)}</th>
          <td class="num">{escape(value)}</td>
        </tr>
        """
        for label, value in summary_rows
    )
    total_html = ""
    if total_label and total_value:
        total_html = f"""
        <div class="summary-total">
          <span>{escape(total_label)}</span>
          <span class="num">{escape(total_value)}</span>
        </div>
        """

    return f"""
    <!DOCTYPE html>
    <html lang="{lang}" dir="{direction}">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{escape(title)}</title>
        <style>
          :root {{
            color-scheme: light;
            --page-bg: #f5f1e8;
            --sheet-bg: #ffffff;
            --ink: #1f2937;
            --muted: #6b7280;
            --line: #d6d3d1;
            --accent: #d97706;
            --accent-soft: #fff7ed;
          }}
          * {{ box-sizing: border-box; }}
          html, body {{ margin: 0; padding: 0; background: var(--page-bg); color: var(--ink); }}
          body {{ font-family: Arial, sans-serif; padding: 24px; direction: {direction}; text-align: {align}; }}
          .sheet {{
            width: min(100%, 860px);
            margin: 0 auto;
            background: var(--sheet-bg);
            border: 1px solid rgba(156, 163, 175, 0.35);
            border-radius: 24px;
            padding: 28px;
            box-shadow: 0 18px 50px rgba(15, 23, 42, 0.08);
          }}
          .header {{
            display: flex;
            justify-content: space-between;
            gap: 16px;
            align-items: flex-start;
            border-bottom: 2px solid var(--line);
            padding-bottom: 18px;
            margin-bottom: 18px;
          }}
          .eyebrow {{
            margin: 0 0 6px;
            color: var(--accent);
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
          }}
          h1 {{ margin: 0; font-size: 28px; }}
          .subtitle {{ margin: 8px 0 0; color: var(--muted); font-size: 13px; }}
          .badge {{
            border: 1px solid rgba(217, 119, 6, 0.25);
            background: var(--accent-soft);
            color: #9a3412;
            border-radius: 999px;
            padding: 8px 14px;
            font-size: 12px;
            font-weight: 700;
            white-space: nowrap;
          }}
          .section {{
            margin-top: 18px;
            padding: 18px;
            border: 1px solid var(--line);
            border-radius: 18px;
          }}
          .section h2 {{ margin: 0 0 14px; font-size: 16px; }}
          .meta-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 12px;
          }}
          .meta-item {{
            border: 1px solid var(--line);
            border-radius: 14px;
            padding: 12px 14px;
            background: #fcfcfc;
          }}
          .label {{
            display: block;
            color: var(--muted);
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.05em;
            text-transform: uppercase;
            margin-bottom: 6px;
          }}
          .value {{ font-size: 14px; line-height: 1.45; }}
          table {{ width: 100%; border-collapse: collapse; }}
          th, td {{ padding: 11px 0; border-bottom: 1px solid var(--line); text-align: {align}; }}
          tbody tr:last-child th, tbody tr:last-child td {{ border-bottom: none; }}
          .num {{ text-align: {reverse_align}; font-variant-numeric: tabular-nums; }}
          .summary-total {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 12px;
            margin-top: 14px;
            padding-top: 14px;
            border-top: 2px solid var(--line);
            font-size: 18px;
            font-weight: 700;
          }}
          @page {{ size: A4; margin: 12mm; }}
          @media print {{
            body {{ background: #fff; padding: 0; }}
            .sheet {{ width: 100%; margin: 0; border: none; border-radius: 0; padding: 0; box-shadow: none; }}
          }}
        </style>
      </head>
      <body>
        <main class="sheet">
          <section class="header">
            <div>
              <p class="eyebrow">{escape(_finance_copy(locale)["brand"])}</p>
              <h1>{escape(title)}</h1>
              <p class="subtitle">{escape(subtitle)}</p>
            </div>
            <div class="badge">{escape(badge)}</div>
          </section>
          <section class="section">
            <h2>{escape(details_heading)}</h2>
            <div class="meta-grid">{meta_html}</div>
          </section>
          <section class="section">
            <h2>{escape(summary_heading)}</h2>
            <table>
              <tbody>{summary_html}</tbody>
            </table>
            {total_html}
          </section>
          {sections_html}
        </main>
      </body>
    </html>
    """

class TransactionCreate(BaseModel):
    amount: float = Field(..., gt=0)
    type: TransactionType
    category: TransactionCategory
    description: str | None = None
    payment_method: PaymentMethod = PaymentMethod.CASH
    user_id: uuid.UUID | None = None

class TransactionResponse(TransactionCreate):
    id: uuid.UUID
    date: datetime

    class Config:
        from_attributes = True

@router.post("/transactions", response_model=StandardResponse)
async def create_transaction(
    data: TransactionCreate,
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN]))],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Log a manual transaction (Bill, One-off Income, etc)."""
    transaction = Transaction(**data.model_dump())
    db.add(transaction)
    await db.commit()
    
    await AuditService.log_action(
        db=db,
        user_id=current_user.id,
        action="MANUAL_TRANSACTION",
        target_id=str(transaction.id),
        details=f"Logged {data.type.value} of {data.amount} for {data.category.value}"
    )
    await db.commit()
    
    return StandardResponse(message="Transaction Logged", data={"id": str(transaction.id)})

@router.get("/transactions", response_model=StandardResponse)
async def list_transactions(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    response: Response,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None, ge=2000, le=2100),
    tx_type: Optional[TransactionType] = Query(None),
    category: Optional[TransactionCategory] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
):
    """List recent transactions, optionally filtered by month/year or date range."""
    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=400, detail="start_date cannot be after end_date")

    stmt = select(Transaction)
    count_stmt = select(func.count(Transaction.id))
    if tx_type:
        stmt = stmt.where(Transaction.type == tx_type)
        count_stmt = count_stmt.where(Transaction.type == tx_type)
    if category:
        stmt = stmt.where(Transaction.category == category)
        count_stmt = count_stmt.where(Transaction.category == category)
    if start_date or end_date:
        if start_date:
            start_dt = datetime(start_date.year, start_date.month, start_date.day, tzinfo=timezone.utc)
            stmt = stmt.where(Transaction.date >= start_dt)
            count_stmt = count_stmt.where(Transaction.date >= start_dt)
        if end_date:
            end_exclusive = datetime(end_date.year, end_date.month, end_date.day, tzinfo=timezone.utc) + timedelta(days=1)
            stmt = stmt.where(Transaction.date < end_exclusive)
            count_stmt = count_stmt.where(Transaction.date < end_exclusive)
    elif month and year:
        month_year_filters = (
            extract('month', Transaction.date) == month,
            extract('year', Transaction.date) == year,
        )
        stmt = stmt.where(*month_year_filters)
        count_stmt = count_stmt.where(*month_year_filters)
    stmt = stmt.order_by(Transaction.date.desc()).offset(offset).limit(limit)
    count_result = await db.execute(count_stmt)
    total = int(count_result.scalar() or 0)
    response.headers["X-Total-Count"] = str(total)
    result = await db.execute(stmt)
    transactions = result.scalars().all()
    # Serialize to dicts using Pydantic
    serialized = [TransactionResponse.model_validate(t).model_dump(mode="json") for t in transactions]
    return StandardResponse(data=serialized)

@router.get("/summary", response_model=StandardResponse)
async def get_financial_summary(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None, ge=2000, le=2100),
    tx_type: Optional[TransactionType] = Query(None),
    category: Optional[TransactionCategory] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
):
    """Get total Income vs Expenses, optionally filtered by month/year or date range."""
    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=400, detail="start_date cannot be after end_date")

    base_filters = []
    if tx_type:
        base_filters.append(Transaction.type == tx_type)
    if category:
        base_filters.append(Transaction.category == category)
    if start_date or end_date:
        if start_date:
            start_dt = datetime(start_date.year, start_date.month, start_date.day, tzinfo=timezone.utc)
            base_filters.append(Transaction.date >= start_dt)
        if end_date:
            end_exclusive = datetime(end_date.year, end_date.month, end_date.day, tzinfo=timezone.utc) + timedelta(days=1)
            base_filters.append(Transaction.date < end_exclusive)
    elif month and year:
        date_filters = [
            extract('month', Transaction.date) == month,
            extract('year', Transaction.date) == year
        ]
        base_filters.extend(date_filters)

    stmt_inc = select(func.sum(Transaction.amount)).where(
        Transaction.type == TransactionType.INCOME,
        *base_filters,
    )
    result_inc = await db.execute(stmt_inc)
    income = result_inc.scalar() or Decimal("0")

    stmt_exp = select(func.sum(Transaction.amount)).where(
        Transaction.type == TransactionType.EXPENSE,
        *base_filters,
    )
    result_exp = await db.execute(stmt_exp)
    expenses = result_exp.scalar() or Decimal("0")

    profit = income - expenses

    return StandardResponse(data={
        "total_income": float(income),
        "total_expenses": float(expenses),
        "net_profit": float(profit)
    })

@router.get("/my-transactions", response_model=StandardResponse)
async def get_my_transactions(
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Get transactions linked to the current user."""
    stmt = select(Transaction).where(Transaction.user_id == current_user.id).order_by(Transaction.date.desc())
    result = await db.execute(stmt)
    transactions = result.scalars().all()
    serialized = [TransactionResponse.model_validate(t).model_dump(mode="json") for t in transactions]
    return StandardResponse(data=serialized)

@router.get("/transactions/{transaction_id}/receipt", response_model=StandardResponse)
async def generate_receipt(
    transaction_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)]
):
    """Generate a simple JSON layout for a printable receipt."""
    stmt = select(Transaction).where(Transaction.id == transaction_id)
    result = await db.execute(stmt)
    transaction = result.scalar_one_or_none()
    
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
        
    current_admin_or_owner = current_user.role == Role.ADMIN or current_user.id == transaction.user_id
    if not current_admin_or_owner:
        raise HTTPException(status_code=403, detail="Not authorized to view this receipt")
        
    user_name = "Guest/System"
    if transaction.user_id:
        user_stmt = select(User).where(User.id == transaction.user_id)
        user_result = await db.execute(user_stmt)
        u = user_result.scalar_one_or_none()
        if u:
            user_name = u.full_name
            
    receipt_data = {
        "receipt_no": str(transaction.id).split('-')[0].upper(),
        "date": transaction.date.isoformat(),
        "amount": transaction.amount,
        "type": transaction.type.value,
        "category": transaction.category.value,
        "payment_method": transaction.payment_method.value,
        "description": transaction.description or "Gym Service/Item",
        "billed_to": user_name,
        "gym_name": "Gym ERP Management",
    }
    return StandardResponse(data=receipt_data)


@router.get("/transactions/{transaction_id}/receipt/print", response_class=HTMLResponse)
async def generate_receipt_printable(
    transaction_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    locale: str = Query("en"),
):
    stmt = select(Transaction).where(Transaction.id == transaction_id)
    result = await db.execute(stmt)
    transaction = result.scalar_one_or_none()

    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    current_admin_or_owner = current_user.role == Role.ADMIN or current_user.id == transaction.user_id
    if not current_admin_or_owner:
        raise HTTPException(status_code=403, detail="Not authorized to view this receipt")

    user_name = "Guest/System"
    if transaction.user_id:
        user_stmt = select(User).where(User.id == transaction.user_id)
        user_result = await db.execute(user_stmt)
        user = user_result.scalar_one_or_none()
        if user:
            user_name = user.full_name

    copy = _finance_copy(locale)
    receipt_no = str(transaction.id)[:8].upper()
    amount_text = _format_money(transaction.amount)
    html = _render_print_document(
        title=copy["receipt_title"],
        subtitle=f"{copy['receipt_subtitle']}: {user_name}",
        badge=f"{copy['receipt_badge']} {receipt_no}",
        meta_rows=[
            (copy["receipt_no"], receipt_no),
            (copy["date"], transaction.date.isoformat()),
            (copy["billed_to"], user_name),
            (copy["category"], _finance_label(locale, transaction.category.value)),
            (copy["payment_method"], _finance_label(locale, transaction.payment_method.value)),
            (copy["type"], _finance_label(locale, transaction.type.value)),
            (copy["description"], transaction.description or copy["gym_service_item"]),
        ],
        summary_rows=[
            (copy["amount"], amount_text),
            (copy["payment_method"], _finance_label(locale, transaction.payment_method.value)),
        ],
        total_label=copy["total"],
        total_value=amount_text,
        locale=locale,
        details_heading=copy["details_heading"],
        summary_heading=copy["summary_heading"],
    )
    return HTMLResponse(content=html)


@router.get("/transactions/{transaction_id}/receipt/export")
async def export_receipt(
    transaction_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    stmt = select(Transaction).where(Transaction.id == transaction_id)
    result = await db.execute(stmt)
    transaction = result.scalar_one_or_none()

    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    current_admin_or_owner = current_user.role == Role.ADMIN or current_user.id == transaction.user_id
    if not current_admin_or_owner:
        raise HTTPException(status_code=403, detail="Not authorized to export this receipt")

    user_name = "Guest/System"
    if transaction.user_id:
        user_stmt = select(User).where(User.id == transaction.user_id)
        user_result = await db.execute(user_stmt)
        user = user_result.scalar_one_or_none()
        if user:
            user_name = user.full_name

    receipt_no = str(transaction.id)[:8].upper()
    amount_text = _format_money(transaction.amount)
    html = _render_print_document(
        title="Gym ERP Receipt",
        subtitle=f"Receipt for {user_name}",
        badge=f"Receipt #{receipt_no}",
        meta_rows=[
            ("Receipt No", receipt_no),
            ("Date", transaction.date.isoformat()),
            ("Billed To", user_name),
            ("Category", transaction.category.value),
            ("Payment Method", transaction.payment_method.value),
            ("Type", transaction.type.value),
            ("Description", transaction.description or "Gym Service/Item"),
        ],
        summary_rows=[
            ("Amount", amount_text),
            ("Payment Method", transaction.payment_method.value.replace("_", " ").title()),
        ],
        total_label="Total",
        total_value=amount_text,
    )
    return Response(
        content=html,
        media_type="text/html; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="receipt_{str(transaction.id)[:8].upper()}.html"'
        },
    )


@router.get("/transactions/report.csv")
async def export_transactions_report_csv(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None, ge=2000, le=2100),
    tx_type: Optional[TransactionType] = Query(None),
    category: Optional[TransactionCategory] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
):
    _ = current_user
    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=400, detail="start_date cannot be after end_date")

    stmt = select(Transaction)
    if tx_type:
        stmt = stmt.where(Transaction.type == tx_type)
    if category:
        stmt = stmt.where(Transaction.category == category)
    if start_date or end_date:
        if start_date:
            start_dt = datetime(start_date.year, start_date.month, start_date.day, tzinfo=timezone.utc)
            stmt = stmt.where(Transaction.date >= start_dt)
        if end_date:
            end_exclusive = datetime(end_date.year, end_date.month, end_date.day, tzinfo=timezone.utc) + timedelta(days=1)
            stmt = stmt.where(Transaction.date < end_exclusive)
    elif month and year:
        stmt = stmt.where(
            extract('month', Transaction.date) == month,
            extract('year', Transaction.date) == year
        )
    stmt = stmt.order_by(Transaction.date.desc())
    result = await db.execute(stmt)
    transactions = result.scalars().all()

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["date", "description", "category", "type", "payment_method", "amount"])
    for tx in transactions:
        writer.writerow([
            tx.date.isoformat(),
            tx.description or "",
            tx.category.value,
            tx.type.value,
            tx.payment_method.value,
            f"{float(tx.amount):.2f}",
        ])
    csv_content = buffer.getvalue()
    buffer.close()

    return Response(
        content=csv_content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=financial_report.csv"},
    )


@router.get("/transactions/report/print", response_class=HTMLResponse)
async def print_transactions_report(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None, ge=2000, le=2100),
    tx_type: Optional[TransactionType] = Query(None),
    category: Optional[TransactionCategory] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    locale: str = Query("en"),
):
    _ = current_user
    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=400, detail="start_date cannot be after end_date")

    stmt = select(Transaction)
    if tx_type:
        stmt = stmt.where(Transaction.type == tx_type)
    if category:
        stmt = stmt.where(Transaction.category == category)
    if start_date or end_date:
        if start_date:
            start_dt = datetime(start_date.year, start_date.month, start_date.day, tzinfo=timezone.utc)
            stmt = stmt.where(Transaction.date >= start_dt)
        if end_date:
            end_exclusive = datetime(end_date.year, end_date.month, end_date.day, tzinfo=timezone.utc) + timedelta(days=1)
            stmt = stmt.where(Transaction.date < end_exclusive)
    elif month and year:
        stmt = stmt.where(
            extract('month', Transaction.date) == month,
            extract('year', Transaction.date) == year
        )
    stmt = stmt.order_by(Transaction.date.desc())
    result = await db.execute(stmt)
    transactions = result.scalars().all()

    copy = _finance_copy(locale)
    income_total = sum(float(tx.amount) for tx in transactions if tx.type == TransactionType.INCOME)
    expense_total = sum(float(tx.amount) for tx in transactions if tx.type == TransactionType.EXPENSE)
    net_total = income_total - expense_total
    range_text = copy["all_dates"]
    if start_date or end_date:
        range_text = f"{start_date.isoformat() if start_date else '...'} - {end_date.isoformat() if end_date else '...'}"
    elif month and year:
        range_text = f"{month:02d}/{year}"

    rows_html = "".join(
        [
            f"""
            <tr>
              <td>{escape(tx.date.date().isoformat())}</td>
              <td>{escape(tx.description or copy['gym_service_item'])}</td>
              <td>{escape(_finance_label(locale, tx.category.value))}</td>
              <td>{escape(_finance_label(locale, tx.type.value))}</td>
              <td>{escape(_finance_label(locale, tx.payment_method.value))}</td>
              <td class="num">{escape(_format_money(tx.amount))}</td>
            </tr>
            """
            for tx in transactions
        ]
    ) or f"<tr><td colspan='6' class='center'>{escape(copy['rows'])}: 0</td></tr>"

    sections_html = f"""
    <section class="section">
      <h2>{escape(copy['transactions'])}</h2>
      <table>
        <thead>
          <tr>
            <th>{escape(copy['date'])}</th>
            <th>{escape(copy['description'])}</th>
            <th>{escape(copy['category'])}</th>
            <th>{escape(copy['type'])}</th>
            <th>{escape(copy['payment_method'])}</th>
            <th class="num">{escape(copy['amount'])}</th>
          </tr>
        </thead>
        <tbody>{rows_html}</tbody>
      </table>
    </section>
    """

    html = _render_print_document(
        title=copy["report_title"],
        subtitle=copy["report_subtitle"],
        badge=f"{copy['report_badge']}: {len(transactions)}",
        meta_rows=[
            (copy["range"], range_text),
            (copy["type"], _finance_label(locale, tx_type.value) if tx_type else copy["all"]),
            (copy["category"], _finance_label(locale, category.value) if category else copy["all"]),
        ],
        summary_rows=[
            (copy["total_income"], _format_money(income_total)),
            (copy["total_expenses"], _format_money(expense_total)),
            (copy["net_profit"], _format_money(net_total)),
        ],
        total_label=copy["rows"],
        total_value=str(len(transactions)),
        locale=locale,
        details_heading=copy["filters"],
        summary_heading=copy["summary_heading"],
        sections_html=sections_html,
    )
    return HTMLResponse(content=html)


@router.get("/transactions/{transaction_id}/receipt/export-pdf")
async def export_receipt_pdf(
    transaction_id: uuid.UUID,
    current_user: Annotated[User, Depends(dependencies.get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    locale: str = Query("en"),
):
    stmt = select(Transaction).where(Transaction.id == transaction_id)
    result = await db.execute(stmt)
    transaction = result.scalar_one_or_none()

    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    current_admin_or_owner = current_user.role == Role.ADMIN or current_user.id == transaction.user_id
    if not current_admin_or_owner:
        raise HTTPException(status_code=403, detail="Not authorized to export this receipt")

    user_name = "Guest/System"
    if transaction.user_id:
        user_stmt = select(User).where(User.id == transaction.user_id)
        user_result = await db.execute(user_stmt)
        user = user_result.scalar_one_or_none()
        if user:
            user_name = user.full_name

    copy = _finance_copy(locale)
    receipt_no = str(transaction.id)[:8].upper()
    amount_text = _format_money(transaction.amount)
    content = _pdf_table_bytes(
        title=copy["receipt_title"],
        subtitle=f"{copy['receipt_subtitle']}: {user_name}",
        badge=f"{copy['receipt_badge']} {receipt_no}",
        meta_rows=[
            (copy["receipt_no"], receipt_no),
            (copy["date"], transaction.date.isoformat()),
            (copy["billed_to"], user_name),
            (copy["category"], _finance_label(locale, transaction.category.value)),
            (copy["payment_method"], _finance_label(locale, transaction.payment_method.value)),
            (copy["type"], _finance_label(locale, transaction.type.value)),
        ],
        summary_rows=[
            (copy["amount"], amount_text),
            (copy["total"], amount_text),
        ],
        table_title=copy["transactions"],
        table_headers=[copy["description"], copy["category"], copy["type"], copy["payment_method"], copy["amount"]],
        table_rows=[[
            transaction.description or copy["gym_service_item"],
            _finance_label(locale, transaction.category.value),
            _finance_label(locale, transaction.type.value),
            _finance_label(locale, transaction.payment_method.value),
            amount_text,
        ]],
        locale=locale,
    )
    return Response(
        content=content,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="receipt_{str(transaction.id)[:8].upper()}.pdf"'
        },
    )


@router.get("/transactions/report.pdf")
async def export_transactions_report_pdf(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.ADMIN]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None, ge=2000, le=2100),
    tx_type: Optional[TransactionType] = Query(None),
    category: Optional[TransactionCategory] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    locale: str = Query("en"),
):
    _ = current_user
    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=400, detail="start_date cannot be after end_date")

    stmt = select(Transaction)
    if tx_type:
        stmt = stmt.where(Transaction.type == tx_type)
    if category:
        stmt = stmt.where(Transaction.category == category)
    if start_date or end_date:
        if start_date:
            start_dt = datetime(start_date.year, start_date.month, start_date.day, tzinfo=timezone.utc)
            stmt = stmt.where(Transaction.date >= start_dt)
        if end_date:
            end_exclusive = datetime(end_date.year, end_date.month, end_date.day, tzinfo=timezone.utc) + timedelta(days=1)
            stmt = stmt.where(Transaction.date < end_exclusive)
    elif month and year:
        stmt = stmt.where(
            extract('month', Transaction.date) == month,
            extract('year', Transaction.date) == year
        )
    stmt = stmt.order_by(Transaction.date.desc())
    result = await db.execute(stmt)
    transactions = result.scalars().all()

    copy = _finance_copy(locale)
    income_total = sum(float(tx.amount) for tx in transactions if tx.type == TransactionType.INCOME)
    expense_total = sum(float(tx.amount) for tx in transactions if tx.type == TransactionType.EXPENSE)
    net_total = income_total - expense_total

    range_text = copy["all_dates"]
    if start_date or end_date:
        range_text = f"{start_date.isoformat() if start_date else '...'} - {end_date.isoformat() if end_date else '...'}"
    elif month and year:
        range_text = f"{month:02d}/{year}"
    content = _pdf_table_bytes(
        title=copy["report_title"],
        subtitle=copy["report_subtitle"],
        badge=f"{copy['rows']}: {len(transactions)}",
        meta_rows=[
            (copy["range"], range_text),
            (copy["type"], _finance_label(locale, tx_type.value) if tx_type else copy["all"]),
            (copy["category"], _finance_label(locale, category.value) if category else copy["all"]),
        ],
        summary_rows=[
            (copy["total_income"], _format_money(income_total)),
            (copy["total_expenses"], _format_money(expense_total)),
            (copy["net_profit"], _format_money(net_total)),
        ],
        table_title=copy["transactions"],
        table_headers=[copy["date"], copy["description"], copy["category"], copy["type"], copy["payment_method"], copy["amount"]],
        table_rows=[
            [
                tx.date.date().isoformat(),
                tx.description or copy["gym_service_item"],
                _finance_label(locale, tx.category.value),
                _finance_label(locale, tx.type.value),
                _finance_label(locale, tx.payment_method.value),
                _format_money(tx.amount),
            ]
            for tx in transactions
        ],
        locale=locale,
    )
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="financial_report.pdf"'},
    )
