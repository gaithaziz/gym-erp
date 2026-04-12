"""merge mobile notification preferences heads

Revision ID: 7e1d4f2c9ab0
Revises: 4c2f91e7a1b3, d1c2b3a4e5f6
Create Date: 2026-04-12 02:42:00.000000
"""

from typing import Sequence, Union


revision: str = "7e1d4f2c9ab0"
down_revision: Union[str, Sequence[str], None] = ("4c2f91e7a1b3", "d1c2b3a4e5f6")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
