"""add_classes_module

Revision ID: a2c9f1d4e8b7
Revises: 1f6d3b8c2a44
Create Date: 2026-04-19 19:15:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a2c9f1d4e8b7"
down_revision: str | Sequence[str] | None = "1f6d3b8c2a44"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # --- class_templates ---
    op.create_table(
        "class_templates",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("category", sa.String(), nullable=True),
        sa.Column("duration_minutes", sa.Integer(), nullable=False, server_default="60"),
        sa.Column("capacity", sa.Integer(), nullable=False, server_default="20"),
        sa.Column("color", sa.String(length=20), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_by_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # --- class_sessions ---
    op.create_table(
        "class_sessions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("template_id", sa.UUID(), nullable=False),
        sa.Column("coach_id", sa.UUID(), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("capacity_override", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.String(),
            nullable=False,
            server_default="SCHEDULED",
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["template_id"], ["class_templates.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["coach_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_class_sessions_starts_at", "class_sessions", ["starts_at"])
    op.create_index("ix_class_sessions_template_id", "class_sessions", ["template_id"])
    op.create_index("ix_class_sessions_coach_id", "class_sessions", ["coach_id"])

    # --- class_reservations ---
    op.create_table(
        "class_reservations",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("session_id", sa.UUID(), nullable=False),
        sa.Column("member_id", sa.UUID(), nullable=False),
        sa.Column(
            "status",
            sa.String(),
            nullable=False,
            server_default="RESERVED",
        ),
        sa.Column("attended", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("reserved_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["session_id"], ["class_sessions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["member_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("session_id", "member_id", name="uq_class_reservation_session_member"),
    )
    op.create_index("ix_class_reservations_session_id", "class_reservations", ["session_id"])
    op.create_index("ix_class_reservations_member_id", "class_reservations", ["member_id"])


def downgrade() -> None:
    op.drop_table("class_reservations")
    op.drop_table("class_sessions")
    op.drop_table("class_templates")
