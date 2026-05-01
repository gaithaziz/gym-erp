from typing import Annotated
from datetime import date
import csv
import io
import uuid
from fastapi import APIRouter, Depends, Query, Response
from fastapi.responses import StreamingResponse
from sqlalchemy import false, select
from sqlalchemy.ext.asyncio import AsyncSession
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from pathlib import Path
from reportlab.lib.enums import TA_RIGHT
import arabic_reshaper
from bidi.algorithm import get_display

from app.database import get_db
from app.auth import dependencies
from app.models.user import User
from app.models.enums import Role
from app.models.tenancy import Branch
from app.services.analytics import AnalyticsService
from app.services.tenancy_service import TenancyService
from app.core.responses import StandardResponse

router = APIRouter()

_PDF_FONT_NAME = "AnalyticsPdfFont"
_PDF_FONT_BOLD_NAME = "AnalyticsPdfFontBold"
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
    title_style = ParagraphStyle(
        "AnalyticsPdfTitle",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=16,
        leading=19,
        alignment=alignment,
        textColor=colors.HexColor("#1f2937"),
    )
    subtitle_style = ParagraphStyle(
        "AnalyticsPdfSubtitle",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=10,
        leading=13,
        alignment=alignment,
        textColor=colors.HexColor("#4b5563"),
    )
    cell_style = ParagraphStyle(
        "AnalyticsPdfCell",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=9,
        leading=11,
        alignment=alignment,
    )
    header_style = ParagraphStyle(
        "AnalyticsPdfHeader",
        parent=styles["BodyText"],
        fontName="Helvetica-Bold",
        fontSize=9,
        leading=11,
        alignment=alignment,
        textColor=colors.white,
    )

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=14 * mm,
        rightMargin=14 * mm,
        topMargin=14 * mm,
        bottomMargin=14 * mm,
    )
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

async def _resolve_scope(
    *,
    db: AsyncSession,
    current_user: User,
    gym_id: uuid.UUID | None,
    branch_id: uuid.UUID | None,
) -> tuple[uuid.UUID, list[uuid.UUID]]:
    if current_user.role == Role.SUPER_ADMIN:
        target_gym_id = gym_id or current_user.gym_id
        if branch_id is not None:
            branch = await TenancyService.get_branch_in_gym(db, gym_id=target_gym_id, branch_id=branch_id)
            if branch is None:
                return target_gym_id, []
            return target_gym_id, [branch.id]
        branch_rows = await db.execute(select(Branch.id).where(Branch.gym_id == target_gym_id))
        return target_gym_id, list(branch_rows.scalars().all())
    return current_user.gym_id, await TenancyService.branch_scope_ids(
        db,
        current_user=current_user,
        branch_id=branch_id,
        allow_all_for_admin=True,
    )


@router.get("/dashboard", response_model=StandardResponse)
async def get_dashboard(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    gym_id: uuid.UUID | None = Query(None),
    branch_id: uuid.UUID | None = Query(None),
):
    scoped_gym_id, branch_ids = await _resolve_scope(db=db, current_user=current_user, gym_id=gym_id, branch_id=branch_id)
    stats = await AnalyticsService.get_dashboard_stats(
        db,
        gym_id=scoped_gym_id,
        from_date=from_date,
        to_date=to_date,
        branch_ids=branch_ids,
    )
    return StandardResponse(data=stats)


@router.get("/reports/expiring-subscriptions")
async def export_expiring_subscriptions(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    gym_id: uuid.UUID | None = Query(None),
    branch_id: uuid.UUID | None = Query(None),
):
    scoped_gym_id, branch_ids = await _resolve_scope(db=db, current_user=current_user, gym_id=gym_id, branch_id=branch_id)
    stats = await AnalyticsService.get_dashboard_stats(
        db,
        gym_id=scoped_gym_id,
        from_date=from_date,
        to_date=to_date,
        branch_ids=branch_ids,
    )

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=["user_id", "full_name", "email", "plan_name", "end_date"])
    writer.writeheader()
    writer.writerows(stats.get("expiring_subscriptions", []))
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=expiring_subscriptions_report.csv"},
    )


