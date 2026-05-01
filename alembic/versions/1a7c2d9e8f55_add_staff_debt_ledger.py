"""add staff debt ledger

Revision ID: 1a7c2d9e8f55
Revises: 9c3b1d2a4f33
Create Date: 2026-05-01 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "1a7c2d9e8f55"
down_revision = "9c3b1d2a4f33"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "staff_debt_accounts",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("gym_id", sa.Uuid(), sa.ForeignKey("gyms.id"), nullable=False, index=True),
        sa.Column("branch_id", sa.Uuid(), sa.ForeignKey("branches.id"), nullable=True, index=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("current_balance", sa.Numeric(12, 2), nullable=False, server_default=sa.text("0")),
        sa.Column("notes", sa.String(), nullable=True),
        sa.Column("updated_by_user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("gym_id", "user_id", name="uq_staff_debt_accounts_gym_user"),
    )

    op.create_table(
        "staff_debt_entries",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("gym_id", sa.Uuid(), sa.ForeignKey("gyms.id"), nullable=False, index=True),
        sa.Column("branch_id", sa.Uuid(), sa.ForeignKey("branches.id"), nullable=True, index=True),
        sa.Column("account_id", sa.Uuid(), sa.ForeignKey("staff_debt_accounts.id"), nullable=False, index=True),
        sa.Column("entry_type", sa.String(length=16), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("balance_before", sa.Numeric(12, 2), nullable=False, server_default=sa.text("0")),
        sa.Column("balance_after", sa.Numeric(12, 2), nullable=False, server_default=sa.text("0")),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("notes", sa.String(), nullable=True),
        sa.Column("created_by_user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP"), index=True),
    )

    op.create_table(
        "staff_debt_monthly_balances",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("gym_id", sa.Uuid(), sa.ForeignKey("gyms.id"), nullable=False, index=True),
        sa.Column("branch_id", sa.Uuid(), sa.ForeignKey("branches.id"), nullable=True, index=True),
        sa.Column("account_id", sa.Uuid(), sa.ForeignKey("staff_debt_accounts.id"), nullable=False, index=True),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("opening_balance", sa.Numeric(12, 2), nullable=False, server_default=sa.text("0")),
        sa.Column("advances_total", sa.Numeric(12, 2), nullable=False, server_default=sa.text("0")),
        sa.Column("deductions_total", sa.Numeric(12, 2), nullable=False, server_default=sa.text("0")),
        sa.Column("repayments_total", sa.Numeric(12, 2), nullable=False, server_default=sa.text("0")),
        sa.Column("settlements_total", sa.Numeric(12, 2), nullable=False, server_default=sa.text("0")),
        sa.Column("adjustments_total", sa.Numeric(12, 2), nullable=False, server_default=sa.text("0")),
        sa.Column("closing_balance", sa.Numeric(12, 2), nullable=False, server_default=sa.text("0")),
        sa.Column("entry_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("updated_by_user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("account_id", "year", "month", name="uq_staff_debt_monthly_balances_account_period"),
    )


def downgrade() -> None:
    op.drop_table("staff_debt_monthly_balances")
    op.drop_table("staff_debt_entries")
    op.drop_table("staff_debt_accounts")
