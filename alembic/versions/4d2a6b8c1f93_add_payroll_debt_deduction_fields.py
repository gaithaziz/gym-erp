"""Add payroll debt deduction fields

Revision ID: 4d2a6b8c1f93
Revises: 1c9e2f7a4b8c
Create Date: 2026-05-02 03:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "4d2a6b8c1f93"
down_revision: Union[str, Sequence[str], None] = "1c9e2f7a4b8c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "payrolls",
        sa.Column("debt_deductions", sa.Float(), nullable=False, server_default="0.0"),
    )
    op.add_column("payrolls", sa.Column("debt_deduction_entry_id", sa.Uuid(), nullable=True))
    op.create_unique_constraint(
        "uq_payrolls_debt_deduction_entry_id",
        "payrolls",
        ["debt_deduction_entry_id"],
    )
    op.create_foreign_key(
        "fk_payrolls_debt_deduction_entry_id",
        "payrolls",
        "staff_debt_entries",
        ["debt_deduction_entry_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_payrolls_debt_deduction_entry_id", "payrolls", type_="foreignkey")
    op.drop_constraint("uq_payrolls_debt_deduction_entry_id", "payrolls", type_="unique")
    op.drop_column("payrolls", "debt_deduction_entry_id")
    op.drop_column("payrolls", "debt_deductions")
