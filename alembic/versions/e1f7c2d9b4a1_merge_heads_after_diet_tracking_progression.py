"""Merge heads after diet tracking progression

Revision ID: e1f7c2d9b4a1
Revises: 7c6e0f4a1b92, c3d1e9f7a4b2
Create Date: 2026-04-22 07:32:00.000000

"""
from typing import Sequence, Union

from alembic import op  # noqa: F401


# revision identifiers, used by Alembic.
revision: str = 'e1f7c2d9b4a1'
down_revision: Union[str, Sequence[str], None] = ('7c6e0f4a1b92', 'c3d1e9f7a4b2')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
