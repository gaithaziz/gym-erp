"""add baseline rls policies

Revision ID: b4c5d6e7f8a9
Revises: a7d3b91f4c2e
Create Date: 2026-02-28 08:20:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "b4c5d6e7f8a9"
down_revision: Union[str, Sequence[str], None] = "a7d3b91f4c2e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


SUPPORT_STAFF_ROLES = "('ADMIN', 'RECEPTION')"
NON_CUSTOMER_ROLES = "('ADMIN', 'MANAGER', 'FRONT_DESK', 'RECEPTION', 'COACH', 'EMPLOYEE', 'CASHIER')"


def upgrade() -> None:
    statements = [
        "ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY",
        f"""
        CREATE POLICY subscriptions_select_policy ON subscriptions
            FOR SELECT
            USING (
                current_setting('app.current_user_role', true) IN {NON_CUSTOMER_ROLES}
                OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
            )
        """,
        f"""
        CREATE POLICY subscriptions_modify_policy ON subscriptions
            FOR ALL
            USING (
                current_setting('app.current_user_role', true) IN {NON_CUSTOMER_ROLES}
                OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
            )
            WITH CHECK (
                current_setting('app.current_user_role', true) IN {NON_CUSTOMER_ROLES}
                OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
            )
        """,
        "ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY",
        f"""
        CREATE POLICY support_tickets_select_policy ON support_tickets
            FOR SELECT
            USING (
                current_setting('app.current_user_role', true) IN {SUPPORT_STAFF_ROLES}
                OR customer_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
            )
        """,
        f"""
        CREATE POLICY support_tickets_modify_policy ON support_tickets
            FOR ALL
            USING (
                current_setting('app.current_user_role', true) IN {SUPPORT_STAFF_ROLES}
                OR customer_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
            )
            WITH CHECK (
                current_setting('app.current_user_role', true) IN {SUPPORT_STAFF_ROLES}
                OR customer_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
            )
        """,
        "ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY",
        f"""
        CREATE POLICY support_messages_select_policy ON support_messages
            FOR SELECT
            USING (
                EXISTS (
                    SELECT 1
                    FROM support_tickets ticket
                    WHERE ticket.id = support_messages.ticket_id
                      AND (
                        current_setting('app.current_user_role', true) IN {SUPPORT_STAFF_ROLES}
                        OR ticket.customer_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                      )
                )
            )
        """,
        f"""
        CREATE POLICY support_messages_modify_policy ON support_messages
            FOR ALL
            USING (
                EXISTS (
                    SELECT 1
                    FROM support_tickets ticket
                    WHERE ticket.id = support_messages.ticket_id
                      AND (
                        current_setting('app.current_user_role', true) IN {SUPPORT_STAFF_ROLES}
                        OR ticket.customer_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                      )
                )
            )
            WITH CHECK (
                sender_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                AND EXISTS (
                    SELECT 1
                    FROM support_tickets ticket
                    WHERE ticket.id = support_messages.ticket_id
                      AND (
                        current_setting('app.current_user_role', true) IN {SUPPORT_STAFF_ROLES}
                        OR ticket.customer_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                      )
                )
            )
        """,
        "ALTER TABLE lost_found_items ENABLE ROW LEVEL SECURITY",
        f"""
        CREATE POLICY lost_found_items_select_policy ON lost_found_items
            FOR SELECT
            USING (
                current_setting('app.current_user_role', true) IN {SUPPORT_STAFF_ROLES}
                OR reporter_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                OR assignee_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
            )
        """,
        f"""
        CREATE POLICY lost_found_items_modify_policy ON lost_found_items
            FOR ALL
            USING (
                current_setting('app.current_user_role', true) IN {SUPPORT_STAFF_ROLES}
                OR reporter_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                OR assignee_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
            )
            WITH CHECK (
                current_setting('app.current_user_role', true) IN {SUPPORT_STAFF_ROLES}
                OR reporter_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                OR assignee_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
            )
        """,
        "ALTER TABLE lost_found_comments ENABLE ROW LEVEL SECURITY",
        f"""
        CREATE POLICY lost_found_comments_select_policy ON lost_found_comments
            FOR SELECT
            USING (
                EXISTS (
                    SELECT 1
                    FROM lost_found_items item
                    WHERE item.id = lost_found_comments.item_id
                      AND (
                        current_setting('app.current_user_role', true) IN {SUPPORT_STAFF_ROLES}
                        OR item.reporter_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                        OR item.assignee_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                      )
                )
            )
        """,
        f"""
        CREATE POLICY lost_found_comments_modify_policy ON lost_found_comments
            FOR ALL
            USING (
                EXISTS (
                    SELECT 1
                    FROM lost_found_items item
                    WHERE item.id = lost_found_comments.item_id
                      AND (
                        current_setting('app.current_user_role', true) IN {SUPPORT_STAFF_ROLES}
                        OR item.reporter_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                        OR item.assignee_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                      )
                )
            )
            WITH CHECK (
                author_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                AND EXISTS (
                    SELECT 1
                    FROM lost_found_items item
                    WHERE item.id = lost_found_comments.item_id
                      AND (
                        current_setting('app.current_user_role', true) IN {SUPPORT_STAFF_ROLES}
                        OR item.reporter_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                        OR item.assignee_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                      )
                )
            )
        """,
        "ALTER TABLE lost_found_media ENABLE ROW LEVEL SECURITY",
        f"""
        CREATE POLICY lost_found_media_select_policy ON lost_found_media
            FOR SELECT
            USING (
                EXISTS (
                    SELECT 1
                    FROM lost_found_items item
                    WHERE item.id = lost_found_media.item_id
                      AND (
                        current_setting('app.current_user_role', true) IN {SUPPORT_STAFF_ROLES}
                        OR item.reporter_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                        OR item.assignee_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                      )
                )
            )
        """,
        f"""
        CREATE POLICY lost_found_media_modify_policy ON lost_found_media
            FOR ALL
            USING (
                EXISTS (
                    SELECT 1
                    FROM lost_found_items item
                    WHERE item.id = lost_found_media.item_id
                      AND (
                        current_setting('app.current_user_role', true) IN {SUPPORT_STAFF_ROLES}
                        OR item.reporter_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                        OR item.assignee_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                      )
                )
            )
            WITH CHECK (
                uploader_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                AND EXISTS (
                    SELECT 1
                    FROM lost_found_items item
                    WHERE item.id = lost_found_media.item_id
                      AND (
                        current_setting('app.current_user_role', true) IN {SUPPORT_STAFF_ROLES}
                        OR item.reporter_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                        OR item.assignee_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                      )
                )
            )
        """,
        "ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY",
        """
        CREATE POLICY audit_logs_select_policy ON audit_logs
            FOR SELECT
            USING (current_setting('app.current_user_role', true) = 'ADMIN')
        """,
        """
        CREATE POLICY audit_logs_insert_policy ON audit_logs
            FOR INSERT
            WITH CHECK (
                current_setting('app.current_user_role', true) = 'ADMIN'
                OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                OR user_id IS NULL
            )
        """,
    ]
    for statement in statements:
        op.execute(statement)


def downgrade() -> None:
    statements = [
        "DROP POLICY IF EXISTS audit_logs_insert_policy ON audit_logs",
        "DROP POLICY IF EXISTS audit_logs_select_policy ON audit_logs",
        "ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY",
        "DROP POLICY IF EXISTS lost_found_media_modify_policy ON lost_found_media",
        "DROP POLICY IF EXISTS lost_found_media_select_policy ON lost_found_media",
        "ALTER TABLE lost_found_media DISABLE ROW LEVEL SECURITY",
        "DROP POLICY IF EXISTS lost_found_comments_modify_policy ON lost_found_comments",
        "DROP POLICY IF EXISTS lost_found_comments_select_policy ON lost_found_comments",
        "ALTER TABLE lost_found_comments DISABLE ROW LEVEL SECURITY",
        "DROP POLICY IF EXISTS lost_found_items_modify_policy ON lost_found_items",
        "DROP POLICY IF EXISTS lost_found_items_select_policy ON lost_found_items",
        "ALTER TABLE lost_found_items DISABLE ROW LEVEL SECURITY",
        "DROP POLICY IF EXISTS support_messages_modify_policy ON support_messages",
        "DROP POLICY IF EXISTS support_messages_select_policy ON support_messages",
        "ALTER TABLE support_messages DISABLE ROW LEVEL SECURITY",
        "DROP POLICY IF EXISTS support_tickets_modify_policy ON support_tickets",
        "DROP POLICY IF EXISTS support_tickets_select_policy ON support_tickets",
        "ALTER TABLE support_tickets DISABLE ROW LEVEL SECURITY",
        "DROP POLICY IF EXISTS subscriptions_modify_policy ON subscriptions",
        "DROP POLICY IF EXISTS subscriptions_select_policy ON subscriptions",
        "ALTER TABLE subscriptions DISABLE ROW LEVEL SECURITY",
    ]
    for statement in statements:
        op.execute(statement)
