"""Add session_name to class_sessions

Revision ID: b1a2c3d4e5f6
Revises: a2c9f1d4e8b7
Create Date: 2026-04-19 23:20:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b1a2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "a2c9f1d4e8b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("class_sessions", sa.Column("session_name", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("class_sessions", "session_name")
