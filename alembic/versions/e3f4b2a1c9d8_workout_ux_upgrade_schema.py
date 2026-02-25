"""Workout UX upgrade schema

Revision ID: e3f4b2a1c9d8
Revises: d1e8a7b6c5d4
Create Date: 2026-02-25 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e3f4b2a1c9d8"
down_revision: Union[str, Sequence[str], None] = "d1e8a7b6c5d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("workout_plans", sa.Column("status", sa.String(), nullable=False, server_default="DRAFT"))
    op.add_column("workout_plans", sa.Column("version", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("workout_plans", sa.Column("parent_plan_id", sa.Uuid(), nullable=True))
    op.add_column("workout_plans", sa.Column("published_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("workout_plans", sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("workout_plans", sa.Column("expected_sessions_per_30d", sa.Integer(), nullable=False, server_default="12"))
    op.create_foreign_key(
        "fk_workout_plans_parent_plan_id_workout_plans",
        "workout_plans",
        "workout_plans",
        ["parent_plan_id"],
        ["id"],
    )

    # Migrate existing plans to published as requested in rollout assumptions.
    op.execute("UPDATE workout_plans SET status = 'PUBLISHED'")
    op.execute("UPDATE workout_plans SET published_at = NOW() WHERE published_at IS NULL")

    op.add_column("workout_exercises", sa.Column("video_provider", sa.String(), nullable=True))
    op.add_column("workout_exercises", sa.Column("video_id", sa.String(), nullable=True))
    op.add_column("workout_exercises", sa.Column("embed_url", sa.String(), nullable=True))
    op.add_column("workout_exercises", sa.Column("playback_type", sa.String(), nullable=True))

    op.create_table(
        "exercise_library_items",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("category", sa.String(), nullable=True),
        sa.Column("muscle_group", sa.String(), nullable=True),
        sa.Column("equipment", sa.String(), nullable=True),
        sa.Column("tags", sa.Text(), nullable=True),
        sa.Column("default_video_url", sa.String(), nullable=True),
        sa.Column("is_global", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("owner_coach_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["owner_coach_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_exercise_library_items_name", "exercise_library_items", ["name"], unique=False)
    op.create_index("ix_exercise_library_items_owner_coach_id", "exercise_library_items", ["owner_coach_id"], unique=False)

    op.create_table(
        "coach_exercise_templates",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("coach_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("section_name", sa.String(), nullable=True),
        sa.Column("exercise_library_item_id", sa.Uuid(), nullable=True),
        sa.Column("sets", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("reps", sa.Integer(), nullable=False, server_default="10"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["coach_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["exercise_library_item_id"], ["exercise_library_items.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_coach_exercise_templates_coach_id", "coach_exercise_templates", ["coach_id"], unique=False)

    op.create_table(
        "exercise_library_recent",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("coach_id", sa.Uuid(), nullable=False),
        sa.Column("exercise_library_item_id", sa.Uuid(), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["coach_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["exercise_library_item_id"], ["exercise_library_items.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_exercise_library_recent_coach_id", "exercise_library_recent", ["coach_id"], unique=False)
    op.create_index("ix_exercise_library_recent_last_used_at", "exercise_library_recent", ["last_used_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_exercise_library_recent_last_used_at", table_name="exercise_library_recent")
    op.drop_index("ix_exercise_library_recent_coach_id", table_name="exercise_library_recent")
    op.drop_table("exercise_library_recent")

    op.drop_index("ix_coach_exercise_templates_coach_id", table_name="coach_exercise_templates")
    op.drop_table("coach_exercise_templates")

    op.drop_index("ix_exercise_library_items_owner_coach_id", table_name="exercise_library_items")
    op.drop_index("ix_exercise_library_items_name", table_name="exercise_library_items")
    op.drop_table("exercise_library_items")

    op.drop_column("workout_exercises", "playback_type")
    op.drop_column("workout_exercises", "embed_url")
    op.drop_column("workout_exercises", "video_id")
    op.drop_column("workout_exercises", "video_provider")

    op.drop_constraint("fk_workout_plans_parent_plan_id_workout_plans", "workout_plans", type_="foreignkey")
    op.drop_column("workout_plans", "expected_sessions_per_30d")
    op.drop_column("workout_plans", "archived_at")
    op.drop_column("workout_plans", "published_at")
    op.drop_column("workout_plans", "parent_plan_id")
    op.drop_column("workout_plans", "version")
    op.drop_column("workout_plans", "status")
