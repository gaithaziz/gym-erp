"""Add payroll approval and period fields

Revision ID: 1c9e2f7a4b8c
Revises: d6f4b2a1c8e9
Create Date: 2026-04-29 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "1c9e2f7a4b8c"
down_revision: Union[str, Sequence[str], None] = "d6f4b2a1c8e9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("payrolls", sa.Column("period_start", sa.DateTime(timezone=True), nullable=True))
    op.add_column("payrolls", sa.Column("period_end", sa.DateTime(timezone=True), nullable=True))
    op.add_column("payrolls", sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("payrolls", sa.Column("approved_by_user_id", sa.Uuid(), nullable=True))
    op.alter_column(
        "payrolls",
        "status",
        existing_type=sa.String(length=7),
        type_=sa.String(length=8),
        existing_nullable=False,
    )
    op.create_foreign_key(
        "fk_payrolls_approved_by_user_id_users",
        "payrolls",
        "users",
        ["approved_by_user_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_payrolls_approved_by_user_id_users", "payrolls", type_="foreignkey")
    op.alter_column(
        "payrolls",
        "status",
        existing_type=sa.String(length=8),
        type_=sa.String(length=7),
        existing_nullable=False,
    )
    op.drop_column("payrolls", "approved_by_user_id")
    op.drop_column("payrolls", "approved_at")
    op.drop_column("payrolls", "period_end")
    op.drop_column("payrolls", "period_start")
