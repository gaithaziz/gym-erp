"""expand lost found rls staff roles

Revision ID: 7d1a5c8e2f44
Revises: e1f7c2d9b4a1
Create Date: 2026-04-22 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "7d1a5c8e2f44"
down_revision: Union[str, Sequence[str], None] = "e1f7c2d9b4a1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


EXPANDED_STAFF_ROLES = "('ADMIN', 'MANAGER', 'RECEPTION', 'FRONT_DESK', 'COACH', 'EMPLOYEE', 'CASHIER')"
LEGACY_STAFF_ROLES = "('ADMIN', 'MANAGER', 'RECEPTION', 'FRONT_DESK')"


def _recreate_policies(staff_roles: str) -> None:
    op.execute("DROP POLICY IF EXISTS lost_found_media_modify_policy ON lost_found_media")
    op.execute("DROP POLICY IF EXISTS lost_found_media_select_policy ON lost_found_media")
    op.execute("DROP POLICY IF EXISTS lost_found_comments_modify_policy ON lost_found_comments")
    op.execute("DROP POLICY IF EXISTS lost_found_comments_select_policy ON lost_found_comments")
    op.execute("DROP POLICY IF EXISTS lost_found_items_modify_policy ON lost_found_items")
    op.execute("DROP POLICY IF EXISTS lost_found_items_select_policy ON lost_found_items")

    op.execute(
        f"""
        CREATE POLICY lost_found_items_select_policy ON lost_found_items
            FOR SELECT
            USING (
                gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::uuid
                AND (
                    current_setting('app.current_user_role', true) IN {staff_roles}
                    OR reporter_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                    OR assignee_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                )
            )
        """
    )
    op.execute(
        f"""
        CREATE POLICY lost_found_items_modify_policy ON lost_found_items
            FOR ALL
            USING (
                gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::uuid
                AND (
                    current_setting('app.current_user_role', true) IN {staff_roles}
                    OR reporter_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                    OR assignee_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                )
            )
            WITH CHECK (
                gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::uuid
                AND (
                    current_setting('app.current_user_role', true) IN {staff_roles}
                    OR reporter_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                    OR assignee_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                )
            )
        """
    )
    op.execute(
        f"""
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
                        current_setting('app.current_user_role', true) IN {staff_roles}
                        OR item.reporter_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                        OR item.assignee_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                      )
                )
            )
        """
    )
    op.execute(
        f"""
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
                        current_setting('app.current_user_role', true) IN {staff_roles}
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
                      AND item.gym_id = lost_found_comments.gym_id
                      AND (
                        current_setting('app.current_user_role', true) IN {staff_roles}
                        OR item.reporter_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                        OR item.assignee_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                      )
                )
            )
        """
    )
    op.execute(
        f"""
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
                        current_setting('app.current_user_role', true) IN {staff_roles}
                        OR item.reporter_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                        OR item.assignee_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                      )
                )
            )
        """
    )
    op.execute(
        f"""
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
                        current_setting('app.current_user_role', true) IN {staff_roles}
                        OR item.reporter_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                        OR item.assignee_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                      )
                )
            )
            WITH CHECK (
                uploader_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                AND gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::uuid
                AND EXISTS (
                    SELECT 1
                    FROM lost_found_items item
                    WHERE item.id = lost_found_media.item_id
                      AND item.gym_id = lost_found_media.gym_id
                      AND (
                        current_setting('app.current_user_role', true) IN {staff_roles}
                        OR item.reporter_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                        OR item.assignee_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                      )
                )
            )
        """
    )


def upgrade() -> None:
    _recreate_policies(EXPANDED_STAFF_ROLES)


def downgrade() -> None:
    _recreate_policies(LEGACY_STAFF_ROLES)
