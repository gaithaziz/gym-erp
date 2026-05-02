"""Add subscription bundle change logs

Revision ID: c0b1d2e3f4a5
Revises: f0a1b2c3d4e5
Create Date: 2026-05-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c0b1d2e3f4a5"
down_revision: Union[str, Sequence[str], None] = "f0a1b2c3d4e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "subscription_bundle_change_logs",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("gym_id", sa.Uuid(), sa.ForeignKey("gyms.id"), nullable=False, index=True),
        sa.Column("branch_id", sa.Uuid(), sa.ForeignKey("branches.id"), nullable=True, index=True),
        sa.Column("subscription_id", sa.Uuid(), sa.ForeignKey("subscriptions.id"), nullable=False, index=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("change_type", sa.String(length=32), nullable=False),
        sa.Column("previous_plan_name", sa.String(), nullable=True),
        sa.Column("new_plan_name", sa.String(), nullable=True),
        sa.Column("previous_start_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("new_start_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("previous_end_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("new_end_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_by_user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )


def downgrade() -> None:
    op.drop_table("subscription_bundle_change_logs")
