"""Add payroll settings and partial payroll payments

Revision ID: d1e8a7b6c5d4
Revises: c4f7f1d2a6b9
Create Date: 2026-02-24 04:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d1e8a7b6c5d4"
down_revision: Union[str, Sequence[str], None] = "c4f7f1d2a6b9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "payroll_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("salary_cutoff_day", sa.Integer(), nullable=False, server_default="1"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.execute("INSERT INTO payroll_settings (id, salary_cutoff_day) VALUES (1, 1)")

    op.create_table(
        "payroll_payments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("payroll_id", sa.Uuid(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("payment_method", sa.Enum("CASH", "CARD", "TRANSFER", "SYSTEM", name="paymentmethod", native_enum=False), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("transaction_id", sa.Uuid(), nullable=False),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("paid_by_user_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["paid_by_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["payroll_id"], ["payrolls.id"]),
        sa.ForeignKeyConstraint(["transaction_id"], ["transactions.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("transaction_id"),
    )
    op.create_index("ix_payroll_payments_payroll_id", "payroll_payments", ["payroll_id"], unique=False)
    op.create_index("ix_payroll_payments_paid_at", "payroll_payments", ["paid_at"], unique=False)

    op.alter_column(
        "payrolls",
        "status",
        existing_type=sa.Enum("DRAFT", "PAID", name="payrollstatus", native_enum=False),
        type_=sa.Enum("DRAFT", "PARTIAL", "PAID", name="payrollstatus", native_enum=False),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "payrolls",
        "status",
        existing_type=sa.Enum("DRAFT", "PARTIAL", "PAID", name="payrollstatus", native_enum=False),
        type_=sa.Enum("DRAFT", "PAID", name="payrollstatus", native_enum=False),
        existing_nullable=False,
    )
    op.drop_index("ix_payroll_payments_paid_at", table_name="payroll_payments")
    op.drop_index("ix_payroll_payments_payroll_id", table_name="payroll_payments")
    op.drop_table("payroll_payments")
    op.drop_table("payroll_settings")
