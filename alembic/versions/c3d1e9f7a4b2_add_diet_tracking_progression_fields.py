"""Add diet tracking progression fields

Revision ID: c3d1e9f7a4b2
Revises: fb95e975094d
Create Date: 2026-04-22 07:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3d1e9f7a4b2'
down_revision: Union[str, Sequence[str], None] = 'fb95e975094d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('member_diet_tracking_days', sa.Column('active_day_id', sa.String(), nullable=True))
    op.add_column(
        'member_diet_tracking_days',
        sa.Column('current_meal_index', sa.Integer(), nullable=False, server_default='0'),
    )
    op.add_column(
        'member_diet_tracking_meals',
        sa.Column('skipped', sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    op.alter_column('member_diet_tracking_days', 'current_meal_index', server_default=None)
    op.alter_column('member_diet_tracking_meals', 'skipped', server_default=None)


def downgrade() -> None:
    op.drop_column('member_diet_tracking_meals', 'skipped')
    op.drop_column('member_diet_tracking_days', 'current_meal_index')
    op.drop_column('member_diet_tracking_days', 'active_day_id')
