"""add manual workout sections and videos

Revision ID: 7b2f3c11a9de
Revises: aa39d81c6bde
Create Date: 2026-02-21 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "7b2f3c11a9de"
down_revision: Union[str, Sequence[str], None] = "aa39d81c6bde"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("workout_exercises", "exercise_id", existing_type=sa.UUID(), nullable=True)
    op.add_column("workout_exercises", sa.Column("exercise_name", sa.String(), nullable=True))
    op.add_column("workout_exercises", sa.Column("section_name", sa.String(), nullable=True))
    op.add_column("workout_exercises", sa.Column("video_type", sa.String(), nullable=True))
    op.add_column("workout_exercises", sa.Column("video_url", sa.String(), nullable=True))
    op.add_column("workout_exercises", sa.Column("uploaded_video_url", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("workout_exercises", "uploaded_video_url")
    op.drop_column("workout_exercises", "video_url")
    op.drop_column("workout_exercises", "video_type")
    op.drop_column("workout_exercises", "section_name")
    op.drop_column("workout_exercises", "exercise_name")
    op.alter_column("workout_exercises", "exercise_id", existing_type=sa.UUID(), nullable=False)
