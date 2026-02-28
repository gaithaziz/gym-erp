"""force baseline rls

Revision ID: c9d8e7f6a5b4
Revises: b4c5d6e7f8a9
Create Date: 2026-02-28 08:35:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "c9d8e7f6a5b4"
down_revision: Union[str, Sequence[str], None] = "b4c5d6e7f8a9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLES = [
    "subscriptions",
    "support_tickets",
    "support_messages",
    "lost_found_items",
    "lost_found_comments",
    "lost_found_media",
    "audit_logs",
]


def upgrade() -> None:
    for table in TABLES:
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")


def downgrade() -> None:
    for table in TABLES:
        op.execute(f"ALTER TABLE {table} NO FORCE ROW LEVEL SECURITY")
