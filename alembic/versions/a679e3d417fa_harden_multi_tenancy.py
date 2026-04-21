"""harden multi tenancy

Revision ID: a679e3d417fa
Revises: fa9c1b2d3e4f
Create Date: 2026-04-21 06:10:00.000000

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "a679e3d417fa"
down_revision = "fa9c1b2d3e4f"
branch_labels = None
depends_on = None

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

NON_CUSTOMER_ROLES = "('ADMIN', 'MANAGER', 'FRONT_DESK', 'RECEPTION', 'COACH', 'EMPLOYEE', 'CASHIER')"

def upgrade() -> None:
    # 1. Scope Unique Constraints
    # users.email: global -> (email, gym_id)
    op.execute('DROP INDEX IF EXISTS "ix_users_email"')
    op.execute('ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "uq_users_email_gym"')
    op.create_unique_constraint("uq_users_email_gym", "users", ["email", "gym_id"])
    op.create_index("ix_users_email_gym", "users", ["email", "gym_id"])

    # 2. Harden payroll_settings
    op.execute('DROP TABLE IF EXISTS "payroll_settings"')
    op.create_table(
        "payroll_settings",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("gym_id", sa.Uuid(), nullable=False),
        sa.Column("salary_cutoff_day", sa.Integer(), nullable=False, server_default="1"),
        sa.ForeignKeyConstraint(["gym_id"], ["gyms.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("gym_id", name="uq_payroll_settings_gym"),
    )
    op.execute("INSERT INTO payroll_settings (id, gym_id, salary_cutoff_day) SELECT gen_random_uuid(), id, 1 FROM gyms ON CONFLICT DO NOTHING")

    # 3. Enable RLS and Policies on all tables
    for table in GYM_ONLY_TABLES:
        op.execute(f'ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY')
        op.execute(f'ALTER TABLE "{table}" FORCE ROW LEVEL SECURITY')
        op.execute(f'DROP POLICY IF EXISTS tenant_isolation_policy ON "{table}"')

        # Determine the user identification column for this table
        user_col = None
        if table == "users":
            user_col = "id"
        elif table in ["refresh_tokens", "access_logs", "attendance_logs", "attendance_streaks", "leave_requests", "subscriptions"]:
            user_col = "user_id"
        elif table in ["workout_logs", "workout_sessions", "member_diet_tracking_days"]:
            user_col = "member_id"
        elif table in ["support_tickets"]:
            user_col = "customer_id"
        
        if user_col:
            user_check = f"OR ({user_col} = NULLIF(current_setting('app.current_user_id', true), '')::uuid)"
        else:
            user_check = ""
            
        op.execute(f"""
            CREATE POLICY tenant_isolation_policy ON "{table}"
            FOR ALL
            USING (
                gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::uuid
                AND (
                    current_setting('app.current_user_role', true) IN {NON_CUSTOMER_ROLES}
                    {user_check}
                )
            )
            WITH CHECK (
                gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::uuid
                AND (
                    current_setting('app.current_user_role', true) IN {NON_CUSTOMER_ROLES}
                    {user_check}
                )
            )
        """)

def downgrade() -> None:
    for table in reversed(GYM_ONLY_TABLES):
        op.execute(f'DROP POLICY IF EXISTS tenant_isolation_policy ON "{table}"')
        op.execute(f'ALTER TABLE "{table}" NO FORCE ROW LEVEL SECURITY')
        op.execute(f'ALTER TABLE "{table}" DISABLE ROW LEVEL SECURITY')

    op.drop_table("payroll_settings")
    op.create_table(
        "payroll_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("salary_cutoff_day", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("gym_id", sa.Uuid(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.execute("INSERT INTO payroll_settings (id, salary_cutoff_day) VALUES (1, 1)")

    op.drop_constraint("uq_users_email_gym", "users", type_="unique")
    op.drop_index("ix_users_email_gym", table_name="users")
    op.create_index("ix_users_email", "users", ["email"], unique=True)
