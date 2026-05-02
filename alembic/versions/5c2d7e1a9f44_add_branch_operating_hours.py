"""Add branch operating hours

Revision ID: 5c2d7e1a9f44
Revises: 7e2a4c5d6f81
Create Date: 2026-05-02 22:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "5c2d7e1a9f44"
down_revision: Union[str, Sequence[str], None] = "7e2a4c5d6f81"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "branch_operating_hours",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("gym_id", sa.UUID(), nullable=False),
        sa.Column("branch_id", sa.UUID(), nullable=False),
        sa.Column("weekday", sa.Integer(), nullable=False),
        sa.Column("is_closed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("open_time", sa.Time(), nullable=True),
        sa.Column("close_time", sa.Time(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["gym_id"], ["gyms.id"]),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("branch_id", "weekday", name="uq_branch_operating_hours_branch_weekday"),
    )
    op.create_index(op.f("ix_branch_operating_hours_branch_id"), "branch_operating_hours", ["branch_id"], unique=False)
    op.create_index(op.f("ix_branch_operating_hours_gym_id"), "branch_operating_hours", ["gym_id"], unique=False)
    op.create_index(op.f("ix_branch_operating_hours_weekday"), "branch_operating_hours", ["weekday"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_branch_operating_hours_weekday"), table_name="branch_operating_hours")
    op.drop_index(op.f("ix_branch_operating_hours_gym_id"), table_name="branch_operating_hours")
    op.drop_index(op.f("ix_branch_operating_hours_branch_id"), table_name="branch_operating_hours")
    op.drop_table("branch_operating_hours")
