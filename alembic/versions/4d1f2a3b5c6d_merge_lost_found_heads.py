"""merge lost found heads

Revision ID: 4d1f2a3b5c6d
Revises: 7d1a5c8e2f44, e2c4d6b8f0a1
Create Date: 2026-04-26 00:00:00.000000
"""

from typing import Sequence, Union


# revision identifiers, used by Alembic.
revision: str = "4d1f2a3b5c6d"
down_revision: Union[str, Sequence[str], None] = ("7d1a5c8e2f44", "e2c4d6b8f0a1")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
