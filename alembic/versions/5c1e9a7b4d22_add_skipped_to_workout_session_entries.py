"""add skipped to workout session entries

Revision ID: 5c1e9a7b4d22
Revises: e4a7b2c9d1f0
Create Date: 2026-04-18 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "5c1e9a7b4d22"
down_revision: Union[str, Sequence[str], None] = "e4a7b2c9d1f0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "workout_session_entries",
        sa.Column("skipped", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.alter_column("workout_session_entries", "skipped", server_default=None)


def downgrade() -> None:
    op.drop_column("workout_session_entries", "skipped")
