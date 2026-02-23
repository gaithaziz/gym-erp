"""add media fields to support messages

Revision ID: b8e2d2f54a1f
Revises: 699939ca0cfb
Create Date: 2026-02-24 01:33:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b8e2d2f54a1f'
down_revision: Union[str, Sequence[str], None] = '699939ca0cfb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('support_messages', sa.Column('media_url', sa.Text(), nullable=True))
    op.add_column('support_messages', sa.Column('media_mime', sa.String(length=100), nullable=True))
    op.add_column('support_messages', sa.Column('media_size_bytes', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('support_messages', 'media_size_bytes')
    op.drop_column('support_messages', 'media_mime')
    op.drop_column('support_messages', 'media_url')
