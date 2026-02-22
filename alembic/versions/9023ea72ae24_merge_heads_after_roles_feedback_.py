"""merge heads after roles feedback whatsapp

Revision ID: 9023ea72ae24
Revises: 1d9a62c4f8a1, 9f3c2b4d1a77
Create Date: 2026-02-22 05:32:41.647161

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9023ea72ae24'
down_revision: Union[str, Sequence[str], None] = ('1d9a62c4f8a1', '9f3c2b4d1a77')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
