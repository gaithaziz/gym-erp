"""add workout session review workflow

Revision ID: 1f6d3b8c2a44
Revises: 8a6c0d1e9f33
Create Date: 2026-04-18 00:00:02.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "1f6d3b8c2a44"
down_revision = "8a6c0d1e9f33"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "workout_sessions",
        sa.Column("review_status", sa.String(), nullable=False, server_default="UNREVIEWED"),
    )
    op.add_column("workout_sessions", sa.Column("reviewed_at", sa.DateTime(), nullable=True))
    op.add_column("workout_sessions", sa.Column("reviewed_by_user_id", sa.UUID(), nullable=True))
    op.add_column("workout_sessions", sa.Column("reviewer_note", sa.Text(), nullable=True))
    op.create_foreign_key(
        "workout_sessions_reviewed_by_user_id_fkey",
        "workout_sessions",
        "users",
        ["reviewed_by_user_id"],
        ["id"],
    )
    op.alter_column("workout_sessions", "review_status", server_default=None)


def downgrade() -> None:
    op.drop_constraint("workout_sessions_reviewed_by_user_id_fkey", "workout_sessions", type_="foreignkey")
    op.drop_column("workout_sessions", "reviewer_note")
    op.drop_column("workout_sessions", "reviewed_by_user_id")
    op.drop_column("workout_sessions", "reviewed_at")
    op.drop_column("workout_sessions", "review_status")
