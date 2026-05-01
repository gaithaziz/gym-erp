"""Add private coaching package tables

Revision ID: 6b9c2d1f4a11
Revises: 2a4b6c8d9e10
Create Date: 2026-05-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '6b9c2d1f4a11'
down_revision: Union[str, Sequence[str], None] = '2a4b6c8d9e10'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'coaching_packages',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('gym_id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('coach_id', sa.Uuid(), nullable=True),
        sa.Column('package_key', sa.String(length=120), nullable=False),
        sa.Column('package_label', sa.String(length=255), nullable=False),
        sa.Column('total_sessions', sa.Integer(), nullable=False),
        sa.Column('used_sessions', sa.Integer(), nullable=False),
        sa.Column('start_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('end_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['coach_id'], ['users.id']),
        sa.ForeignKeyConstraint(['gym_id'], ['gyms.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('gym_id', 'user_id', 'coach_id', 'package_key', name='uq_coaching_packages_user_coach_key'),
    )
    op.create_index(op.f('ix_coaching_packages_coach_id'), 'coaching_packages', ['coach_id'], unique=False)
    op.create_index(op.f('ix_coaching_packages_user_id'), 'coaching_packages', ['user_id'], unique=False)
    op.create_table(
        'coaching_package_ledger',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('gym_id', sa.Uuid(), nullable=False),
        sa.Column('package_id', sa.Uuid(), nullable=False),
        sa.Column('session_delta', sa.Integer(), nullable=False),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('performed_by_user_id', sa.Uuid(), nullable=True),
        sa.Column('performed_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['gym_id'], ['gyms.id']),
        sa.ForeignKeyConstraint(['package_id'], ['coaching_packages.id']),
        sa.ForeignKeyConstraint(['performed_by_user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_coaching_package_ledger_package_id'), 'coaching_package_ledger', ['package_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_coaching_package_ledger_package_id'), table_name='coaching_package_ledger')
    op.drop_table('coaching_package_ledger')
    op.drop_index(op.f('ix_coaching_packages_user_id'), table_name='coaching_packages')
    op.drop_index(op.f('ix_coaching_packages_coach_id'), table_name='coaching_packages')
    op.drop_table('coaching_packages')
