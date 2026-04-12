"""add mobile notification preferences

Revision ID: 4c2f91e7a1b3
Revises: c4f7f1d2a6b9
Create Date: 2026-04-12 02:35:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "4c2f91e7a1b3"
down_revision: Union[str, Sequence[str], None] = "c4f7f1d2a6b9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "mobile_notification_preferences",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("push_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("chat_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("support_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("billing_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("announcements_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("user_id"),
    )


def downgrade() -> None:
    op.drop_table("mobile_notification_preferences")
