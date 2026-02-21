"""Add payroll uniqueness constraint

Revision ID: e7b2a93cc4d0
Revises: d4e6bc1f2a90
Create Date: 2026-02-20 00:20:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'e7b2a93cc4d0'
down_revision: Union[str, Sequence[str], None] = 'd4e6bc1f2a90'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_unique_constraint(
        "uq_payroll_user_month_year",
        "payrolls",
        ["user_id", "month", "year"],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(
        "uq_payroll_user_month_year",
        "payrolls",
        type_="unique",
    )
