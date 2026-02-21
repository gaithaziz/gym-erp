"""add workout session tables

Revision ID: 1d9a62c4f8a1
Revises: 7b2f3c11a9de
Create Date: 2026-02-21 00:00:01.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "1d9a62c4f8a1"
down_revision: Union[str, Sequence[str], None] = "7b2f3c11a9de"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "workout_sessions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("member_id", sa.Uuid(), nullable=False),
        sa.Column("plan_id", sa.Uuid(), nullable=False),
        sa.Column("performed_at", sa.DateTime(), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["member_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["plan_id"], ["workout_plans.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "workout_session_entries",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("session_id", sa.Uuid(), nullable=False),
        sa.Column("exercise_id", sa.Uuid(), nullable=True),
        sa.Column("exercise_name", sa.String(), nullable=True),
        sa.Column("target_sets", sa.Integer(), nullable=True),
        sa.Column("target_reps", sa.Integer(), nullable=True),
        sa.Column("sets_completed", sa.Integer(), nullable=False),
        sa.Column("reps_completed", sa.Integer(), nullable=False),
        sa.Column("weight_kg", sa.Float(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("order", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["workout_sessions.id"]),
        sa.ForeignKeyConstraint(["exercise_id"], ["exercises.id"]),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("workout_session_entries")
    op.drop_table("workout_sessions")

