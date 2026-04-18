"""add workout session feedback and set details

Revision ID: 8a6c0d1e9f33
Revises: 5c1e9a7b4d22
Create Date: 2026-04-18 00:00:01.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "8a6c0d1e9f33"
down_revision: Union[str, Sequence[str], None] = "5c1e9a7b4d22"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("workout_sessions", sa.Column("rpe", sa.Integer(), nullable=True))
    op.add_column("workout_sessions", sa.Column("pain_level", sa.Integer(), nullable=True))
    op.add_column("workout_sessions", sa.Column("effort_feedback", sa.String(), nullable=True))
    op.add_column("workout_sessions", sa.Column("attachment_url", sa.String(), nullable=True))
    op.add_column("workout_sessions", sa.Column("attachment_mime", sa.String(), nullable=True))
    op.add_column("workout_sessions", sa.Column("attachment_size_bytes", sa.Integer(), nullable=True))
    op.add_column("workout_session_entries", sa.Column("set_details", sa.Text(), nullable=True))
    op.add_column("workout_session_draft_entries", sa.Column("set_details", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("workout_session_draft_entries", "set_details")
    op.drop_column("workout_session_entries", "set_details")
    op.drop_column("workout_sessions", "attachment_size_bytes")
    op.drop_column("workout_sessions", "attachment_mime")
    op.drop_column("workout_sessions", "attachment_url")
    op.drop_column("workout_sessions", "effort_feedback")
    op.drop_column("workout_sessions", "pain_level")
    op.drop_column("workout_sessions", "rpe")
