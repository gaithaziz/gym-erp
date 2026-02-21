"""Add is_template to workout plans

Revision ID: f2c8ad7495e1
Revises: e7b2a93cc4d0
Create Date: 2026-02-20 00:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f2c8ad7495e1'
down_revision: Union[str, Sequence[str], None] = 'e7b2a93cc4d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('workout_plans', sa.Column('is_template', sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('workout_plans', 'is_template')
