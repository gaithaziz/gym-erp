"""Add branch-scoped announcement targeting

Revision ID: f0a1b2c3d4e5
Revises: 1a7c2d9e8f55
Create Date: 2026-05-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f0a1b2c3d4e5"
down_revision: Union[str, Sequence[str], None] = "1a7c2d9e8f55"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "announcements",
        sa.Column("target_scope", sa.String(length=32), nullable=False, server_default=sa.text("'ALL_BRANCHES'")),
    )
    op.add_column(
        "announcements",
        sa.Column("branch_id", sa.Uuid(), nullable=True),
    )
    op.create_index(op.f("ix_announcements_branch_id"), "announcements", ["branch_id"], unique=False)
    op.create_foreign_key("fk_announcements_branch_id_branches", "announcements", "branches", ["branch_id"], ["id"])


def downgrade() -> None:
    op.drop_constraint("fk_announcements_branch_id_branches", "announcements", type_="foreignkey")
    op.drop_index(op.f("ix_announcements_branch_id"), table_name="announcements")
    op.drop_column("announcements", "branch_id")
    op.drop_column("announcements", "target_scope")
