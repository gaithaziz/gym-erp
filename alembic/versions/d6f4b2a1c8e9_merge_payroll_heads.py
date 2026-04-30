"""Merge payroll heads

Revision ID: d6f4b2a1c8e9
Revises: 8a2c5f7d1f3d, a3f5d7c9b1e2
Create Date: 2026-04-29 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "d6f4b2a1c8e9"
down_revision: Union[str, Sequence[str], None] = ("8a2c5f7d1f3d", "a3f5d7c9b1e2")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""

