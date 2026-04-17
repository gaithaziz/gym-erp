"""expand support rls staff roles

Revision ID: e4a7b2c9d1f0
Revises: d8e45c7f9a20
Create Date: 2026-04-17 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "e4a7b2c9d1f0"
down_revision: Union[str, Sequence[str], None] = "d8e45c7f9a20"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


EXPANDED_SUPPORT_STAFF_ROLES = "('ADMIN', 'MANAGER', 'RECEPTION', 'FRONT_DESK')"
LEGACY_SUPPORT_STAFF_ROLES = "('ADMIN', 'RECEPTION')"


def _recreate_policies(staff_roles: str) -> None:
    op.execute("DROP POLICY IF EXISTS support_messages_modify_policy ON support_messages")
    op.execute("DROP POLICY IF EXISTS support_messages_select_policy ON support_messages")
    op.execute("DROP POLICY IF EXISTS support_tickets_modify_policy ON support_tickets")
    op.execute("DROP POLICY IF EXISTS support_tickets_select_policy ON support_tickets")

    op.execute(
        f"""
        CREATE POLICY support_tickets_select_policy ON support_tickets
            FOR SELECT
            USING (
                current_setting('app.current_user_role', true) IN {staff_roles}
                OR customer_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
            )
        """
    )
    op.execute(
        f"""
        CREATE POLICY support_tickets_modify_policy ON support_tickets
            FOR ALL
            USING (
                current_setting('app.current_user_role', true) IN {staff_roles}
                OR customer_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
            )
            WITH CHECK (
                current_setting('app.current_user_role', true) IN {staff_roles}
                OR customer_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
            )
        """
    )
    op.execute(
        f"""
        CREATE POLICY support_messages_select_policy ON support_messages
            FOR SELECT
            USING (
                EXISTS (
                    SELECT 1
                    FROM support_tickets ticket
                    WHERE ticket.id = support_messages.ticket_id
                      AND (
                        current_setting('app.current_user_role', true) IN {staff_roles}
                        OR ticket.customer_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                      )
                )
            )
        """
    )
    op.execute(
        f"""
        CREATE POLICY support_messages_modify_policy ON support_messages
            FOR ALL
            USING (
                EXISTS (
                    SELECT 1
                    FROM support_tickets ticket
                    WHERE ticket.id = support_messages.ticket_id
                      AND (
                        current_setting('app.current_user_role', true) IN {staff_roles}
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
                        current_setting('app.current_user_role', true) IN {staff_roles}
                        OR ticket.customer_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                      )
                )
            )
        """
    )


def upgrade() -> None:
    _recreate_policies(EXPANDED_SUPPORT_STAFF_ROLES)


def downgrade() -> None:
    _recreate_policies(LEGACY_SUPPORT_STAFF_ROLES)
