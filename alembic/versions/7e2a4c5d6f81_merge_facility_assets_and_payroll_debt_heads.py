"""Merge facility assets and payroll debt deduction heads

Revision ID: 7e2a4c5d6f81
Revises: 4d2a6b8c1f93, 9b7c6d5e4f21
Create Date: 2026-05-02 04:05:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "7e2a4c5d6f81"
down_revision: Union[str, Sequence[str], None] = ("4d2a6b8c1f93", "9b7c6d5e4f21")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
