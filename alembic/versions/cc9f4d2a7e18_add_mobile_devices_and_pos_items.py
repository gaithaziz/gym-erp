"""Add mobile devices and POS transaction items

Revision ID: cc9f4d2a7e18
Revises: 2b6d4b1e8f90, 7b2f3c11a9de, 7e1d4f2c9ab0
Create Date: 2026-04-16 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "cc9f4d2a7e18"
down_revision: Union[str, Sequence[str], None] = ("2b6d4b1e8f90", "7b2f3c11a9de", "7e1d4f2c9ab0")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "mobile_devices",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("device_token", sa.String(length=512), nullable=False),
        sa.Column("platform", sa.String(length=32), nullable=False),
        sa.Column("device_name", sa.String(length=120), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("registered_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("unregistered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("device_token", name="uq_mobile_devices_device_token"),
    )
    op.create_index(op.f("ix_mobile_devices_device_token"), "mobile_devices", ["device_token"], unique=False)
    op.create_index(op.f("ix_mobile_devices_user_id"), "mobile_devices", ["user_id"], unique=False)

    op.create_table(
        "pos_transaction_items",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("transaction_id", sa.UUID(), nullable=False),
        sa.Column("product_id", sa.UUID(), nullable=True),
        sa.Column("product_name", sa.String(), nullable=False),
        sa.Column("unit_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("line_total", sa.Numeric(12, 2), nullable=False),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"]),
        sa.ForeignKeyConstraint(["transaction_id"], ["transactions.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_pos_transaction_items_transaction_id"), "pos_transaction_items", ["transaction_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_pos_transaction_items_transaction_id"), table_name="pos_transaction_items")
    op.drop_table("pos_transaction_items")
    op.drop_index(op.f("ix_mobile_devices_user_id"), table_name="mobile_devices")
    op.drop_index(op.f("ix_mobile_devices_device_token"), table_name="mobile_devices")
    op.drop_table("mobile_devices")
