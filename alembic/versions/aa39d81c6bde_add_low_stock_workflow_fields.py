"""Add low stock workflow fields to products

Revision ID: aa39d81c6bde
Revises: b3f1a0de57c2
Create Date: 2026-02-20 01:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'aa39d81c6bde'
down_revision: Union[str, Sequence[str], None] = 'b3f1a0de57c2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('products', sa.Column('low_stock_restock_target', sa.Integer(), nullable=True))
    op.add_column('products', sa.Column('low_stock_acknowledged_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('products', sa.Column('low_stock_snoozed_until', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('products', 'low_stock_snoozed_until')
    op.drop_column('products', 'low_stock_acknowledged_at')
    op.drop_column('products', 'low_stock_restock_target')
