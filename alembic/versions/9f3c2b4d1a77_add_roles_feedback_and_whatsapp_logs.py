"""Add roles, feedback tables, and whatsapp delivery logs

Revision ID: 9f3c2b4d1a77
Revises: fe27ab52359a
Create Date: 2026-02-22 06:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "9f3c2b4d1a77"
down_revision: Union[str, Sequence[str], None] = "fe27ab52359a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "diet_feedback",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("member_id", sa.Uuid(), nullable=False),
        sa.Column("diet_plan_id", sa.Uuid(), nullable=False),
        sa.Column("coach_id", sa.Uuid(), nullable=True),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["coach_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["diet_plan_id"], ["diet_plans.id"]),
        sa.ForeignKeyConstraint(["member_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_diet_feedback_member_id", "diet_feedback", ["member_id"], unique=False)
    op.create_index("ix_diet_feedback_diet_plan_id", "diet_feedback", ["diet_plan_id"], unique=False)
    op.create_index("ix_diet_feedback_coach_id", "diet_feedback", ["coach_id"], unique=False)
    op.create_index("ix_diet_feedback_created_at", "diet_feedback", ["created_at"], unique=False)

    op.create_table(
        "gym_feedback",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("member_id", sa.Uuid(), nullable=False),
        sa.Column("category", sa.String(), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["member_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_gym_feedback_member_id", "gym_feedback", ["member_id"], unique=False)
    op.create_index("ix_gym_feedback_created_at", "gym_feedback", ["created_at"], unique=False)

    op.create_table(
        "whatsapp_delivery_logs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("phone_number", sa.String(), nullable=True),
        sa.Column("template_key", sa.String(), nullable=False),
        sa.Column("payload_json", sa.Text(), nullable=True),
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
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("idempotency_key", name="uq_whatsapp_delivery_logs_idempotency_key"),
    )
    op.create_index("ix_whatsapp_delivery_logs_user_id", "whatsapp_delivery_logs", ["user_id"], unique=False)
    op.create_index("ix_whatsapp_delivery_logs_status", "whatsapp_delivery_logs", ["status"], unique=False)
    op.create_index("ix_whatsapp_delivery_logs_event_type", "whatsapp_delivery_logs", ["event_type"], unique=False)

    op.create_index(
        "ix_access_logs_status_scan_time_user_id",
        "access_logs",
        ["status", "scan_time", "user_id"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_access_logs_status_scan_time_user_id", table_name="access_logs")

    op.drop_index("ix_whatsapp_delivery_logs_event_type", table_name="whatsapp_delivery_logs")
    op.drop_index("ix_whatsapp_delivery_logs_status", table_name="whatsapp_delivery_logs")
    op.drop_index("ix_whatsapp_delivery_logs_user_id", table_name="whatsapp_delivery_logs")
    op.drop_table("whatsapp_delivery_logs")

    op.drop_index("ix_gym_feedback_created_at", table_name="gym_feedback")
    op.drop_index("ix_gym_feedback_member_id", table_name="gym_feedback")
    op.drop_table("gym_feedback")

    op.drop_index("ix_diet_feedback_created_at", table_name="diet_feedback")
    op.drop_index("ix_diet_feedback_coach_id", table_name="diet_feedback")
    op.drop_index("ix_diet_feedback_diet_plan_id", table_name="diet_feedback")
    op.drop_index("ix_diet_feedback_member_id", table_name="diet_feedback")
    op.drop_table("diet_feedback")
