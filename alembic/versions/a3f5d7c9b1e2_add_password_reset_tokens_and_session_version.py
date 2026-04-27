"""Add password reset tokens and session version

Revision ID: a3f5d7c9b1e2
Revises: e1f7c2d9b4a1
Create Date: 2026-04-27 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a3f5d7c9b1e2"
down_revision: Union[str, Sequence[str], None] = ("e1f7c2d9b4a1", "4d1f2a3b5c6d")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("session_version", sa.Integer(), nullable=False, server_default="0"),
    )

    op.create_table(
        "password_reset_tokens",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("gym_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.String(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash", name="uq_password_reset_tokens_token_hash"),
    )
    op.create_index(op.f("ix_password_reset_tokens_expires_at"), "password_reset_tokens", ["expires_at"], unique=False)
    op.create_index(op.f("ix_password_reset_tokens_gym_id"), "password_reset_tokens", ["gym_id"], unique=False)
    op.create_index(op.f("ix_password_reset_tokens_used_at"), "password_reset_tokens", ["used_at"], unique=False)
    op.create_index(op.f("ix_password_reset_tokens_user_id"), "password_reset_tokens", ["user_id"], unique=False)
    op.execute('ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY')
    op.execute('ALTER TABLE password_reset_tokens FORCE ROW LEVEL SECURITY')
    op.execute("""
        CREATE POLICY tenant_isolation_policy ON password_reset_tokens
        FOR ALL
        USING (
            COALESCE(current_setting('app.current_user_role', true), 'ANONYMOUS') = 'SUPER_ADMIN'
            OR (
                gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::uuid
                AND current_setting('app.current_user_role', true) IN ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'FRONT_DESK', 'RECEPTION', 'COACH', 'EMPLOYEE', 'CASHIER')
            )
        )
    """)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation_policy ON password_reset_tokens")
    op.execute("ALTER TABLE password_reset_tokens NO FORCE ROW LEVEL SECURITY")
    op.drop_index(op.f("ix_password_reset_tokens_user_id"), table_name="password_reset_tokens")
    op.drop_index(op.f("ix_password_reset_tokens_used_at"), table_name="password_reset_tokens")
    op.drop_index(op.f("ix_password_reset_tokens_gym_id"), table_name="password_reset_tokens")
    op.drop_index(op.f("ix_password_reset_tokens_expires_at"), table_name="password_reset_tokens")
    op.drop_table("password_reset_tokens")
    op.drop_column("users", "session_version")
