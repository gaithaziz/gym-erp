"""normalize lost and found categories

Revision ID: e2c4d6b8f0a1
Revises: d1c2b3a4e5f6
Create Date: 2026-04-23 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e2c4d6b8f0a1"
down_revision: Union[str, Sequence[str], None] = "d1c2b3a4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE lost_found_items DISABLE ROW LEVEL SECURITY")
    op.execute(
        """
        UPDATE lost_found_items
        SET category = 'LOST'
        WHERE category IS NULL
           OR category = ''
           OR category NOT IN ('LOST', 'FOUND')
        """
    )
    op.create_check_constraint(
        "ck_lost_found_items_category",
        "lost_found_items",
        "category IN ('LOST', 'FOUND')",
    )
    op.execute("ALTER TABLE lost_found_items ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_constraint("ck_lost_found_items_category", "lost_found_items", type_="check")
