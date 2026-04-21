"""add member roaming access

Revision ID: 7c6e0f4a1b92
Revises: fb95e975094d
Create Date: 2026-04-22 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "7c6e0f4a1b92"
down_revision: Union[str, Sequence[str], None] = "fb95e975094d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


NON_CUSTOMER_ROLES = "('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'FRONT_DESK', 'RECEPTION', 'COACH', 'EMPLOYEE', 'CASHIER')"


def upgrade() -> None:
    op.create_table(
        "member_roaming_access",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("gym_id", sa.Uuid(), nullable=False),
        sa.Column("branch_id", sa.Uuid(), nullable=False),
        sa.Column("member_id", sa.Uuid(), nullable=False),
        sa.Column("granted_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("granted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["gym_id"], ["gyms.id"]),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"]),
        sa.ForeignKeyConstraint(["member_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["granted_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_member_roaming_access_gym_id"), "member_roaming_access", ["gym_id"], unique=False)
    op.create_index(op.f("ix_member_roaming_access_branch_id"), "member_roaming_access", ["branch_id"], unique=False)
    op.create_index(op.f("ix_member_roaming_access_member_id"), "member_roaming_access", ["member_id"], unique=False)
    op.create_index(
        op.f("ix_member_roaming_access_granted_by_user_id"),
        "member_roaming_access",
        ["granted_by_user_id"],
        unique=False,
    )
    op.create_index(op.f("ix_member_roaming_access_expires_at"), "member_roaming_access", ["expires_at"], unique=False)
    op.create_index(op.f("ix_member_roaming_access_revoked_at"), "member_roaming_access", ["revoked_at"], unique=False)

    op.execute("ALTER TABLE member_roaming_access ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE member_roaming_access FORCE ROW LEVEL SECURITY")
    op.execute("DROP POLICY IF EXISTS member_roaming_access_policy ON member_roaming_access")
    op.execute(
        f"""
        CREATE POLICY member_roaming_access_policy ON member_roaming_access
            FOR ALL
            USING (
                gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::uuid
                AND (
                    current_setting('app.current_user_role', true) IN {NON_CUSTOMER_ROLES}
                    OR member_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                )
            )
            WITH CHECK (
                gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::uuid
                AND (
                    current_setting('app.current_user_role', true) IN {NON_CUSTOMER_ROLES}
                    OR member_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                )
            )
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS member_roaming_access_policy ON member_roaming_access")
    op.execute("ALTER TABLE member_roaming_access NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE member_roaming_access DISABLE ROW LEVEL SECURITY")

    op.drop_index(op.f("ix_member_roaming_access_revoked_at"), table_name="member_roaming_access")
    op.drop_index(op.f("ix_member_roaming_access_expires_at"), table_name="member_roaming_access")
    op.drop_index(op.f("ix_member_roaming_access_granted_by_user_id"), table_name="member_roaming_access")
    op.drop_index(op.f("ix_member_roaming_access_member_id"), table_name="member_roaming_access")
    op.drop_index(op.f("ix_member_roaming_access_branch_id"), table_name="member_roaming_access")
    op.drop_index(op.f("ix_member_roaming_access_gym_id"), table_name="member_roaming_access")
    op.drop_table("member_roaming_access")
