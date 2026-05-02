"""Add facility assets

Revision ID: 9b7c6d5e4f21
Revises: c0b1d2e3f4a5
Create Date: 2026-05-02 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "9b7c6d5e4f21"
down_revision: Union[str, Sequence[str], None] = "c0b1d2e3f4a5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "facility_assets",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("gym_id", sa.Uuid(), nullable=False),
        sa.Column("branch_id", sa.Uuid(), nullable=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("asset_type", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("fix_expense_amount", sa.Numeric(12, 2), nullable=True),
        sa.Column("fix_expense_transaction_id", sa.Uuid(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("updated_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"]),
        sa.ForeignKeyConstraint(["fix_expense_transaction_id"], ["transactions.id"]),
        sa.ForeignKeyConstraint(["gym_id"], ["gyms.id"]),
        sa.ForeignKeyConstraint(["updated_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("gym_id", "branch_id", "name", "asset_type", name="uq_facility_assets_branch_name_type"),
    )
    op.create_index(op.f("ix_facility_assets_asset_type"), "facility_assets", ["asset_type"], unique=False)
    op.create_index(op.f("ix_facility_assets_branch_id"), "facility_assets", ["branch_id"], unique=False)
    op.create_index(op.f("ix_facility_assets_gym_id"), "facility_assets", ["gym_id"], unique=False)

    op.execute(
        """
        INSERT INTO facility_assets (
            id, gym_id, branch_id, name, asset_type, status, fix_expense_amount,
            fix_expense_transaction_id, note, is_active, updated_by_user_id, updated_at
        )
        SELECT
            id,
            gym_id,
            branch_id,
            machine_name,
            'MACHINE',
            CASE WHEN is_active THEN 'GOOD' ELSE 'NEED_MAINTENANCE' END,
            NULL,
            NULL,
            COALESCE(NULLIF(accessories_summary, ''), condition_notes, maintenance_notes),
            is_active,
            updated_by_user_id,
            updated_at
        FROM facility_machines
        """
    )
    op.execute(
        """
        INSERT INTO facility_assets (
            id, gym_id, branch_id, name, asset_type, status, fix_expense_amount,
            fix_expense_transaction_id, note, is_active, updated_by_user_id, updated_at
        )
        SELECT
            id,
            gym_id,
            branch_id,
            title,
            'FACILITY',
            CASE WHEN is_active THEN 'GOOD' ELSE 'NEED_MAINTENANCE' END,
            NULL,
            NULL,
            body,
            is_active,
            updated_by_user_id,
            updated_at
        FROM facility_sections
        """
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_facility_assets_gym_id"), table_name="facility_assets")
    op.drop_index(op.f("ix_facility_assets_branch_id"), table_name="facility_assets")
    op.drop_index(op.f("ix_facility_assets_asset_type"), table_name="facility_assets")
    op.drop_table("facility_assets")
