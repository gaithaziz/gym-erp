"""Add diet lifecycle parity fields

Revision ID: a7d3b91f4c2e
Revises: 6a9f21b7c3d4
Create Date: 2026-02-25 08:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a7d3b91f4c2e"
down_revision: Union[str, Sequence[str], None] = "6a9f21b7c3d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("diet_plans", sa.Column("is_template", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("diet_plans", sa.Column("status", sa.String(), nullable=False, server_default="DRAFT"))
    op.add_column("diet_plans", sa.Column("version", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("diet_plans", sa.Column("parent_plan_id", sa.Uuid(), nullable=True))
    op.add_column("diet_plans", sa.Column("published_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("diet_plans", sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("diet_plans", sa.Column("content_structured", sa.JSON(), nullable=True))

    op.create_foreign_key(
        "fk_diet_plans_parent_plan_id_diet_plans",
        "diet_plans",
        "diet_plans",
        ["parent_plan_id"],
        ["id"],
    )

    op.execute("UPDATE diet_plans SET status = 'PUBLISHED'")
    op.execute("UPDATE diet_plans SET version = 1 WHERE version IS NULL")
    op.execute("UPDATE diet_plans SET is_template = false WHERE is_template IS NULL")
    op.execute("UPDATE diet_plans SET published_at = NOW() WHERE published_at IS NULL")

    op.create_index("ix_diet_plans_creator_status", "diet_plans", ["creator_id", "status"], unique=False)
    op.create_index("ix_diet_plans_member_status", "diet_plans", ["member_id", "status"], unique=False)
    op.create_index("ix_diet_plans_parent_plan_id", "diet_plans", ["parent_plan_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_diet_plans_parent_plan_id", table_name="diet_plans")
    op.drop_index("ix_diet_plans_member_status", table_name="diet_plans")
    op.drop_index("ix_diet_plans_creator_status", table_name="diet_plans")

    op.drop_constraint("fk_diet_plans_parent_plan_id_diet_plans", "diet_plans", type_="foreignkey")
    op.drop_column("diet_plans", "content_structured")
    op.drop_column("diet_plans", "archived_at")
    op.drop_column("diet_plans", "published_at")
    op.drop_column("diet_plans", "parent_plan_id")
    op.drop_column("diet_plans", "version")
    op.drop_column("diet_plans", "status")
    op.drop_column("diet_plans", "is_template")
