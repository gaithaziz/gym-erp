import asyncio
import logging
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import delete, select
from sqlalchemy.orm import selectinload

from app.auth.security import get_password_hash
from app.database import AsyncSessionLocal
from app.models.access import AccessLog, AttendanceLog, Subscription
from app.models.audit import AuditLog
from app.models.enums import Role
from app.models.finance import (
    PaymentMethod,
    Transaction,
    TransactionCategory,
    TransactionType,
)
from app.models.fitness import BiometricLog, DietPlan, Exercise, WorkoutExercise, WorkoutPlan
from app.models.gamification import AttendanceStreak, Badge
from app.models.hr import (
    Contract,
    ContractType,
    LeaveRequest,
    LeaveStatus,
    LeaveType,
    Payroll,
    PayrollStatus,
)
from app.models.inventory import Product, ProductCategory
from app.models.subscription_enums import SubscriptionStatus
from app.models.user import User
from app.models.workout_log import WorkoutLog

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DEMO_PASSWORD = "DemoPass123!"
DEMO_KIOSK_ID = "demo-seed-kiosk-01"
DEMO_TAG = "[DEMO]"


DEMO_USERS = [
    {
        "email": "admin.demo@gym-erp.com",
        "full_name": "Avery Admin",
        "role": Role.ADMIN,
        "phone_number": "+1-555-100-2000",
        "date_of_birth": date(1990, 5, 14),
        "emergency_contact": "Jordan Admin - +1-555-000-1111",
        "bio": "Operations lead for demo branch.",
    },
    {
        "email": "coach.demo@gym-erp.com",
        "full_name": "Casey Coach",
        "role": Role.COACH,
        "phone_number": "+1-555-100-2001",
        "date_of_birth": date(1992, 7, 22),
        "emergency_contact": "Taylor Coach - +1-555-000-1112",
        "bio": "Strength and conditioning coach.",
    },
    {
        "email": "staff.frontdesk.demo@gym-erp.com",
        "full_name": "Morgan Frontdesk",
        "role": Role.EMPLOYEE,
        "phone_number": "+1-555-100-2002",
        "date_of_birth": date(1995, 1, 9),
        "emergency_contact": "Rowan Frontdesk - +1-555-000-1113",
        "bio": "Front desk and member support.",
    },
    {
        "email": "staff.maint.demo@gym-erp.com",
        "full_name": "Blake Maintenance",
        "role": Role.EMPLOYEE,
        "phone_number": "+1-555-100-2003",
        "date_of_birth": date(1988, 11, 3),
        "emergency_contact": "Alex Maintenance - +1-555-000-1114",
        "bio": "Facility and equipment maintenance.",
    },
    {
        "email": "member.anna.demo@gym-erp.com",
        "full_name": "Anna Rivera",
        "role": Role.CUSTOMER,
        "phone_number": "+1-555-100-3001",
        "date_of_birth": date(1998, 2, 18),
        "emergency_contact": "Luis Rivera - +1-555-700-1001",
        "bio": "Cutting phase member focused on consistency.",
    },
    {"email": "member.leo.demo@gym-erp.com", "full_name": "Leo Grant", "role": Role.CUSTOMER},
    {"email": "member.maya.demo@gym-erp.com", "full_name": "Maya Brooks", "role": Role.CUSTOMER},
    {"email": "member.noah.demo@gym-erp.com", "full_name": "Noah Patel", "role": Role.CUSTOMER},
    {"email": "member.olivia.demo@gym-erp.com", "full_name": "Olivia Chen", "role": Role.CUSTOMER},
    {"email": "member.ethan.demo@gym-erp.com", "full_name": "Ethan Ross", "role": Role.CUSTOMER},
    {"email": "member.sophia.demo@gym-erp.com", "full_name": "Sophia Miles", "role": Role.CUSTOMER},
    {"email": "member.liam.demo@gym-erp.com", "full_name": "Liam Foster", "role": Role.CUSTOMER},
    {"email": "member.emma.demo@gym-erp.com", "full_name": "Emma Hall", "role": Role.CUSTOMER},
    {"email": "member.david.demo@gym-erp.com", "full_name": "David Stone", "role": Role.CUSTOMER},
]