@router.get("/reports/expiring-subscriptions.pdf")
async def export_expiring_subscriptions_pdf(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    gym_id: uuid.UUID | None = Query(None),
    branch_id: uuid.UUID | None = Query(None),
    locale: str = Query("en"),
):
    scoped_gym_id, branch_ids = await _resolve_scope(db=db, current_user=current_user, gym_id=gym_id, branch_id=branch_id)
    stats = await AnalyticsService.get_dashboard_stats(
        db,
        gym_id=scoped_gym_id,
        from_date=from_date,
        to_date=to_date,
        branch_ids=branch_ids,
    )
    rows = [
        [
            item.get("full_name", ""),
            item.get("email", ""),
            item.get("plan_name", ""),
            item.get("end_date") or "",
        ]
        for item in stats.get("expiring_subscriptions", [])
    ]
    content = _pdf_table_bytes(
        title="Expiring Subscriptions Report",
        subtitle=f"Rows: {len(rows)}",
        rows=rows or [["-", "-", "-", "-"]],
        headers=["Member", "Email", "Plan", "End Date"],
        locale=locale,
    )
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=expiring_subscriptions_report.pdf"},
    )


@router.get("/reports/top-bundles")
async def export_top_bundles(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    gym_id: uuid.UUID | None = Query(None),
    branch_id: uuid.UUID | None = Query(None),
):
    scoped_gym_id, branch_ids = await _resolve_scope(db=db, current_user=current_user, gym_id=gym_id, branch_id=branch_id)
    stats = await AnalyticsService.get_dashboard_stats(
        db,
        gym_id=scoped_gym_id,
        from_date=from_date,
        to_date=to_date,
        branch_ids=branch_ids,
    )

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=["plan_name", "count"])
    writer.writeheader()
    writer.writerows(stats.get("top_bundles", []))
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=top_bundles_report.csv"},
    )


@router.get("/reports/top-bundles.pdf")
async def export_top_bundles_pdf(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    gym_id: uuid.UUID | None = Query(None),
    branch_id: uuid.UUID | None = Query(None),
    locale: str = Query("en"),
):
    scoped_gym_id, branch_ids = await _resolve_scope(db=db, current_user=current_user, gym_id=gym_id, branch_id=branch_id)
    stats = await AnalyticsService.get_dashboard_stats(
        db,
        gym_id=scoped_gym_id,
        from_date=from_date,
        to_date=to_date,
        branch_ids=branch_ids,
    )
    rows = [[item.get("plan_name", ""), str(item.get("count", 0))] for item in stats.get("top_bundles", [])]
    content = _pdf_table_bytes(
        title="Top Bundles Report",
        subtitle=f"Rows: {len(rows)}",
        rows=rows or [["-", "0"]],
        headers=["Plan", "Count"],
        locale=locale,
    )
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=top_bundles_report.pdf"},
    )


@router.get("/attendance", response_model=StandardResponse)
async def get_attendance_trends(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    days: int = 30,
    gym_id: uuid.UUID | None = Query(None),
    branch_id: uuid.UUID | None = Query(None),
):
    scoped_gym_id, branch_ids = await _resolve_scope(db=db, current_user=current_user, gym_id=gym_id, branch_id=branch_id)
    trends = await AnalyticsService.get_attendance_trends(
        days,
        db,
        gym_id=scoped_gym_id,
        branch_ids=branch_ids,
    )
    return StandardResponse(data=trends)


@router.get("/revenue-chart", response_model=StandardResponse)
async def get_revenue_chart(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    days: int = 30,
    gym_id: uuid.UUID | None = Query(None),
    branch_id: uuid.UUID | None = Query(None),
):
    scoped_gym_id, branch_ids = await _resolve_scope(db=db, current_user=current_user, gym_id=gym_id, branch_id=branch_id)
    data = await AnalyticsService.get_revenue_vs_expenses(
        days,
        db,
        gym_id=scoped_gym_id,
        branch_ids=branch_ids,
    )
    return StandardResponse(data=data)


