"""add member plan tracker tables

Revision ID: 2b6d4b1e8f90
Revises: 1f4b7c9d2a10
Create Date: 2026-04-13 02:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "2b6d4b1e8f90"
down_revision: Union[str, Sequence[str], None] = "1f4b7c9d2a10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("workout_session_entries", sa.Column("is_pr", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("workout_session_entries", sa.Column("pr_type", sa.String(), nullable=True))
    op.add_column("workout_session_entries", sa.Column("pr_value", sa.String(), nullable=True))
    op.add_column("workout_session_entries", sa.Column("pr_notes", sa.Text(), nullable=True))

    op.create_table(
        "workout_session_drafts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("member_id", sa.Uuid(), nullable=False),
        sa.Column("plan_id", sa.Uuid(), nullable=False),
        sa.Column("section_name", sa.String(), nullable=True),
        sa.Column("current_exercise_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["member_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["plan_id"], ["workout_plans.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_workout_session_drafts_member_id", "workout_session_drafts", ["member_id"], unique=False)
    op.create_index("ix_workout_session_drafts_plan_id", "workout_session_drafts", ["plan_id"], unique=False)

    op.create_table(
        "workout_session_draft_entries",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("draft_id", sa.Uuid(), nullable=False),
        sa.Column("workout_exercise_id", sa.Uuid(), nullable=True),
        sa.Column("exercise_id", sa.Uuid(), nullable=True),
        sa.Column("exercise_name", sa.String(), nullable=True),
        sa.Column("section_name", sa.String(), nullable=True),
        sa.Column("target_sets", sa.Integer(), nullable=True),
        sa.Column("target_reps", sa.Integer(), nullable=True),
        sa.Column("target_duration_minutes", sa.Integer(), nullable=True),
        sa.Column("video_type", sa.String(), nullable=True),
        sa.Column("video_url", sa.String(), nullable=True),
        sa.Column("uploaded_video_url", sa.String(), nullable=True),
        sa.Column("video_provider", sa.String(), nullable=True),
        sa.Column("video_id", sa.String(), nullable=True),
        sa.Column("embed_url", sa.String(), nullable=True),
        sa.Column("playback_type", sa.String(), nullable=True),
        sa.Column("sets_completed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reps_completed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("weight_kg", sa.Float(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_pr", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("pr_type", sa.String(), nullable=True),
        sa.Column("pr_value", sa.String(), nullable=True),
        sa.Column("pr_notes", sa.Text(), nullable=True),
        sa.Column("skipped", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("order", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["draft_id"], ["workout_session_drafts.id"]),
        sa.ForeignKeyConstraint(["exercise_id"], ["exercises.id"]),
        sa.ForeignKeyConstraint(["workout_exercise_id"], ["workout_exercises.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_workout_session_draft_entries_draft_id", "workout_session_draft_entries", ["draft_id"], unique=False)

    op.create_table(
        "member_diet_tracking_days",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("member_id", sa.Uuid(), nullable=False),
        sa.Column("diet_plan_id", sa.Uuid(), nullable=False),
        sa.Column("tracked_for", sa.Date(), nullable=False),
        sa.Column("adherence_rating", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["diet_plan_id"], ["diet_plans.id"]),
        sa.ForeignKeyConstraint(["member_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("member_id", "diet_plan_id", "tracked_for", name="uq_member_diet_tracking_day"),
    )
    op.create_index("ix_member_diet_tracking_days_member_id", "member_diet_tracking_days", ["member_id"], unique=False)
    op.create_index("ix_member_diet_tracking_days_diet_plan_id", "member_diet_tracking_days", ["diet_plan_id"], unique=False)
    op.create_index("ix_member_diet_tracking_days_tracked_for", "member_diet_tracking_days", ["tracked_for"], unique=False)

    op.create_table(
        "member_diet_tracking_meals",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tracking_day_id", sa.Uuid(), nullable=False),
        sa.Column("meal_key", sa.String(), nullable=False),
        sa.Column("meal_name", sa.String(), nullable=False),
        sa.Column("completed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["tracking_day_id"], ["member_diet_tracking_days.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tracking_day_id", "meal_key", name="uq_member_diet_tracking_meal"),
    )
    op.create_index("ix_member_diet_tracking_meals_tracking_day_id", "member_diet_tracking_meals", ["tracking_day_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_member_diet_tracking_meals_tracking_day_id", table_name="member_diet_tracking_meals")
    op.drop_table("member_diet_tracking_meals")

    op.drop_index("ix_member_diet_tracking_days_tracked_for", table_name="member_diet_tracking_days")
    op.drop_index("ix_member_diet_tracking_days_diet_plan_id", table_name="member_diet_tracking_days")
    op.drop_index("ix_member_diet_tracking_days_member_id", table_name="member_diet_tracking_days")
    op.drop_table("member_diet_tracking_days")

    op.drop_index("ix_workout_session_draft_entries_draft_id", table_name="workout_session_draft_entries")
    op.drop_table("workout_session_draft_entries")

    op.drop_index("ix_workout_session_drafts_plan_id", table_name="workout_session_drafts")
    op.drop_index("ix_workout_session_drafts_member_id", table_name="workout_session_drafts")
    op.drop_table("workout_session_drafts")

    op.drop_column("workout_session_entries", "pr_notes")
    op.drop_column("workout_session_entries", "pr_value")
    op.drop_column("workout_session_entries", "pr_type")
    op.drop_column("workout_session_entries", "is_pr")
