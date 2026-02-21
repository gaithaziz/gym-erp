"""Add kiosk_id to access logs

Revision ID: d4e6bc1f2a90
Revises: a1f9d2c74b11
Create Date: 2026-02-20 00:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4e6bc1f2a90'
down_revision: Union[str, Sequence[str], None] = 'a1f9d2c74b11'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('access_logs', sa.Column('kiosk_id', sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('access_logs', 'kiosk_id')