@router.get("/recent-activity", response_model=StandardResponse)
async def get_recent_activity(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    gym_id: uuid.UUID | None = Query(None),
    branch_id: uuid.UUID | None = Query(None),
):
    """Return the last 10 notable events: check-ins, new users, transactions."""
    from sqlalchemy import select as sel
    from app.models.access import AccessLog, AttendanceLog
    from app.models.finance import Transaction

    scoped_gym_id, branch_ids = await _resolve_scope(db=db, current_user=current_user, gym_id=gym_id, branch_id=branch_id)
    events = []

    access_stmt = (
        sel(AccessLog)
        .where(AccessLog.gym_id == scoped_gym_id)
        .order_by(AccessLog.scan_time.desc())
        .limit(10)
    )
    access_stmt = access_stmt.where(AccessLog.branch_id.in_(branch_ids) if branch_ids else false())
    access_result = await db.execute(access_stmt)
    access_logs = access_result.scalars().all()

    att_stmt = (
        sel(AttendanceLog)
        .where(AttendanceLog.gym_id == scoped_gym_id)
        .order_by(AttendanceLog.check_in_time.desc())
        .limit(10)
    )
    att_stmt = att_stmt.where(AttendanceLog.branch_id.in_(branch_ids) if branch_ids else false())
    att_result = await db.execute(att_stmt)
    attendance_logs = att_result.scalars().all()

    user_ids = {log.user_id for log in access_logs} | {log.user_id for log in attendance_logs}
    user_map = {}
    if user_ids:
        users_result = await db.execute(sel(User).where(User.id.in_(list(user_ids))))
        users = users_result.scalars().all()
        user_map = {u.id: u.full_name for u in users}

    for log in access_logs:
        events.append({
            "text": f"{user_map.get(log.user_id, 'Unknown')} scanned - {log.status}",
            "time": log.scan_time.isoformat() if log.scan_time else "",
            "color": "bg-emerald-500" if log.status == "GRANTED" else "bg-red-500",
            "type": "access"
        })

    tx_stmt = (
        sel(Transaction)
        .where(Transaction.gym_id == scoped_gym_id)
        .order_by(Transaction.date.desc())
        .limit(10)
    )
    tx_stmt = tx_stmt.where(Transaction.branch_id.in_(branch_ids) if branch_ids else false())
    tx_result = await db.execute(tx_stmt)
    for tx in tx_result.scalars().all():
        events.append({
            "text": f"{'Income' if tx.type.value == 'INCOME' else 'Expense'}: {float(tx.amount):.2f} JOD - {tx.description or tx.category.value}",
            "time": tx.date.isoformat() if tx.date else "",
            "color": "bg-emerald-500" if tx.type.value == "INCOME" else "bg-red-500",
            "type": "finance"
        })

    for att in attendance_logs:
        events.append({
            "text": f"{user_map.get(att.user_id, 'Unknown')} checked in",
            "time": att.check_in_time.isoformat() if att.check_in_time else "",
            "color": "bg-blue-500",
            "type": "attendance"
        })

    events.sort(key=lambda x: x.get("time", ""), reverse=True)
    return StandardResponse(data=events[:10])



@router.get("/daily-visitors")
async def get_daily_visitors(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    group_by: str = Query("day", pattern="^(day|week)$"),
    format: str = Query("json", pattern="^(json|csv)$"),
    gym_id: uuid.UUID | None = Query(None),
    branch_id: uuid.UUID | None = Query(None),
):
    scoped_gym_id, branch_ids = await _resolve_scope(db=db, current_user=current_user, gym_id=gym_id, branch_id=branch_id)
    data = await AnalyticsService.get_daily_visitors_report(
        db,
        gym_id=scoped_gym_id,
        from_date=from_date,
        to_date=to_date,
        group_by=group_by,
        branch_ids=branch_ids,
    )

    if format == "csv":
        output = io.StringIO()
        if group_by == "week":
            fieldnames = ["week_start", "unique_visitors"]
        else:
            fieldnames = ["date", "unique_visitors"]
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(data)
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=daily_visitors_report.csv"},
        )

    return StandardResponse(data=data)


@router.get("/branch-comparison", response_model=StandardResponse)
async def get_branch_comparison(
    current_user: Annotated[User, Depends(dependencies.RoleChecker([Role.SUPER_ADMIN, Role.ADMIN]))],
    db: Annotated[AsyncSession, Depends(get_db)],
    from_date: date | None = Query(None, alias="from"),
    to_date: date | None = Query(None, alias="to"),
    gym_id: uuid.UUID | None = Query(None),
    branch_id: uuid.UUID | None = Query(None),
):
    scoped_gym_id, branch_ids = await _resolve_scope(db=db, current_user=current_user, gym_id=gym_id, branch_id=branch_id)
    comparison = await AnalyticsService.get_branch_comparison(
        db,
        gym_id=scoped_gym_id,
        branch_ids=branch_ids,
        from_date=from_date,
        to_date=to_date,
    )
    return StandardResponse(data=comparison)
