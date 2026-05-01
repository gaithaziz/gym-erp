"""Add announcements table

Revision ID: 8a1d3e5f7b22
Revises: 6b9c2d1f4a11
Create Date: 2026-05-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '8a1d3e5f7b22'
down_revision: Union[str, Sequence[str], None] = '6b9c2d1f4a11'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'announcements',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('gym_id', sa.Uuid(), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('audience', sa.String(length=32), nullable=False),
        sa.Column('is_published', sa.Boolean(), nullable=False),
        sa.Column('push_enabled', sa.Boolean(), nullable=False),
        sa.Column('published_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_by_user_id', sa.Uuid(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['created_by_user_id'], ['users.id']),
        sa.ForeignKeyConstraint(['gym_id'], ['gyms.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_announcements_gym_id'), 'announcements', ['gym_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_announcements_gym_id'), table_name='announcements')
    op.drop_table('announcements')
