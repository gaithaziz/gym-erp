import uuid
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import case, false, select, true, func
from app.config import settings
from app.models.access import AccessLog, AttendanceLog, Subscription, SubscriptionStatus, SubscriptionRenewalRequest, RenewalRequestStatus
from app.models.hr import Payroll, PayrollStatus, LeaveRequest, LeaveStatus
from app.models.classes import ClassReservation, ClassReservationStatus, ClassSession
from app.models.user import User
from app.models.tenancy import Branch
from app.services.timezone_service import get_gym_timezone

class AnalyticsService:
    _dashboard_cache: dict[str, tuple[datetime, dict]] = {}
    _dashboard_cache_ttl_seconds = 30

    @staticmethod
    async def get_dashboard_stats(
        db: AsyncSession,
        *,
        gym_id: uuid.UUID,
        from_date: date | None = None,
        to_date: date | None = None,
        branch_ids: list[uuid.UUID] | None = None,
    ):
        from app.models.finance import Transaction, TransactionType

        def _home_branch_scope_expr() -> object:
            if branch_ids is None:
                return true()
            if not branch_ids:
                return false()
            return User.home_branch_id.in_(branch_ids)

        now = datetime.now(timezone.utc)
        branch_cache_key = ",".join(sorted(str(branch_id) for branch_id in branch_ids)) if branch_ids is not None else "all"
        cache_key = f"{gym_id}:{from_date.isoformat() if from_date else 'none'}:{to_date.isoformat() if to_date else 'none'}:{branch_cache_key}"
        bind = db.get_bind()
        use_cache = bool(bind and bind.dialect.name != "sqlite" and settings.APP_ENV == "production")

        if use_cache:
            cache_entry = AnalyticsService._dashboard_cache.get(cache_key)
            if cache_entry and cache_entry[0] > now:
                return cache_entry[1]

        gym_tz = get_gym_timezone()
        now_local = datetime.now(gym_tz)
        start_of_today_local = datetime(now_local.year, now_local.month, now_local.day, tzinfo=gym_tz)
        start_of_today = start_of_today_local.astimezone(timezone.utc)
        start_of_month = datetime(now.year, now.month, 1, tzinfo=timezone.utc)

        date_filters = []
        if from_date:
            date_filters.append(Transaction.date >= datetime(from_date.year, from_date.month, from_date.day, tzinfo=timezone.utc))
        if to_date:
            to_exclusive = datetime(to_date.year, to_date.month, to_date.day, tzinfo=timezone.utc) + timedelta(days=1)
            date_filters.append(Transaction.date < to_exclusive)

        stmt_headcount = select(func.count(AttendanceLog.id)).where(
            AttendanceLog.gym_id == gym_id,
            AttendanceLog.check_in_time >= start_of_today,
            AttendanceLog.check_out_time.is_(None)
        )
        if branch_ids is not None:
            stmt_headcount = stmt_headcount.where(AttendanceLog.branch_id.in_(branch_ids) if branch_ids else false())
        result_hc = await db.execute(stmt_headcount)
        live_headcount = result_hc.scalar() or 0

        # 1b. Today Visitors (non-live): distinct granted scans in local-day window
        stmt_today_visitors = select(func.count(func.distinct(AccessLog.user_id))).where(
            AccessLog.gym_id == gym_id,
            AccessLog.status == "GRANTED",
            AccessLog.scan_time >= start_of_today,
        )
        if branch_ids is not None:
            stmt_today_visitors = stmt_today_visitors.where(AccessLog.branch_id.in_(branch_ids) if branch_ids else false())
        result_today_visitors = await db.execute(stmt_today_visitors)
        today_visitors = result_today_visitors.scalar() or 0
        
        # 2. Today's Revenue
        today_filters = [Transaction.type == TransactionType.INCOME]
        if not from_date:
            today_filters.append(Transaction.date >= start_of_today)
        today_filters.extend(date_filters)
        stmt_today_rev = select(func.sum(Transaction.amount)).where(
            Transaction.gym_id == gym_id,
            *today_filters,
        )
        if branch_ids is not None:
            stmt_today_rev = stmt_today_rev.where(Transaction.branch_id.in_(branch_ids) if branch_ids else false())
        result_today = await db.execute(stmt_today_rev)
        todays_revenue = float(result_today.scalar() or 0.0)
        
        # 3. Active Members
        stmt_members = select(func.count(Subscription.id)).join(User, User.id == Subscription.user_id).where(
            Subscription.gym_id == gym_id,
            Subscription.status == SubscriptionStatus.ACTIVE,
            Subscription.end_date >= now,
        )
        stmt_members = stmt_members.where(_home_branch_scope_expr())
        result_members = await db.execute(stmt_members)
        active_members = result_members.scalar() or 0

        # 4. Monthly Revenue
        month_rev_filters = [Transaction.type == TransactionType.INCOME]
        if not from_date:
            month_rev_filters.append(Transaction.date >= start_of_month)
        month_rev_filters.extend(date_filters)
        stmt_month_rev = select(func.sum(Transaction.amount)).where(
            Transaction.gym_id == gym_id,
            *month_rev_filters,
        )
        if branch_ids is not None:
            stmt_month_rev = stmt_month_rev.where(Transaction.branch_id.in_(branch_ids) if branch_ids else false())
        result_month_rev = await db.execute(stmt_month_rev)
        monthly_revenue = float(result_month_rev.scalar() or 0.0)

        # 5. Monthly Expenses
        month_exp_filters = [Transaction.type == TransactionType.EXPENSE]
        if not from_date:
            month_exp_filters.append(Transaction.date >= start_of_month)
        month_exp_filters.extend(date_filters)
        stmt_month_exp = select(func.sum(Transaction.amount)).where(
            Transaction.gym_id == gym_id,
            *month_exp_filters,
        )
        if branch_ids is not None:
            stmt_month_exp = stmt_month_exp.where(Transaction.branch_id.in_(branch_ids) if branch_ids else false())
        result_month_exp = await db.execute(stmt_month_exp)
        monthly_expenses = float(result_month_exp.scalar() or 0.0)
        
        # 6. Pending Salaries (rough: active staff * avg salary - paid payrolls this month)
        # Simplified: count unpaid payroll records for current month
        stmt_pending = select(func.sum(Payroll.total_pay)).join(User, User.id == Payroll.user_id).where(
            Payroll.gym_id == gym_id,
            Payroll.month == now.month,
            Payroll.year == now.year,
            Payroll.status != PayrollStatus.PAID,
        )
        stmt_pending = stmt_pending.where(_home_branch_scope_expr())
        result_pending = await db.execute(stmt_pending)
        pending_salaries = float(result_pending.scalar() or 0.0)

        # 7. Pending Approvals (Renewals + Leaves + Classes)
        renewal_stmt = select(func.count(SubscriptionRenewalRequest.id)).join(User, User.id == SubscriptionRenewalRequest.user_id).where(
            SubscriptionRenewalRequest.gym_id == gym_id,
            SubscriptionRenewalRequest.status == RenewalRequestStatus.PENDING,
        )
        leave_stmt = select(func.count(LeaveRequest.id)).join(User, User.id == LeaveRequest.user_id).where(
            LeaveRequest.gym_id == gym_id,
            LeaveRequest.status == LeaveStatus.PENDING,
        )
        class_res_stmt = select(func.count(ClassReservation.id)).join(ClassSession, ClassSession.id == ClassReservation.session_id).where(
            ClassReservation.gym_id == gym_id,
            ClassSession.gym_id == gym_id,
            ClassReservation.status == ClassReservationStatus.PENDING,
        )

        branch_user_filter = _home_branch_scope_expr()
        renewal_stmt = renewal_stmt.where(branch_user_filter)
        leave_stmt = leave_stmt.where(branch_user_filter)
        if branch_ids is not None:
            class_res_stmt = class_res_stmt.where(ClassSession.branch_id.in_(branch_ids) if branch_ids else false())

        renewal_count = (await db.execute(renewal_stmt)).scalar() or 0
        leave_count = (await db.execute(leave_stmt)).scalar() or 0
        class_res_count = (await db.execute(class_res_stmt)).scalar() or 0

        pending_approvals = renewal_count + leave_count + class_res_count

        payload = {
            "live_headcount": live_headcount,
            "today_visitors": today_visitors,
            "todays_revenue": todays_revenue,
            "active_members": active_members,
            "monthly_revenue": monthly_revenue,
            "monthly_expenses": monthly_expenses,
            "pending_salaries": pending_salaries,
            "pending_approvals": pending_approvals,
        }
        if use_cache:
            AnalyticsService._dashboard_cache[cache_key] = (
                now + timedelta(seconds=AnalyticsService._dashboard_cache_ttl_seconds),
                payload,
            )
        return payload

    @staticmethod
    async def get_revenue_vs_expenses(
        days: int,
        db: AsyncSession,
        *,
        gym_id: uuid.UUID,
        branch_ids: list[uuid.UUID] | None = None,
    ):
        """Get daily revenue vs expenses for the last N days, for chart."""
        from app.models.finance import Transaction, TransactionType

        start_date = datetime.now(timezone.utc) - timedelta(days=days)
        
        stmt = select(Transaction.date, Transaction.type, Transaction.amount).where(
            Transaction.gym_id == gym_id,
            Transaction.date >= start_date
        )
        if branch_ids is not None:
            stmt = stmt.where(Transaction.branch_id.in_(branch_ids) if branch_ids else false())
        result = await db.execute(stmt)
        rows = result.all()
        
        daily_data: dict[str, dict[str, float | str]] = {}
        for row_date, row_type, row_amount in rows:
            day_key = row_date.date().isoformat()
            if day_key not in daily_data:
                daily_data[day_key] = {"date": day_key, "revenue": 0.0, "expenses": 0.0}
            if row_type == TransactionType.INCOME:
                daily_data[day_key]["revenue"] += float(row_amount)
            else:
                daily_data[day_key]["expenses"] += float(row_amount)
        
        chart_data = [daily_data[key] for key in sorted(daily_data.keys())]
        return chart_data

    @staticmethod
    async def get_attendance_trends(
        days: int,
        db: AsyncSession,
        *,
        gym_id: uuid.UUID,
        branch_ids: list[uuid.UUID] | None = None,
    ):
        start_date = datetime.now(timezone.utc) - timedelta(days=days)
        
        stmt = select(AttendanceLog.check_in_time).where(
            AttendanceLog.gym_id == gym_id,
            AttendanceLog.check_in_time >= start_date,
        )
        if branch_ids is not None:
            stmt = stmt.where(AttendanceLog.branch_id.in_(branch_ids) if branch_ids else false())
        result = await db.execute(stmt)
        logs = result.scalars().all()
        
        # Aggregate by hour for "Visits by Hour" chart
        hourly_counts = {}
        for log_time in logs:
            hour = log_time.strftime("%I %p")  # "09 AM"
            hourly_counts[hour] = hourly_counts.get(hour, 0) + 1
            
        trends = [{"hour": k, "visits": v} for k, v in hourly_counts.items()]
        trends.sort(key=lambda x: x["hour"])
        return trends

    @staticmethod
    async def get_daily_visitors_report(
        db: AsyncSession,
        *,
        gym_id: uuid.UUID,
        from_date: date | None = None,
        to_date: date | None = None,
        group_by: str = "day",
        branch_ids: list[uuid.UUID] | None = None,
    ):
        gym_tz = get_gym_timezone()
        now_local = datetime.now(gym_tz)

        effective_from = from_date or (now_local.date() - timedelta(days=29))
        effective_to = to_date or now_local.date()

        start_local = datetime(effective_from.year, effective_from.month, effective_from.day, tzinfo=gym_tz)
        end_local_exclusive = datetime(effective_to.year, effective_to.month, effective_to.day, tzinfo=gym_tz) + timedelta(days=1)

        start_utc = start_local.astimezone(timezone.utc)
        end_utc = end_local_exclusive.astimezone(timezone.utc)

        stmt = select(AccessLog.user_id, AccessLog.scan_time).where(
            AccessLog.gym_id == gym_id,
            AccessLog.status == "GRANTED",
            AccessLog.scan_time >= start_utc,
            AccessLog.scan_time < end_utc,
        )
        if branch_ids is not None:
            stmt = stmt.where(AccessLog.branch_id.in_(branch_ids) if branch_ids else false())
        result = await db.execute(stmt)
        rows = result.all()

        daily_users: dict[str, set] = defaultdict(set)
        for user_id, scan_time in rows:
            local_dt = scan_time.astimezone(gym_tz) if scan_time.tzinfo else scan_time.replace(tzinfo=timezone.utc).astimezone(gym_tz)
            day_key = local_dt.date().isoformat()
            daily_users[day_key].add(str(user_id))

        daily_rows = [{"date": day_key, "unique_visitors": len(user_ids)} for day_key, user_ids in sorted(daily_users.items())]

        if group_by == "week":
            weekly_totals: dict[str, int] = defaultdict(int)
            for row in daily_rows:
                row_date = datetime.fromisoformat(row["date"]).date()
                week_start = row_date - timedelta(days=row_date.weekday())
                weekly_totals[week_start.isoformat()] += int(row["unique_visitors"])
            return [{"week_start": key, "unique_visitors": weekly_totals[key]} for key in sorted(weekly_totals.keys())]

        return daily_rows

    @staticmethod
    async def get_branch_comparison(
        db: AsyncSession,
        *,
        gym_id: uuid.UUID,
        branch_ids: list[uuid.UUID] | None = None,
        from_date: date | None = None,
        to_date: date | None = None,
    ) -> dict:
        from app.models.finance import Transaction, TransactionType
        from app.models.inventory import Product

        gym_tz = get_gym_timezone()
        now_local = datetime.now(gym_tz)
        today_start_local = datetime(now_local.year, now_local.month, now_local.day, tzinfo=gym_tz)
        today_start_utc = today_start_local.astimezone(timezone.utc)

        effective_from = from_date or (now_local.date() - timedelta(days=29))
        effective_to = to_date or now_local.date()
        current_start = datetime(effective_from.year, effective_from.month, effective_from.day, tzinfo=timezone.utc)
        current_end_exclusive = datetime(effective_to.year, effective_to.month, effective_to.day, tzinfo=timezone.utc) + timedelta(days=1)

        period_days = max(1, (current_end_exclusive.date() - current_start.date()).days)
        previous_end_exclusive = current_start
        previous_start = previous_end_exclusive - timedelta(days=period_days)

        branch_stmt = select(Branch.id, Branch.name, Branch.display_name).where(
            Branch.gym_id == gym_id,
            Branch.is_active.is_(True),
        )
        if branch_ids is not None:
            branch_stmt = branch_stmt.where(Branch.id.in_(branch_ids) if branch_ids else false())
        branch_rows = (await db.execute(branch_stmt.order_by(Branch.name.asc()))).all()
        if not branch_rows:
            return {"total_branches": 0, "top_branch": None, "bottom_branch": None, "branches": []}

        ordered_branch_ids = [row.id for row in branch_rows]
        branch_meta = {
            row.id: (row.display_name or row.name or "Unknown Branch")
            for row in branch_rows
        }

        def _default_branch_row(branch_id: uuid.UUID) -> dict:
            return {
                "branch_id": str(branch_id),
                "branch_name": branch_meta.get(branch_id, "Unknown Branch"),
                "total_income": 0.0,
                "total_expenses": 0.0,
                "net_profit": 0.0,
                "todays_revenue": 0.0,
                "today_visitors": 0,
                "attendance_events": 0,
                "low_stock_count": 0,
                "revenue_delta_pct": 0.0,
            }

        comparison = {branch_id: _default_branch_row(branch_id) for branch_id in ordered_branch_ids}

        tx_rows = (
            await db.execute(
                select(
                    Transaction.branch_id,
                    Transaction.type,
                    func.sum(Transaction.amount),
                )
                .where(
                    Transaction.gym_id == gym_id,
                    Transaction.branch_id.in_(ordered_branch_ids),
                    Transaction.date >= current_start,
                    Transaction.date < current_end_exclusive,
                )
                .group_by(Transaction.branch_id, Transaction.type)
            )
        ).all()
        for branch_id, tx_type, amount in tx_rows:
            if branch_id not in comparison:
                continue
            numeric_amount = float(amount or 0)
            if tx_type == TransactionType.INCOME:
                comparison[branch_id]["total_income"] = numeric_amount
            elif tx_type == TransactionType.EXPENSE:
                comparison[branch_id]["total_expenses"] = numeric_amount

        today_rev_rows = (
            await db.execute(
                select(Transaction.branch_id, func.sum(Transaction.amount))
                .where(
                    Transaction.gym_id == gym_id,
                    Transaction.branch_id.in_(ordered_branch_ids),
                    Transaction.type == TransactionType.INCOME,
                    Transaction.date >= today_start_utc,
                )
                .group_by(Transaction.branch_id)
            )
        ).all()
        for branch_id, amount in today_rev_rows:
            if branch_id in comparison:
                comparison[branch_id]["todays_revenue"] = float(amount or 0)

        visitor_rows = (
            await db.execute(
                select(AccessLog.branch_id, func.count(func.distinct(AccessLog.user_id)))
                .where(
                    AccessLog.gym_id == gym_id,
                    AccessLog.branch_id.in_(ordered_branch_ids),
                    AccessLog.status == "GRANTED",
                    AccessLog.scan_time >= today_start_utc,
                )
                .group_by(AccessLog.branch_id)
            )
        ).all()
        for branch_id, visitor_count in visitor_rows:
            if branch_id in comparison:
                comparison[branch_id]["today_visitors"] = int(visitor_count or 0)

        attendance_rows = (
            await db.execute(
                select(AttendanceLog.branch_id, func.count(AttendanceLog.id))
                .where(
                    AttendanceLog.gym_id == gym_id,
                    AttendanceLog.branch_id.in_(ordered_branch_ids),
                    AttendanceLog.check_in_time >= current_start,
                    AttendanceLog.check_in_time < current_end_exclusive,
                )
                .group_by(AttendanceLog.branch_id)
            )
        ).all()
        for branch_id, count in attendance_rows:
            if branch_id in comparison:
                comparison[branch_id]["attendance_events"] = int(count or 0)

        low_stock_rows = (
            await db.execute(
                select(Product.branch_id, func.count(Product.id))
                .where(
                    Product.gym_id == gym_id,
                    Product.branch_id.in_(ordered_branch_ids),
                    Product.is_active.is_(True),
                    Product.stock_quantity <= Product.low_stock_threshold,
                )
                .group_by(Product.branch_id)
            )
        ).all()
        for branch_id, count in low_stock_rows:
            if branch_id in comparison:
                comparison[branch_id]["low_stock_count"] = int(count or 0)

        prev_net_rows = (
            await db.execute(
                select(
                    Transaction.branch_id,
                    func.sum(
                        case(
                            (Transaction.type == TransactionType.INCOME, Transaction.amount),
                            else_=-Transaction.amount,
                        )
                    ),
                )
                .where(
                    Transaction.gym_id == gym_id,
                    Transaction.branch_id.in_(ordered_branch_ids),
                    Transaction.date >= previous_start,
                    Transaction.date < previous_end_exclusive,
                )
                .group_by(Transaction.branch_id)
            )
        ).all()
        previous_net = {branch_id: float(net or 0) for branch_id, net in prev_net_rows}

        branch_rows_out: list[dict] = []
        for branch_id in ordered_branch_ids:
            row = comparison[branch_id]
            row["net_profit"] = float(row["total_income"] - row["total_expenses"])
            prev = previous_net.get(branch_id, 0.0)
            if prev == 0:
                row["revenue_delta_pct"] = 100.0 if row["net_profit"] > 0 else 0.0
            else:
                row["revenue_delta_pct"] = ((row["net_profit"] - prev) / abs(prev)) * 100.0
            branch_rows_out.append(row)

        ranked = sorted(branch_rows_out, key=lambda item: item["net_profit"], reverse=True)
        top_branch = ranked[0] if ranked else None
        bottom_branch = ranked[-1] if ranked else None

        return {
            "total_branches": len(branch_rows_out),
            "top_branch": top_branch,
            "bottom_branch": bottom_branch,
            "branches": ranked,
        }
