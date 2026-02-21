"""Add transaction idempotency key

Revision ID: b3f1a0de57c2
Revises: c8a7e21d6f4b
Create Date: 2026-02-20 00:50:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b3f1a0de57c2'
down_revision: Union[str, Sequence[str], None] = 'c8a7e21d6f4b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('transactions', sa.Column('idempotency_key', sa.String(), nullable=True))
    op.create_index(op.f('ix_transactions_idempotency_key'), 'transactions', ['idempotency_key'], unique=True)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_transactions_idempotency_key'), table_name='transactions')
    op.drop_column('transactions', 'idempotency_key')
