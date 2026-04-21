"""advanced multi tenancy

Revision ID: d9e8c7b6a5f4
Revises: a679e3d417fa
Create Date: 2026-04-21 06:15:00.000000

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "d9e8c7b6a5f4"
down_revision = "a679e3d417fa"
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

NON_CUSTOMER_ROLES = "('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'FRONT_DESK', 'RECEPTION', 'COACH', 'EMPLOYEE', 'CASHIER')"

def upgrade() -> None:
    # 1. Update all existing policies to allow SUPER_ADMIN bypass with NULL safety
    for table in GYM_ONLY_TABLES:
        op.execute(f'DROP POLICY IF EXISTS tenant_isolation_policy ON "{table}"')

        user_col = None
        if table == "users":
            user_col = "id"
        elif table in ["refresh_tokens", "access_logs", "attendance_logs", "attendance_streaks", "leave_requests", "subscriptions"]:
            user_col = "user_id"
        elif table in ["workout_logs", "workout_sessions", "member_diet_tracking_days"]:
            user_col = "member_id"
        elif table in ["support_tickets"]:
            user_col = "customer_id"
        
        user_check = f"OR ({user_col} = NULLIF(current_setting('app.current_user_id', true), '')::uuid)" if user_col else ""
        
        op.execute(f"""
            CREATE POLICY tenant_isolation_policy ON "{table}"
            FOR ALL
            USING (
                COALESCE(current_setting('app.current_user_role', true), 'ANONYMOUS') = 'SUPER_ADMIN'
                OR (
                    gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::uuid
                    AND (
                        current_setting('app.current_user_role', true) IN {NON_CUSTOMER_ROLES}
                        {user_check}
                    )
                )
            )
            WITH CHECK (
                COALESCE(current_setting('app.current_user_role', true), 'ANONYMOUS') = 'SUPER_ADMIN'
                OR (
                    gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::uuid
                    AND (
                        current_setting('app.current_user_role', true) IN {NON_CUSTOMER_ROLES}
                        {user_check}
                    )
                )
            )
        """)

    # 2. Public Gym Policy
    op.execute('ALTER TABLE "gyms" ENABLE ROW LEVEL SECURITY')
    op.execute('ALTER TABLE "gyms" FORCE ROW LEVEL SECURITY')
    op.execute('DROP POLICY IF EXISTS gyms_public_policy ON "gyms"')
    op.execute("""
        CREATE POLICY gyms_public_policy ON "gyms"
        FOR SELECT
        USING (TRUE)
    """)
    op.execute('DROP POLICY IF EXISTS gyms_admin_policy ON "gyms"')
    op.execute(f"""
        CREATE POLICY gyms_admin_policy ON "gyms"
        FOR ALL
        USING (
            COALESCE(current_setting('app.current_user_role', true), 'ANONYMOUS') = 'SUPER_ADMIN'
            OR (
                id = NULLIF(current_setting('app.current_gym_id', true), '')::uuid
                AND current_setting('app.current_user_role', true) IN ('ADMIN', 'MANAGER')
            )
        )
    """)

def downgrade() -> None:
    # Revert to old policy (no SUPER_ADMIN check)
    OLD_ROLES = "('ADMIN', 'MANAGER', 'FRONT_DESK', 'RECEPTION', 'COACH', 'EMPLOYEE', 'CASHIER')"
    for table in reversed(GYM_ONLY_TABLES):
        op.execute(f'DROP POLICY IF EXISTS tenant_isolation_policy ON "{table}"')
        
        user_col = None
        if table == "users":
            user_col = "id"
        elif table in ["refresh_tokens", "access_logs", "attendance_logs", "attendance_streaks", "leave_requests", "subscriptions"]:
            user_col = "user_id"
        elif table in ["workout_logs", "workout_sessions", "member_diet_tracking_days"]:
            user_col = "member_id"
        elif table in ["support_tickets"]:
            user_col = "customer_id"
        
        user_check = f"OR ({user_col} = NULLIF(current_setting('app.current_user_id', true), '')::uuid)" if user_col else ""
        
        op.execute(f"""
            CREATE POLICY tenant_isolation_policy ON "{table}"
            FOR ALL
            USING (
                gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::uuid
                AND (
                    current_setting('app.current_user_role', true) IN {OLD_ROLES}
                    {user_check}
                )
            )
            WITH CHECK (
                gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::uuid
                AND (
                    current_setting('app.current_user_role', true) IN {OLD_ROLES}
                    {user_check}
                )
            )
        """)

    op.execute('DROP POLICY IF EXISTS gyms_admin_policy ON "gyms"')
    op.execute('DROP POLICY IF EXISTS gyms_public_policy ON "gyms"')
    op.execute('ALTER TABLE "gyms" NO FORCE ROW LEVEL SECURITY')
    op.execute('ALTER TABLE "gyms" DISABLE ROW LEVEL SECURITY')
