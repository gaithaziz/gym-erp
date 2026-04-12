"""add subscription renewal requests

Revision ID: 1f4b7c9d2a10
Revises: 7e1d4f2c9ab0
Create Date: 2026-04-12 03:40:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "1f4b7c9d2a10"
down_revision: Union[str, Sequence[str], None] = "7e1d4f2c9ab0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "subscription_renewal_requests",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("offer_code", sa.String(), nullable=False),
        sa.Column("plan_name", sa.String(), nullable=False),
        sa.Column("duration_days", sa.Integer(), nullable=False),
        sa.Column("customer_note", sa.String(), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "PENDING",
                "APPROVED",
                "REJECTED",
                "CANCELLED",
                name="renewalrequeststatus",
                native_enum=False,
            ),
            nullable=False,
            server_default="PENDING",
        ),
        sa.Column("requested_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reviewed_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("reviewer_note", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(["reviewed_by_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_subscription_renewal_requests_user_id",
        "subscription_renewal_requests",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "ix_subscription_renewal_requests_status",
        "subscription_renewal_requests",
        ["status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_subscription_renewal_requests_status", table_name="subscription_renewal_requests")
    op.drop_index("ix_subscription_renewal_requests_user_id", table_name="subscription_renewal_requests")
    op.drop_table("subscription_renewal_requests")
