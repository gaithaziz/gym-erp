"""Change transaction amount to numeric

Revision ID: c8a7e21d6f4b
Revises: f2c8ad7495e1
Create Date: 2026-02-20 00:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c8a7e21d6f4b'
down_revision: Union[str, Sequence[str], None] = 'f2c8ad7495e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.alter_column(
        "transactions",
        "amount",
        existing_type=sa.Float(),
        type_=sa.Numeric(12, 2),
        existing_nullable=False,
        postgresql_using="amount::numeric(12,2)",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column(
        "transactions",
        "amount",
        existing_type=sa.Numeric(12, 2),
        type_=sa.Float(),
        existing_nullable=False,
        postgresql_using="amount::double precision",
    )