SUBSCRIPTIONS_BY_EMAIL = {
    "member.anna.demo@gym-erp.com": ("Elite 12M", SubscriptionStatus.ACTIVE, -60, 120),
    "member.leo.demo@gym-erp.com": ("Pro 3M", SubscriptionStatus.ACTIVE, -20, 40),
    "member.maya.demo@gym-erp.com": ("Starter 1M", SubscriptionStatus.FROZEN, -10, 20),
    "member.noah.demo@gym-erp.com": ("Starter 1M", SubscriptionStatus.EXPIRED, -60, -3),
    "member.olivia.demo@gym-erp.com": ("Pro 3M", SubscriptionStatus.ACTIVE, -14, 75),
    "member.ethan.demo@gym-erp.com": ("Elite 12M", SubscriptionStatus.ACTIVE, -120, 190),
    "member.sophia.demo@gym-erp.com": ("Pro 3M", SubscriptionStatus.ACTIVE, -30, 30),
    "member.liam.demo@gym-erp.com": ("Starter 1M", SubscriptionStatus.ACTIVE, -5, 25),
    "member.emma.demo@gym-erp.com": ("Pro 3M", SubscriptionStatus.EXPIRED, -100, -10),
    "member.david.demo@gym-erp.com": ("Starter 1M", SubscriptionStatus.FROZEN, -25, 5),
}


async def _upsert_user(session, payload: dict) -> User:
    stmt = select(User).where(User.email == payload["email"])
    result = await session.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        user = User(
            email=payload["email"],
            hashed_password=get_password_hash(DEMO_PASSWORD),
            full_name=payload["full_name"],
            role=payload["role"],
            is_active=True,
        )
        session.add(user)
        await session.flush()
    else:
        user.full_name = payload["full_name"]
        user.role = payload["role"]
        user.hashed_password = get_password_hash(DEMO_PASSWORD)
        user.is_active = True

    user.phone_number = payload.get("phone_number")
    user.date_of_birth = payload.get("date_of_birth")
    user.emergency_contact = payload.get("emergency_contact")
    user.bio = payload.get("bio")
    return user


async def _upsert_subscription(
    session,
    *,
    user: User,
    plan_name: str,
    status: SubscriptionStatus,
    start_offset_days: int,
    end_offset_days: int,
):
    stmt = select(Subscription).where(Subscription.user_id == user.id)
    result = await session.execute(stmt)
    sub = result.scalar_one_or_none()

    now = datetime.now(timezone.utc)
    start_date = now + timedelta(days=start_offset_days)
    end_date = now + timedelta(days=end_offset_days)

    if not sub:
        sub = Subscription(
            user_id=user.id,
            plan_name=plan_name,
            start_date=start_date,
            end_date=end_date,
            status=status,
        )
        session.add(sub)
    else:
        sub.plan_name = plan_name
        sub.start_date = start_date
        sub.end_date = end_date
        sub.status = status


async def _upsert_contract(
    session,
    *,
    user: User,
    contract_type: ContractType,
    base_salary: float,
    commission_rate: float = 0.0,
):
    stmt = select(Contract).where(Contract.user_id == user.id)
    result = await session.execute(stmt)
    contract = result.scalar_one_or_none()
    if not contract:
        contract = Contract(
            user_id=user.id,
            start_date=date.today() - timedelta(days=90),
            base_salary=base_salary,
            contract_type=contract_type,
            standard_hours=160,
            commission_rate=commission_rate,
        )
        session.add(contract)
    else:
        contract.base_salary = base_salary
        contract.contract_type = contract_type
        contract.commission_rate = commission_rate
        contract.standard_hours = 160


async def _upsert_product(session, payload: dict):
    stmt = select(Product).where(Product.sku == payload["sku"])
    result = await session.execute(stmt)
    product = result.scalar_one_or_none()
    if not product:
        product = Product(**payload)
        session.add(product)
    else:
        for key, value in payload.items():
            setattr(product, key, value)


async def _upsert_transaction(
    session,
    *,
    key: str,
    amount: float,
    tx_type: TransactionType,
    category: TransactionCategory,
    description: str,
    when: datetime,
    payment_method: PaymentMethod,
    user_id: uuid.UUID | None = None,
):
    stmt = select(Transaction).where(Transaction.idempotency_key == key)
    result = await session.execute(stmt)
    tx = result.scalar_one_or_none()
    if not tx:
        tx = Transaction(
            idempotency_key=key,
            amount=Decimal(f"{amount:.2f}"),
            type=tx_type,
            category=category,
            description=description,
            date=when,
            payment_method=payment_method,
            user_id=user_id,
        )
        session.add(tx)
    else:
        tx.amount = Decimal(f"{amount:.2f}")
        tx.type = tx_type
        tx.category = category
        tx.description = description
        tx.date = when
        tx.payment_method = payment_method
        tx.user_id = user_id


