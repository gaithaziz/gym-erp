"""Add facility machines and sections

Revision ID: 9c3b1d2a4f33
Revises: 8a1d3e5f7b22
Create Date: 2026-05-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '9c3b1d2a4f33'
down_revision: Union[str, Sequence[str], None] = '8a1d3e5f7b22'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'facility_machines',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('gym_id', sa.Uuid(), nullable=False),
        sa.Column('branch_id', sa.Uuid(), nullable=True),
        sa.Column('machine_name', sa.String(length=255), nullable=False),
        sa.Column('accessories_summary', sa.Text(), nullable=True),
        sa.Column('condition_notes', sa.Text(), nullable=True),
        sa.Column('maintenance_notes', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('updated_by_user_id', sa.Uuid(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['branch_id'], ['branches.id']),
        sa.ForeignKeyConstraint(['gym_id'], ['gyms.id']),
        sa.ForeignKeyConstraint(['updated_by_user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('gym_id', 'branch_id', 'machine_name', name='uq_facility_machines_branch_name'),
    )
    op.create_table(
        'facility_sections',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('gym_id', sa.Uuid(), nullable=False),
        sa.Column('branch_id', sa.Uuid(), nullable=True),
        sa.Column('section_key', sa.String(length=120), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('sort_order', sa.Integer(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('updated_by_user_id', sa.Uuid(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['branch_id'], ['branches.id']),
        sa.ForeignKeyConstraint(['gym_id'], ['gyms.id']),
        sa.ForeignKeyConstraint(['updated_by_user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('gym_id', 'branch_id', 'section_key', name='uq_facility_sections_branch_key'),
    )


def downgrade() -> None:
    op.drop_table('facility_sections')
    op.drop_table('facility_machines')
