"""Add push delivery logs

Revision ID: d8e45c7f9a20
Revises: cc9f4d2a7e18
Create Date: 2026-04-16 00:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d8e45c7f9a20"
down_revision: Union[str, Sequence[str], None] = "cc9f4d2a7e18"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "push_delivery_logs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=True),
        sa.Column("device_id", sa.UUID(), nullable=True),
        sa.Column("device_token", sa.String(length=512), nullable=True),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("data_json", sa.Text(), nullable=True),
        sa.Column("event_type", sa.String(), nullable=False),
        sa.Column("event_ref", sa.String(), nullable=True),
        sa.Column("idempotency_key", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("provider_message_id", sa.String(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("attempt_count", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("failed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["device_id"], ["mobile_devices.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("idempotency_key", name="uq_push_delivery_logs_idempotency_key"),
    )
    op.create_index(op.f("ix_push_delivery_logs_device_id"), "push_delivery_logs", ["device_id"], unique=False)
    op.create_index(op.f("ix_push_delivery_logs_event_type"), "push_delivery_logs", ["event_type"], unique=False)
    op.create_index(op.f("ix_push_delivery_logs_status"), "push_delivery_logs", ["status"], unique=False)
    op.create_index(op.f("ix_push_delivery_logs_user_id"), "push_delivery_logs", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_push_delivery_logs_user_id"), table_name="push_delivery_logs")
    op.drop_index(op.f("ix_push_delivery_logs_status"), table_name="push_delivery_logs")
    op.drop_index(op.f("ix_push_delivery_logs_event_type"), table_name="push_delivery_logs")
    op.drop_index(op.f("ix_push_delivery_logs_device_id"), table_name="push_delivery_logs")
    op.drop_table("push_delivery_logs")
