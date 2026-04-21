"""add gym maintenance mode

Revision ID: c4b2a1f9e8d7
Revises: 3d0c7f9e7eb7
Create Date: 2026-04-21 08:05:00.000000

"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "c4b2a1f9e8d7"
down_revision: Union[str, Sequence[str], None] = "3d0c7f9e7eb7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE gyms
        ADD COLUMN IF NOT EXISTS is_maintenance_mode BOOLEAN NOT NULL DEFAULT FALSE
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE gyms
        DROP COLUMN IF EXISTS is_maintenance_mode
        """
    )
