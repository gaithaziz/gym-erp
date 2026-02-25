"""Add diet library items

Revision ID: 6a9f21b7c3d4
Revises: e3f4b2a1c9d8
Create Date: 2026-02-25 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "6a9f21b7c3d4"
down_revision: Union[str, Sequence[str], None] = "e3f4b2a1c9d8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "diet_library_items",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("is_global", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("owner_coach_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["owner_coach_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_diet_library_items_name", "diet_library_items", ["name"], unique=False)
    op.create_index("ix_diet_library_items_owner_coach_id", "diet_library_items", ["owner_coach_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_diet_library_items_owner_coach_id", table_name="diet_library_items")
    op.drop_index("ix_diet_library_items_name", table_name="diet_library_items")
    op.drop_table("diet_library_items")

