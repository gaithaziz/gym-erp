"""Add membership policy and perk tables

Revision ID: 2a4b6c8d9e10
Revises: 1c9e2f7a4b8c
Create Date: 2026-05-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '2a4b6c8d9e10'
down_revision: Union[str, Sequence[str], None] = '1c9e2f7a4b8c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'policy_documents',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('gym_id', sa.Uuid(), nullable=False),
        sa.Column('locale', sa.String(length=8), nullable=False),
        sa.Column('version', sa.String(length=32), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('effective_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('intro', sa.Text(), nullable=False),
        sa.Column('sections_json', sa.Text(), nullable=False),
        sa.Column('footer_note', sa.Text(), nullable=False),
        sa.Column('created_by_user_id', sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(['created_by_user_id'], ['users.id']),
        sa.ForeignKeyConstraint(['gym_id'], ['gyms.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('gym_id', 'locale', name='uq_policy_documents_gym_locale'),
    )
    op.create_table(
        'policy_signatures',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('gym_id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('locale', sa.String(length=8), nullable=False),
        sa.Column('policy_version', sa.String(length=32), nullable=False),
        sa.Column('signer_name', sa.String(length=255), nullable=False),
        sa.Column('accepted', sa.Boolean(), nullable=False),
        sa.Column('signed_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['gym_id'], ['gyms.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('gym_id', 'user_id', 'locale', name='uq_policy_signatures_user_locale'),
    )
    op.create_table(
        'perk_accounts',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('gym_id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('perk_key', sa.String(length=120), nullable=False),
        sa.Column('perk_label', sa.String(length=255), nullable=False),
        sa.Column('period_type', sa.String(length=32), nullable=False),
        sa.Column('total_allowance', sa.Integer(), nullable=False),
        sa.Column('used_allowance', sa.Integer(), nullable=False),
        sa.Column('contract_starts_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('contract_ends_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('monthly_reset_day', sa.Integer(), nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['gym_id'], ['gyms.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('gym_id', 'user_id', 'perk_key', 'period_type', name='uq_perk_accounts_user_key_period'),
    )
    op.create_table(
        'perk_usages',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('gym_id', sa.Uuid(), nullable=False),
        sa.Column('perk_account_id', sa.Uuid(), nullable=False),
        sa.Column('used_amount', sa.Integer(), nullable=False),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('used_by_user_id', sa.Uuid(), nullable=True),
        sa.Column('used_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['gym_id'], ['gyms.id']),
        sa.ForeignKeyConstraint(['perk_account_id'], ['perk_accounts.id']),
        sa.ForeignKeyConstraint(['used_by_user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('perk_usages')
    op.drop_table('perk_accounts')
    op.drop_table('policy_signatures')
    op.drop_table('policy_documents')
