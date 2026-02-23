"""Add payroll payment linkage fields

Revision ID: c4f7f1d2a6b9
Revises: b8e2d2f54a1f
Create Date: 2026-02-23 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4f7f1d2a6b9'
down_revision: Union[str, Sequence[str], None] = 'b8e2d2f54a1f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('payrolls', sa.Column('paid_transaction_id', sa.Uuid(), nullable=True))
    op.add_column('payrolls', sa.Column('paid_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('payrolls', sa.Column('paid_by_user_id', sa.Uuid(), nullable=True))
    op.create_foreign_key('fk_payrolls_paid_transaction_id', 'payrolls', 'transactions', ['paid_transaction_id'], ['id'])
    op.create_foreign_key('fk_payrolls_paid_by_user_id', 'payrolls', 'users', ['paid_by_user_id'], ['id'])


def downgrade() -> None:
    op.drop_constraint('fk_payrolls_paid_by_user_id', 'payrolls', type_='foreignkey')
    op.drop_constraint('fk_payrolls_paid_transaction_id', 'payrolls', type_='foreignkey')
    op.drop_column('payrolls', 'paid_by_user_id')
    op.drop_column('payrolls', 'paid_at')
    op.drop_column('payrolls', 'paid_transaction_id')
