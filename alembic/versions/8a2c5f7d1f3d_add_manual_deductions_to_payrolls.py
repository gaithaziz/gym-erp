"""Add manual deductions to payrolls

Revision ID: 8a2c5f7d1f3d
Revises: fe27ab52359a
Create Date: 2026-04-29 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "8a2c5f7d1f3d"
down_revision: Union[str, Sequence[str], None] = "fe27ab52359a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("payrolls", sa.Column("manual_deductions", sa.Float(), nullable=False, server_default="0.0"))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("payrolls", "manual_deductions")