async def seed_demo_data():
    async with AsyncSessionLocal() as session:
        logger.info("Seeding demo users...")
        users_by_email: dict[str, User] = {}
        for payload in DEMO_USERS:
            user = await _upsert_user(session, payload)
            users_by_email[user.email] = user
        await session.commit()

        logger.info("Seeding subscriptions...")
        for email, (plan, status, start_offset, end_offset) in SUBSCRIPTIONS_BY_EMAIL.items():
            user = users_by_email[email]
            await _upsert_subscription(
                session,
                user=user,
                plan_name=plan,
                status=status,
                start_offset_days=start_offset,
                end_offset_days=end_offset,
            )
        await session.commit()

        logger.info("Seeding contracts...")
        await _upsert_contract(
            session,
            user=users_by_email["coach.demo@gym-erp.com"],
            contract_type=ContractType.HYBRID,
            base_salary=2800.0,
            commission_rate=0.12,
        )
        await _upsert_contract(
            session,
            user=users_by_email["staff.frontdesk.demo@gym-erp.com"],
            contract_type=ContractType.FULL_TIME,
            base_salary=1900.0,
        )
        await _upsert_contract(
            session,
            user=users_by_email["staff.maint.demo@gym-erp.com"],
            contract_type=ContractType.PART_TIME,
            base_salary=1200.0,
        )
        await session.commit()

        logger.info("Seeding payroll records...")
        payroll_targets = [
            users_by_email["coach.demo@gym-erp.com"],
            users_by_email["staff.frontdesk.demo@gym-erp.com"],
            users_by_email["staff.maint.demo@gym-erp.com"],
        ]
        now = datetime.now(timezone.utc)
        for idx, user in enumerate(payroll_targets):
            stmt = select(Payroll).where(
                Payroll.user_id == user.id,
                Payroll.month == now.month,
                Payroll.year == now.year,
            )
            result = await session.execute(stmt)
            payroll = result.scalar_one_or_none()
            base = 1200.0 + (idx * 800.0)
            overtime = 120.0 + (idx * 35.0)
            bonus = 250.0 + (idx * 40.0)
            deductions = 60.0 + (idx * 20.0)
            total = base + overtime + bonus - deductions
            if not payroll:
                payroll = Payroll(
                    user_id=user.id,
                    month=now.month,
                    year=now.year,
                    base_pay=base,
                    overtime_hours=6.0 + idx,
                    overtime_pay=overtime,
                    commission_pay=150.0 if user.role == Role.COACH else 0.0,
                    bonus_pay=bonus,
                    deductions=deductions,
                    total_pay=total,
                    status=PayrollStatus.DRAFT,
                )
                session.add(payroll)
            else:
                payroll.base_pay = base
                payroll.overtime_pay = overtime
                payroll.bonus_pay = bonus
                payroll.deductions = deductions
                payroll.total_pay = total
                payroll.status = PayrollStatus.DRAFT
        await session.commit()

        logger.info("Seeding leave requests...")
        leave_payloads = [
            (
                users_by_email["coach.demo@gym-erp.com"].id,
                date.today() + timedelta(days=2),
                date.today() + timedelta(days=4),
                LeaveType.VACATION,
                LeaveStatus.PENDING,
                f"{DEMO_TAG} Planned short vacation",
            ),
            (
                users_by_email["staff.frontdesk.demo@gym-erp.com"].id,
                date.today() - timedelta(days=12),
                date.today() - timedelta(days=10),
                LeaveType.SICK,
                LeaveStatus.APPROVED,
                f"{DEMO_TAG} Recovery leave",
            ),
            (
                users_by_email["staff.maint.demo@gym-erp.com"].id,
                date.today() - timedelta(days=20),
                date.today() - timedelta(days=18),
                LeaveType.OTHER,
                LeaveStatus.DENIED,
                f"{DEMO_TAG} Personal errand",
            ),
        ]
        for user_id, start_d, end_d, leave_type, status, reason in leave_payloads:
            stmt = select(LeaveRequest).where(
                LeaveRequest.user_id == user_id,
                LeaveRequest.start_date == start_d,
                LeaveRequest.end_date == end_d,
                LeaveRequest.reason == reason,
            )
            result = await session.execute(stmt)
            leave = result.scalar_one_or_none()
            if not leave:
                leave = LeaveRequest(
                    user_id=user_id,
                    start_date=start_d,
                    end_date=end_d,
                    leave_type=leave_type,
                    status=status,
                    reason=reason,
                )
                session.add(leave)
            else:
                leave.leave_type = leave_type
                leave.status = status
        await session.commit()

        logger.info("Seeding inventory...")
        products = [
            {"name": "Whey Protein 2LB", "sku": "DEMO-PRO-001", "category": ProductCategory.SUPPLEMENT, "price": 49.99, "cost_price": 29.0, "stock_quantity": 14, "low_stock_threshold": 5, "low_stock_restock_target": 20, "image_url": None, "is_active": True},
            {"name": "Creatine Monohydrate", "sku": "DEMO-PRO-002", "category": ProductCategory.SUPPLEMENT, "price": 29.50, "cost_price": 16.0, "stock_quantity": 4, "low_stock_threshold": 5, "low_stock_restock_target": 18, "image_url": None, "is_active": True},
            {"name": "BCAA Drink", "sku": "DEMO-PRO-003", "category": ProductCategory.DRINK, "price": 4.50, "cost_price": 1.7, "stock_quantity": 32, "low_stock_threshold": 10, "low_stock_restock_target": 40, "image_url": None, "is_active": True},
            {"name": "Electrolyte Water", "sku": "DEMO-PRO-004", "category": ProductCategory.DRINK, "price": 2.50, "cost_price": 0.9, "stock_quantity": 8, "low_stock_threshold": 10, "low_stock_restock_target": 36, "image_url": None, "is_active": True},
            {"name": "Gym T-Shirt Black", "sku": "DEMO-PRO-005", "category": ProductCategory.MERCHANDISE, "price": 22.0, "cost_price": 9.5, "stock_quantity": 11, "low_stock_threshold": 4, "low_stock_restock_target": 20, "image_url": None, "is_active": True},
            {"name": "Shaker Bottle 700ml", "sku": "DEMO-PRO-006", "category": ProductCategory.MERCHANDISE, "price": 11.0, "cost_price": 3.8, "stock_quantity": 26, "low_stock_threshold": 8, "low_stock_restock_target": 30, "image_url": None, "is_active": True},
            {"name": "Protein Bar Chocolate", "sku": "DEMO-PRO-007", "category": ProductCategory.SNACK, "price": 3.00, "cost_price": 1.1, "stock_quantity": 21, "low_stock_threshold": 12, "low_stock_restock_target": 35, "image_url": None, "is_active": True},
            {"name": "Mixed Nuts Pack", "sku": "DEMO-PRO-008", "category": ProductCategory.SNACK, "price": 5.25, "cost_price": 2.2, "stock_quantity": 3, "low_stock_threshold": 6, "low_stock_restock_target": 20, "image_url": None, "is_active": True},
        ]
        for payload in products:
            await _upsert_product(session, payload)
        await session.commit()

        logger.info("Seeding transactions...")
        hero_user = users_by_email["member.anna.demo@gym-erp.com"]
        base_date = datetime.now(timezone.utc)
        for day in range(45):
            when = base_date - timedelta(days=day, hours=day % 6)
            await _upsert_transaction(
                session,
                key=f"demo-seed-income-{day}",
                amount=59.0 + (day % 5) * 10.0,
                tx_type=TransactionType.INCOME,
                category=TransactionCategory.SUBSCRIPTION if day % 3 else TransactionCategory.OTHER_INCOME,
                description=f"{DEMO_TAG} Membership payment batch #{day + 1}",
                when=when,
                payment_method=PaymentMethod.CARD if day % 2 else PaymentMethod.CASH,
                user_id=hero_user.id if day % 4 == 0 else None,
            )

            if day % 4 == 0:
                await _upsert_transaction(
                    session,
                    key=f"demo-seed-pos-{day}",
                    amount=18.0 + (day % 7) * 3.0,
                    tx_type=TransactionType.INCOME,
                    category=TransactionCategory.POS_SALE,
                    description=f"{DEMO_TAG} POS sale bundle #{day + 1}",
                    when=when + timedelta(minutes=35),
                    payment_method=PaymentMethod.CASH,
                    user_id=hero_user.id if day % 8 == 0 else None,
                )

            if day % 5 == 0:
                await _upsert_transaction(
                    session,
                    key=f"demo-seed-expense-{day}",
                    amount=75.0 + (day % 6) * 22.0,
                    tx_type=TransactionType.EXPENSE,
                    category=TransactionCategory.UTILITIES if day % 10 else TransactionCategory.MAINTENANCE,
                    description=f"{DEMO_TAG} Operating expense #{day + 1}",
                    when=when + timedelta(hours=2),
                    payment_method=PaymentMethod.TRANSFER,
                    user_id=None,
                )
        await session.commit()

        logger.info("Seeding access logs...")
        member_emails = [email for email, user in users_by_email.items() if user.role == Role.CUSTOMER]
        for day in range(21):
            for idx, email in enumerate(member_emails[:6]):
                member = users_by_email[email]
                scan_time = (base_date - timedelta(days=day)).replace(hour=6 + ((day + idx) % 14), minute=10 + idx, second=0, microsecond=0)
                key_stmt = select(AccessLog).where(
                    AccessLog.user_id == member.id,
                    AccessLog.scan_time == scan_time,
                    AccessLog.kiosk_id == DEMO_KIOSK_ID,
                )
                existing = (await session.execute(key_stmt)).scalar_one_or_none()
                if existing:
                    continue

                _, status, _, end_offset = SUBSCRIPTIONS_BY_EMAIL[email]
                reason = None
                decision = "GRANTED"
                if status == SubscriptionStatus.FROZEN:
                    decision = "DENIED"
                    reason = "SUBSCRIPTION_FROZEN"
                elif status == SubscriptionStatus.EXPIRED or end_offset < 0:
                    decision = "DENIED"
                    reason = "SUBSCRIPTION_EXPIRED"

                session.add(
                    AccessLog(
                        user_id=member.id,
                        kiosk_id=DEMO_KIOSK_ID,
                        scan_time=scan_time,
                        status=decision,
                        reason=reason,
                    )
                )
        await session.commit()

        logger.info("Seeding attendance logs...")
        staff_users = [
            users_by_email["coach.demo@gym-erp.com"],
            users_by_email["staff.frontdesk.demo@gym-erp.com"],
            users_by_email["staff.maint.demo@gym-erp.com"],
        ]
        start_window = date.today() - timedelta(days=14)
        for day in range(14):
            day_date = start_window + timedelta(days=day)
            if day_date.weekday() >= 6:
                continue

            for idx, member in enumerate(staff_users):
                check_in = datetime.combine(day_date, datetime.min.time(), tzinfo=timezone.utc).replace(hour=8 + idx, minute=15)
                check_out = check_in + timedelta(hours=8, minutes=20 - (idx * 5))

                stmt = select(AttendanceLog).where(
                    AttendanceLog.user_id == member.id,
                    AttendanceLog.check_in_time == check_in,
                )
                existing = (await session.execute(stmt)).scalar_one_or_none()
                if existing:
                    continue

                session.add(
                    AttendanceLog(
                        user_id=member.id,
                        check_in_time=check_in,
                        check_out_time=check_out,
                        hours_worked=round((check_out - check_in).total_seconds() / 3600.0, 2),
                    )
                )

        frontdesk = users_by_email["staff.frontdesk.demo@gym-erp.com"]
        open_stmt = select(AttendanceLog).where(
            AttendanceLog.user_id == frontdesk.id,
            AttendanceLog.check_out_time.is_(None),
        )
        open_log = (await session.execute(open_stmt)).scalar_one_or_none()
        if not open_log:
            now_utc = datetime.now(timezone.utc)
            session.add(
                AttendanceLog(
                    user_id=frontdesk.id,
                    check_in_time=now_utc - timedelta(hours=2),
                    check_out_time=None,
                    hours_worked=0.0,
                )
            )
        await session.commit()

        logger.info("Seeding exercises, workout plans, diets, workout logs, biometrics...")
        exercise_defs = [
            ("Demo Bench Press", "Chest"),
            ("Demo Incline Dumbbell Press", "Chest"),
            ("Demo Lat Pulldown", "Back"),
            ("Demo Seated Row", "Back"),
            ("Demo Barbell Squat", "Legs"),
            ("Demo Romanian Deadlift", "Legs"),
            ("Demo Shoulder Press", "Shoulders"),
            ("Demo Treadmill Intervals", "Cardio"),
        ]
        exercise_map: dict[str, Exercise] = {}
        for name, category in exercise_defs:
            stmt = select(Exercise).where(Exercise.name == name)
            existing = (await session.execute(stmt)).scalar_one_or_none()
            if not existing:
                existing = Exercise(
                    name=name,
                    category=category,
                    description=f"{DEMO_TAG} {category} movement",
                    video_url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                )
                session.add(existing)
                await session.flush()
            exercise_map[name] = existing

        coach = users_by_email["coach.demo@gym-erp.com"]
        anna = users_by_email["member.anna.demo@gym-erp.com"]
        leo = users_by_email["member.leo.demo@gym-erp.com"]

        plan_defs = [
            (
                "Demo Full Body Starter",
                None,
                True,
                [
                    ("Demo Bench Press", 3, 10, None),
                    ("Demo Lat Pulldown", 3, 12, None),
                    ("Demo Barbell Squat", 4, 8, None),
                    ("Demo Treadmill Intervals", 1, 1, 18),
                ],
            ),
            (
                "Demo Fat Burn - Anna",
                anna.id,
                False,
                [
                    ("Demo Incline Dumbbell Press", 3, 12, None),
                    ("Demo Seated Row", 3, 12, None),
                    ("Demo Romanian Deadlift", 3, 10, None),
                    ("Demo Treadmill Intervals", 1, 1, 22),
                ],
            ),
            (
                "Demo Strength Builder - Leo",
                leo.id,
                False,
                [
                    ("Demo Bench Press", 5, 5, None),
                    ("Demo Barbell Squat", 5, 5, None),
                    ("Demo Shoulder Press", 4, 6, None),
                ],
            ),
        ]

        plans_by_name: dict[str, WorkoutPlan] = {}
        for name, member_id, is_template, exercises in plan_defs:
            stmt = (
                select(WorkoutPlan)
                .where(WorkoutPlan.name == name, WorkoutPlan.creator_id == coach.id)
                .options(selectinload(WorkoutPlan.exercises))
            )
            plan = (await session.execute(stmt)).scalar_one_or_none()
            if not plan:
                plan = WorkoutPlan(
                    name=name,
                    description=f"{DEMO_TAG} Structured training block",
                    creator_id=coach.id,
                    member_id=member_id,
                    is_template=is_template,
                )
                session.add(plan)
                await session.flush()
            else:
                plan.member_id = member_id
                plan.is_template = is_template

            await session.execute(
                delete(WorkoutExercise).where(WorkoutExercise.plan_id == plan.id)
            )

            for order, (exercise_name, sets, reps, duration_minutes) in enumerate(exercises, start=1):
                session.add(
                    WorkoutExercise(
                        plan_id=plan.id,
                        exercise_id=exercise_map[exercise_name].id,
                        sets=sets,
                        reps=reps,
                        duration_minutes=duration_minutes,
                        order=order,
                    )
                )
            plans_by_name[name] = plan
        await session.commit()

        diet_defs = [
            (
                "Demo Lean Meal Plan - Anna",
                anna.id,
                """Breakfast: Oats + whey + berries
Lunch: Chicken rice bowl + veggies
Snack: Greek yogurt + almonds
Dinner: Salmon + sweet potato + salad
Hydration goal: 2.5L/day""",
            ),
            (
                "Demo Performance Plan - Leo",
                leo.id,
                """Breakfast: Eggs + toast + fruit
Lunch: Lean beef wrap + quinoa
Snack: Protein shake + banana
Dinner: Turkey pasta + greens
Pre-workout: Espresso + dates""",
            ),
        ]
        for diet_name, member_id, content in diet_defs:
            stmt = select(DietPlan).where(DietPlan.name == diet_name, DietPlan.creator_id == coach.id)
            diet = (await session.execute(stmt)).scalar_one_or_none()
            if not diet:
                diet = DietPlan(
                    name=diet_name,
                    description=f"{DEMO_TAG} Customized nutrition protocol",
                    content=content,
                    creator_id=coach.id,
                    member_id=member_id,
                )
                session.add(diet)
            else:
                diet.content = content
                diet.member_id = member_id
        await session.commit()

        anna_plan = plans_by_name["Demo Fat Burn - Anna"]
        base_log_date = datetime.utcnow().replace(hour=18, minute=0, second=0, microsecond=0)
        for i in range(10):
            log_date = base_log_date - timedelta(days=i)
            stmt = select(WorkoutLog).where(
                WorkoutLog.member_id == anna.id,
                WorkoutLog.plan_id == anna_plan.id,
                WorkoutLog.date == log_date,
            )
            existing = (await session.execute(stmt)).scalar_one_or_none()
            if existing:
                continue
            session.add(
                WorkoutLog(
                    member_id=anna.id,
                    plan_id=anna_plan.id,
                    date=log_date,
                    completed=(i % 3 != 0),
                    difficulty_rating=4 if i % 2 == 0 else 3,
                    comment=f"{DEMO_TAG} Session {i + 1}: good pump, steady progress.",
                )
            )
        await session.commit()

        for i in range(8):
            bio_date = datetime.now(timezone.utc) - timedelta(days=(i * 4))
            stmt = select(BiometricLog).where(
                BiometricLog.member_id == anna.id,
                BiometricLog.date == bio_date,
            )
            existing = (await session.execute(stmt)).scalar_one_or_none()
            if existing:
                continue
            session.add(
                BiometricLog(
                    member_id=anna.id,
                    date=bio_date,
                    weight_kg=76.8 - (i * 0.45),
                    body_fat_pct=21.2 - (i * 0.35),
                    height_cm=171.0,
                    muscle_mass_kg=33.5 + (i * 0.15),
                )
            )
        await session.commit()

        logger.info("Seeding gamification...")
        streak_stmt = select(AttendanceStreak).where(AttendanceStreak.user_id == anna.id)
        streak = (await session.execute(streak_stmt)).scalar_one_or_none()
        if not streak:
            streak = AttendanceStreak(
                user_id=anna.id,
                current_streak=8,
                best_streak=12,
                last_visit_date=datetime.now(timezone.utc),
            )
            session.add(streak)
        else:
            streak.current_streak = 8
            streak.best_streak = 12
            streak.last_visit_date = datetime.now(timezone.utc)

        badge_defs = [
            ("STREAK_3", "3-Day Streak", "Visited 3 days in a row"),
            ("STREAK_7", "Weekly Warrior", "Visited 7 days in a row"),
            ("VISITS_10", "10 Club Visits", "Checked in 10 times"),
            ("VISITS_25", "25 Club Visits", "Checked in 25 times"),
            ("EARLY_BIRD", "Early Bird", "Checked in before 7 AM"),
        ]
        for badge_type, badge_name, badge_description in badge_defs:
            stmt = select(Badge).where(Badge.user_id == anna.id, Badge.badge_type == badge_type)
            badge = (await session.execute(stmt)).scalar_one_or_none()
            if not badge:
                session.add(
                    Badge(
                        user_id=anna.id,
                        badge_type=badge_type,
                        badge_name=badge_name,
                        badge_description=f"{DEMO_TAG} {badge_description}",
                    )
                )
        await session.commit()

        logger.info("Seeding audit logs...")
        admin_user = users_by_email["admin.demo@gym-erp.com"]
        for i in range(6):
            ts = datetime.now(timezone.utc) - timedelta(hours=i * 6)
            details = f"{DEMO_TAG} Demo admin action #{i + 1}"
            stmt = select(AuditLog).where(
                AuditLog.user_id == admin_user.id,
                AuditLog.action == "DEMO_ACTION",
                AuditLog.details == details,
            )
            exists = (await session.execute(stmt)).scalar_one_or_none()
            if exists:
                continue
            session.add(
                AuditLog(
                    user_id=admin_user.id,
                    action="DEMO_ACTION",
                    target_id=str(admin_user.id),
                    timestamp=ts,
                    details=details,
                )
            )
        await session.commit()

        logger.info("Demo data seeding complete.")
        logger.info("Login credentials:")
        logger.info("  Admin: admin.demo@gym-erp.com / %s", DEMO_PASSWORD)
        logger.info("  Coach: coach.demo@gym-erp.com / %s", DEMO_PASSWORD)
        logger.info("  Member: member.anna.demo@gym-erp.com / %s", DEMO_PASSWORD)


if __name__ == "__main__":
    asyncio.run(seed_demo_data())
