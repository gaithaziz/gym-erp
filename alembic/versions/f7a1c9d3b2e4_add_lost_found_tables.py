"""add lost and found tables

Revision ID: f7a1c9d3b2e4
Revises: c1b2f7f4f0af
Create Date: 2026-02-22 13:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f7a1c9d3b2e4"
down_revision: Union[str, Sequence[str], None] = "c1b2f7f4f0af"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


lost_found_status_enum = sa.Enum(
    "REPORTED",
    "UNDER_REVIEW",
    "READY_FOR_PICKUP",
    "CLOSED",
    "REJECTED",
    "DISPOSED",
    name="lostfoundstatus",
    native_enum=False,
)


def upgrade() -> None:
    op.create_table(
        "lost_found_items",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("reporter_id", sa.Uuid(), nullable=False),
        sa.Column("assignee_id", sa.Uuid(), nullable=True),
        sa.Column("status", lost_found_status_enum, nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("category", sa.String(), nullable=False),
        sa.Column("found_date", sa.Date(), nullable=True),
        sa.Column("found_location", sa.String(), nullable=True),
        sa.Column("contact_note", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["reporter_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["assignee_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_lost_found_items_reporter_id"), "lost_found_items", ["reporter_id"], unique=False)
    op.create_index(op.f("ix_lost_found_items_assignee_id"), "lost_found_items", ["assignee_id"], unique=False)
    op.create_index(op.f("ix_lost_found_items_status"), "lost_found_items", ["status"], unique=False)
    op.create_index(op.f("ix_lost_found_items_created_at"), "lost_found_items", ["created_at"], unique=False)

    op.create_table(
        "lost_found_media",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("item_id", sa.Uuid(), nullable=False),
        sa.Column("uploader_id", sa.Uuid(), nullable=False),
        sa.Column("media_url", sa.String(), nullable=False),
        sa.Column("media_mime", sa.String(), nullable=False),
        sa.Column("media_size_bytes", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["item_id"], ["lost_found_items.id"]),
        sa.ForeignKeyConstraint(["uploader_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_lost_found_media_item_id"), "lost_found_media", ["item_id"], unique=False)

    op.create_table(
        "lost_found_comments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("item_id", sa.Uuid(), nullable=False),
        sa.Column("author_id", sa.Uuid(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["item_id"], ["lost_found_items.id"]),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_lost_found_comments_item_id"), "lost_found_comments", ["item_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_lost_found_comments_item_id"), table_name="lost_found_comments")
    op.drop_table("lost_found_comments")

    op.drop_index(op.f("ix_lost_found_media_item_id"), table_name="lost_found_media")
    op.drop_table("lost_found_media")

    op.drop_index(op.f("ix_lost_found_items_created_at"), table_name="lost_found_items")
    op.drop_index(op.f("ix_lost_found_items_status"), table_name="lost_found_items")
    op.drop_index(op.f("ix_lost_found_items_assignee_id"), table_name="lost_found_items")
    op.drop_index(op.f("ix_lost_found_items_reporter_id"), table_name="lost_found_items")
    op.drop_table("lost_found_items")
