"""add chat tables

Revision ID: c1b2f7f4f0af
Revises: a128e3a9f44b
Create Date: 2026-02-22 06:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c1b2f7f4f0af"
down_revision: Union[str, Sequence[str], None] = "a128e3a9f44b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "chat_threads",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("customer_id", sa.Uuid(), nullable=False),
        sa.Column("coach_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["coach_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["customer_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("customer_id", "coach_id", name="uq_chat_threads_customer_coach"),
    )
    op.create_index(op.f("ix_chat_threads_coach_id"), "chat_threads", ["coach_id"], unique=False)
    op.create_index(op.f("ix_chat_threads_customer_id"), "chat_threads", ["customer_id"], unique=False)
    op.create_index(op.f("ix_chat_threads_last_message_at"), "chat_threads", ["last_message_at"], unique=False)

    op.create_table(
        "chat_messages",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("thread_id", sa.Uuid(), nullable=False),
        sa.Column("sender_id", sa.Uuid(), nullable=False),
        sa.Column("message_type", sa.String(), nullable=False),
        sa.Column("text_content", sa.Text(), nullable=True),
        sa.Column("media_url", sa.String(), nullable=True),
        sa.Column("media_mime", sa.String(), nullable=True),
        sa.Column("media_size_bytes", sa.Integer(), nullable=True),
        sa.Column("voice_duration_seconds", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.ForeignKeyConstraint(["sender_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["thread_id"], ["chat_threads.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_chat_messages_created_at"), "chat_messages", ["created_at"], unique=False)
    op.create_index(op.f("ix_chat_messages_sender_id"), "chat_messages", ["sender_id"], unique=False)
    op.create_index(op.f("ix_chat_messages_thread_id"), "chat_messages", ["thread_id"], unique=False)

    op.create_table(
        "chat_read_receipts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("thread_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("last_read_message_id", sa.Uuid(), nullable=True),
        sa.Column("last_read_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["last_read_message_id"], ["chat_messages.id"]),
        sa.ForeignKeyConstraint(["thread_id"], ["chat_threads.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("thread_id", "user_id", name="uq_chat_read_receipts_thread_user"),
    )
    op.create_index(op.f("ix_chat_read_receipts_thread_id"), "chat_read_receipts", ["thread_id"], unique=False)
    op.create_index(op.f("ix_chat_read_receipts_user_id"), "chat_read_receipts", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_chat_read_receipts_user_id"), table_name="chat_read_receipts")
    op.drop_index(op.f("ix_chat_read_receipts_thread_id"), table_name="chat_read_receipts")
    op.drop_table("chat_read_receipts")

    op.drop_index(op.f("ix_chat_messages_thread_id"), table_name="chat_messages")
    op.drop_index(op.f("ix_chat_messages_sender_id"), table_name="chat_messages")
    op.drop_index(op.f("ix_chat_messages_created_at"), table_name="chat_messages")
    op.drop_table("chat_messages")

    op.drop_index(op.f("ix_chat_threads_last_message_at"), table_name="chat_threads")
    op.drop_index(op.f("ix_chat_threads_customer_id"), table_name="chat_threads")
    op.drop_index(op.f("ix_chat_threads_coach_id"), table_name="chat_threads")
    op.drop_table("chat_threads")
