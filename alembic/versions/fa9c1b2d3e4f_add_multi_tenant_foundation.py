"""add multi-tenant foundation

Revision ID: fa9c1b2d3e4f
Revises: b1a2c3d4e5f6, f7a1c9d3b2e4, 8a6c0d1e9f33, 1d9a62c4f8a1, 9f3c2b4d1a77
Create Date: 2026-04-21 06:00:00.000000

"""
from __future__ import annotations

import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.config import settings


revision: str = "fa9c1b2d3e4f"
down_revision: Union[str, Sequence[str], None] = (
    "b1a2c3d4e5f6",
    "f7a1c9d3b2e4",
    "8a6c0d1e9f33",
    "1d9a62c4f8a1",
    "9f3c2b4d1a77",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


DEFAULT_GYM_ID = uuid.UUID("11111111-1111-1111-1111-111111111111")
DEFAULT_BRANCH_ID = uuid.UUID("22222222-2222-2222-2222-222222222222")
UUID = postgresql.UUID(as_uuid=True)

GYM_ONLY_TABLES = [
    "users",
    "refresh_tokens",
    "subscriptions",
    "access_logs",
    "attendance_logs",
    "subscription_renewal_requests",
    "products",
    "pos_transaction_items",
    "contracts",
    "payrolls",
    "payroll_payments",
    "payroll_settings",
    "leave_requests",
    "support_tickets",
    "support_messages",
    "audit_logs",
    "lost_found_items",
    "badges",
    "attendance_streaks",
    "exercises",
    "workout_plans",
    "workout_exercises",
    "diet_plans",
    "diet_library_items",
    "biometric_logs",
    "exercise_library_items",
    "coach_exercise_templates",
    "exercise_library_recent",
    "lost_found_media",
    "lost_found_comments",
    "workout_logs",
    "workout_sessions",
    "workout_session_entries",
    "workout_session_drafts",
    "workout_session_draft_entries",
    "member_diet_tracking_days",
    "member_diet_tracking_meals",
    "diet_feedback",
    "gym_feedback",
    "whatsapp_delivery_logs",
    "whatsapp_automation_rules",
    "mobile_notification_preferences",
    "mobile_devices",
    "push_delivery_logs",
    "chat_threads",
    "chat_messages",
    "chat_read_receipts",
    "transactions",
    "class_templates",
    "class_sessions",
    "class_reservations",
]

BRANCH_TABLES = [
    "access_logs",
    "attendance_logs",
    "transactions",
    "products",
    "class_sessions",
    "lost_found_items",
]


def _slugify(value: str, fallback: str) -> str:
    chars = []
    previous_dash = False
    for char in value.lower():
        if char.isalnum():
            chars.append(char)
            previous_dash = False
        elif not previous_dash:
            chars.append("-")
            previous_dash = True
    slug = "".join(chars).strip("-")
    return slug or fallback


def _add_fk_column(table_name: str, column_name: str, target: str, *, nullable: bool = True, server_default: object = None) -> None:
    if server_default is not None:
        op.add_column(table_name, sa.Column(column_name, UUID, nullable=nullable, server_default=sa.text(f"'{server_default}'")))
    else:
        op.add_column(table_name, sa.Column(column_name, UUID, nullable=nullable))
    op.create_index(op.f(f"ix_{table_name}_{column_name}"), table_name, [column_name], unique=False)
    op.create_foreign_key(
        f"fk_{table_name}_{column_name}_{target.split('(')[0].replace('.', '_')}",
        table_name,
        target.split("(")[0],
        [column_name],
        [target.split("(")[1].rstrip(")")],
    )


def _set_all(table_name: str, **values: object) -> None:
    assignments = ", ".join(f"{column} = :{column}" for column in values)
    op.execute(sa.text(f'UPDATE "{table_name}" SET {assignments}').bindparams(**values))


def _exec_statements(*statements: str) -> None:
    for statement in statements:
        op.execute(statement)


def upgrade() -> None:
    op.create_table(
        "gyms",
        sa.Column("id", UUID, primary_key=True, nullable=False),
        sa.Column("slug", sa.String(length=120), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("brand_name", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("plan_tier", sa.String(length=32), nullable=False, server_default="standard"),
        sa.Column("deployment_mode", sa.String(length=32), nullable=False, server_default="shared"),
        sa.Column("logo_url", sa.String(), nullable=True),
        sa.Column("primary_color", sa.String(length=20), nullable=False, server_default=settings.GYM_PRIMARY_COLOR),
        sa.Column("secondary_color", sa.String(length=20), nullable=False, server_default=settings.GYM_SECONDARY_COLOR),
        sa.Column("support_email", sa.String(length=255), nullable=True),
        sa.Column("support_phone", sa.String(length=50), nullable=True),
        sa.Column("public_web_domain", sa.String(length=255), nullable=True),
        sa.Column("admin_web_domain", sa.String(length=255), nullable=True),
        sa.Column("mobile_shell_key", sa.String(length=120), nullable=True),
        sa.Column("mobile_app_id", sa.String(length=255), nullable=True),
        sa.Column("timezone", sa.String(length=80), nullable=False, server_default=settings.GYM_TIMEZONE),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index(op.f("ix_gyms_slug"), "gyms", ["slug"], unique=True)
    op.create_unique_constraint("uq_gyms_public_web_domain", "gyms", ["public_web_domain"])
    op.create_unique_constraint("uq_gyms_admin_web_domain", "gyms", ["admin_web_domain"])
    op.create_unique_constraint("uq_gyms_mobile_shell_key", "gyms", ["mobile_shell_key"])

    op.create_table(
        "branches",
        sa.Column("id", UUID, primary_key=True, nullable=False),
        sa.Column("gym_id", UUID, sa.ForeignKey("gyms.id"), nullable=False),
        sa.Column("slug", sa.String(length=120), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("display_name", sa.String(length=255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("timezone", sa.String(length=80), nullable=False, server_default=settings.GYM_TIMEZONE),
        sa.Column("address_line_1", sa.String(length=255), nullable=True),
        sa.Column("address_line_2", sa.String(length=255), nullable=True),
        sa.Column("city", sa.String(length=120), nullable=True),
        sa.Column("state", sa.String(length=120), nullable=True),
        sa.Column("postal_code", sa.String(length=32), nullable=True),
        sa.Column("country", sa.String(length=120), nullable=True),
        sa.Column("phone", sa.String(length=50), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index(op.f("ix_branches_gym_id"), "branches", ["gym_id"], unique=False)
    op.create_unique_constraint("uq_branches_gym_slug", "branches", ["gym_id", "slug"])
    op.create_unique_constraint("uq_branches_gym_code", "branches", ["gym_id", "code"])

    op.execute(
        sa.text(
            """
            INSERT INTO gyms (
                id, slug, name, brand_name, is_active, plan_tier, deployment_mode, logo_url,
                primary_color, secondary_color, support_email, support_phone, timezone
            )
            VALUES (
                :id, :slug, :name, :brand_name, true, 'standard', 'shared', :logo_url,
                :primary_color, :secondary_color, :support_email, :support_phone, :timezone
            )
            ON CONFLICT (id) DO NOTHING
            """
        ).bindparams(
            id=DEFAULT_GYM_ID,
            slug=_slugify(settings.GYM_NAME or settings.PROJECT_NAME, "default-gym"),
            name=settings.GYM_NAME or settings.PROJECT_NAME,
            brand_name=settings.GYM_NAME or settings.PROJECT_NAME,
            logo_url=settings.GYM_LOGO_URL,
            primary_color=settings.GYM_PRIMARY_COLOR,
            secondary_color=settings.GYM_SECONDARY_COLOR,
            support_email=settings.GYM_SUPPORT_EMAIL,
            support_phone=settings.GYM_SUPPORT_PHONE,
            timezone=settings.GYM_TIMEZONE,
        )
    )

    op.execute(
        sa.text(
            """
            INSERT INTO branches (
                id, gym_id, slug, code, name, display_name, is_active, timezone, phone, email
            )
            VALUES (
                :id, :gym_id, 'hq', 'HQ', :name, 'Main Branch', true, :timezone, :phone, :email
            )
            ON CONFLICT (id) DO NOTHING
            """
        ).bindparams(
            id=DEFAULT_BRANCH_ID,
            gym_id=DEFAULT_GYM_ID,
            name=f"{settings.GYM_NAME or settings.PROJECT_NAME} HQ",
            timezone=settings.GYM_TIMEZONE,
            phone=settings.GYM_SUPPORT_PHONE,
            email=settings.GYM_SUPPORT_EMAIL,
        )
    )

    for table_name in GYM_ONLY_TABLES:
        _add_fk_column(table_name, "gym_id", "gyms(id)", server_default=DEFAULT_GYM_ID)

    for table_name in BRANCH_TABLES:
        _add_fk_column(table_name, "branch_id", "branches(id)", server_default=DEFAULT_BRANCH_ID)

    _add_fk_column("users", "home_branch_id", "branches(id)", server_default=DEFAULT_BRANCH_ID)

    op.create_table(
        "user_branch_access",
        sa.Column("id", UUID, primary_key=True, nullable=False),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("gym_id", UUID, sa.ForeignKey("gyms.id"), nullable=False),
        sa.Column("branch_id", UUID, sa.ForeignKey("branches.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index(op.f("ix_user_branch_access_user_id"), "user_branch_access", ["user_id"], unique=False)
    op.create_index(op.f("ix_user_branch_access_gym_id"), "user_branch_access", ["gym_id"], unique=False)
    op.create_index(op.f("ix_user_branch_access_branch_id"), "user_branch_access", ["branch_id"], unique=False)
    op.create_unique_constraint("uq_user_branch_access_user_branch", "user_branch_access", ["user_id", "branch_id"])

    # Data population is handled by server_default in _add_fk_column calls above

    op.execute(
        sa.text(
            """
            INSERT INTO user_branch_access (id, user_id, gym_id, branch_id)
            SELECT id, id, :gym_id, :branch_id
            FROM users
            ON CONFLICT DO NOTHING
            """
        ).bindparams(gym_id=DEFAULT_GYM_ID, branch_id=DEFAULT_BRANCH_ID)
    )

    for table_name in GYM_ONLY_TABLES:
        op.alter_column(table_name, "gym_id", nullable=False, server_default=None)

    for table_name in BRANCH_TABLES:
        op.alter_column(table_name, "branch_id", nullable=True, server_default=None)

    op.alter_column("users", "home_branch_id", nullable=True, server_default=None)

    _exec_statements(
        "DROP POLICY IF EXISTS subscriptions_select_policy ON subscriptions",
        "DROP POLICY IF EXISTS subscriptions_modify_policy ON subscriptions",
        """
        CREATE POLICY subscriptions_select_policy ON subscriptions
            FOR SELECT
            USING (
                gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::uuid
                AND (
                    current_setting('app.current_user_role', true) IN ('ADMIN', 'MANAGER', 'FRONT_DESK', 'RECEPTION', 'COACH', 'EMPLOYEE', 'CASHIER')
                    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                )
            )
        """,
        """
        CREATE POLICY subscriptions_modify_policy ON subscriptions
            FOR ALL
            USING (
                gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::uuid
                AND (
                    current_setting('app.current_user_role', true) IN ('ADMIN', 'MANAGER', 'FRONT_DESK', 'RECEPTION', 'COACH', 'EMPLOYEE', 'CASHIER')
                    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                )
            )
            WITH CHECK (
                gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::uuid
                AND (
                    current_setting('app.current_user_role', true) IN ('ADMIN', 'MANAGER', 'FRONT_DESK', 'RECEPTION', 'COACH', 'EMPLOYEE', 'CASHIER')
                    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                )
            )
        """,
    )

    _exec_statements(
        "DROP POLICY IF EXISTS support_messages_modify_policy ON support_messages",
        "DROP POLICY IF EXISTS support_messages_select_policy ON support_messages",
        "DROP POLICY IF EXISTS support_tickets_modify_policy ON support_tickets",
        "DROP POLICY IF EXISTS support_tickets_select_policy ON support_tickets",
        """
        CREATE POLICY support_tickets_select_policy ON support_tickets
            FOR SELECT
            USING (
                gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::uuid
                AND (
                    current_setting('app.current_user_role', true) IN ('ADMIN', 'MANAGER', 'RECEPTION', 'FRONT_DESK')
                    OR customer_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                )
            )
        """,
        """
        CREATE POLICY support_tickets_modify_policy ON support_tickets
            FOR ALL
            USING (
                gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::uuid
                AND (
                    current_setting('app.current_user_role', true) IN ('ADMIN', 'MANAGER', 'RECEPTION', 'FRONT_DESK')
                    OR customer_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                )
            )
            WITH CHECK (
                gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::uuid
                AND (
                    current_setting('app.current_user_role', true) IN ('ADMIN', 'MANAGER', 'RECEPTION', 'FRONT_DESK')
                    OR customer_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                )
            )
        """,
        """
        CREATE POLICY support_messages_select_policy ON support_messages
            FOR SELECT
            USING (
                gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::uuid
                AND EXISTS (
                    SELECT 1
                    FROM support_tickets ticket
                    WHERE ticket.id = support_messages.ticket_id
                      AND ticket.gym_id = support_messages.gym_id
                      AND (
                        current_setting('app.current_user_role', true) IN ('ADMIN', 'MANAGER', 'RECEPTION', 'FRONT_DESK')
                        OR ticket.customer_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                      )
                )
            )
        """,
        """
        CREATE POLICY support_messages_modify_policy ON support_messages
            FOR ALL
            USING (
                gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::uuid
                AND EXISTS (
                    SELECT 1
                    FROM support_tickets ticket
                    WHERE ticket.id = support_messages.ticket_id
                      AND ticket.gym_id = support_messages.gym_id
                      AND (
                        current_setting('app.current_user_role', true) IN ('ADMIN', 'MANAGER', 'RECEPTION', 'FRONT_DESK')
                        OR ticket.customer_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                      )
                )
            )
            WITH CHECK (
                gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::uuid
                AND sender_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                AND EXISTS (
                    SELECT 1
                    FROM support_tickets ticket
                    WHERE ticket.id = support_messages.ticket_id
                      AND ticket.gym_id = support_messages.gym_id
                      AND (
                        current_setting('app.current_user_role', true) IN ('ADMIN', 'MANAGER', 'RECEPTION', 'FRONT_DESK')
                        OR ticket.customer_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                      )
                )
            )
        """,
    )

    _exec_statements(
        "DROP POLICY IF EXISTS lost_found_media_modify_policy ON lost_found_media",
        "DROP POLICY IF EXISTS lost_found_media_select_policy ON lost_found_media",
        "DROP POLICY IF EXISTS lost_found_comments_modify_policy ON lost_found_comments",
        "DROP POLICY IF EXISTS lost_found_comments_select_policy ON lost_found_comments",
        "DROP POLICY IF EXISTS lost_found_items_modify_policy ON lost_found_items",
        "DROP POLICY IF EXISTS lost_found_items_select_policy ON lost_found_items",
        """
        CREATE POLICY lost_found_items_select_policy ON lost_found_items
            FOR SELECT
            USING (
                gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::uuid
                AND (
                    current_setting('app.current_user_role', true) IN ('ADMIN', 'MANAGER', 'RECEPTION', 'FRONT_DESK')
                    OR reporter_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                    OR assignee_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                )
            )
        """,
        """
        CREATE POLICY lost_found_items_modify_policy ON lost_found_items
            FOR ALL
            USING (
                gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::uuid
                AND (
                    current_setting('app.current_user_role', true) IN ('ADMIN', 'MANAGER', 'RECEPTION', 'FRONT_DESK')
                    OR reporter_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                    OR assignee_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                )
            )
            WITH CHECK (
                gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::uuid
                AND (
                    current_setting('app.current_user_role', true) IN ('ADMIN', 'MANAGER', 'RECEPTION', 'FRONT_DESK')
                    OR reporter_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                    OR assignee_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                )
            )
        """,
        """
        CREATE POLICY lost_found_comments_select_policy ON lost_found_comments
            FOR SELECT
            USING (
                gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::uuid
                AND EXISTS (
                    SELECT 1
                    FROM lost_found_items item
                    WHERE item.id = lost_found_comments.item_id
                      AND item.gym_id = lost_found_comments.gym_id
                      AND (
                        current_setting('app.current_user_role', true) IN ('ADMIN', 'MANAGER', 'RECEPTION', 'FRONT_DESK')
                        OR item.reporter_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                        OR item.assignee_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                      )
                )
            )
        """,
        """
        CREATE POLICY lost_found_comments_modify_policy ON lost_found_comments
            FOR ALL
            USING (
                gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::uuid
                AND EXISTS (
                    SELECT 1
                    FROM lost_found_items item
                    WHERE item.id = lost_found_comments.item_id
                      AND item.gym_id = lost_found_comments.gym_id
                      AND (
                        current_setting('app.current_user_role', true) IN ('ADMIN', 'MANAGER', 'RECEPTION', 'FRONT_DESK')
                        OR item.reporter_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                        OR item.assignee_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                      )
                )
            )
            WITH CHECK (
                gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::uuid
                AND author_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
            )
        """,
        """
        CREATE POLICY lost_found_media_select_policy ON lost_found_media
            FOR SELECT
            USING (
                gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::uuid
                AND EXISTS (
                    SELECT 1
                    FROM lost_found_items item
                    WHERE item.id = lost_found_media.item_id
                      AND item.gym_id = lost_found_media.gym_id
                      AND (
                        current_setting('app.current_user_role', true) IN ('ADMIN', 'MANAGER', 'RECEPTION', 'FRONT_DESK')
                        OR item.reporter_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                        OR item.assignee_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                      )
                )
            )
        """,
        """
        CREATE POLICY lost_found_media_modify_policy ON lost_found_media
            FOR ALL
            USING (
                gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::uuid
                AND EXISTS (
                    SELECT 1
                    FROM lost_found_items item
                    WHERE item.id = lost_found_media.item_id
                      AND item.gym_id = lost_found_media.gym_id
                      AND (
                        current_setting('app.current_user_role', true) IN ('ADMIN', 'MANAGER', 'RECEPTION', 'FRONT_DESK')
                        OR item.reporter_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                        OR item.assignee_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                      )
                )
            )
            WITH CHECK (
                gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::uuid
                AND uploader_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
            )
        """,
    )

    _exec_statements(
        "DROP POLICY IF EXISTS audit_logs_insert_policy ON audit_logs",
        "DROP POLICY IF EXISTS audit_logs_select_policy ON audit_logs",
        """
        CREATE POLICY audit_logs_select_policy ON audit_logs
            FOR SELECT
            USING (
                gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::uuid
                AND current_setting('app.current_user_role', true) = 'ADMIN'
            )
        """,
        """
        CREATE POLICY audit_logs_insert_policy ON audit_logs
            FOR INSERT
            WITH CHECK (
                gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::uuid
                AND (
                    current_setting('app.current_user_role', true) = 'ADMIN'
                    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                    OR user_id IS NULL
                )
            )
        """,
    )


def downgrade() -> None:
    op.drop_table("user_branch_access")

    for table_name in reversed(BRANCH_TABLES):
        with op.batch_alter_table(table_name) as batch_op:
            batch_op.drop_column("branch_id")

    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("home_branch_id")

    for table_name in reversed(GYM_ONLY_TABLES):
        with op.batch_alter_table(table_name) as batch_op:
            batch_op.drop_column("gym_id")

    op.drop_table("branches")
    op.drop_table("gyms")
