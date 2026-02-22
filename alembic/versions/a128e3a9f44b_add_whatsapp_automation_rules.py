"""Add whatsapp automation rules

Revision ID: a128e3a9f44b
Revises: 9023ea72ae24
Create Date: 2026-02-22 10:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a128e3a9f44b"
down_revision: Union[str, Sequence[str], None] = "9023ea72ae24"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "whatsapp_automation_rules",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("event_type", sa.String(), nullable=False),
        sa.Column("trigger_name", sa.String(), nullable=False),
        sa.Column("template_key", sa.String(), nullable=False),
        sa.Column("message_template", sa.Text(), nullable=True),
        sa.Column("is_enabled", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_by", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("event_type", name="uq_whatsapp_automation_rules_event_type"),
    )
    op.create_index("ix_whatsapp_automation_rules_event_type", "whatsapp_automation_rules", ["event_type"], unique=False)

    op.execute(
        """
        INSERT INTO whatsapp_automation_rules
        (id, event_type, trigger_name, template_key, message_template, is_enabled, created_at)
        VALUES
        ('11111111-1111-1111-1111-111111111111', 'ACCESS_GRANTED', 'Member QR access granted', 'activity_check_in',
         'Hi {{member_name}}, your check-in was recorded at {{scan_time}} via {{kiosk_id}}.', true, now()),
        ('22222222-2222-2222-2222-222222222222', 'SUBSCRIPTION_CREATED', 'Subscription created', 'subscription_updated',
         'Hi {{member_name}}, your subscription {{plan_name}} is now active.', true, now()),
        ('33333333-3333-3333-3333-333333333333', 'SUBSCRIPTION_RENEWED', 'Subscription renewed', 'subscription_updated',
         'Hi {{member_name}}, your subscription {{plan_name}} has been renewed.', true, now()),
        ('44444444-4444-4444-4444-444444444444', 'SUBSCRIPTION_STATUS_CHANGED', 'Subscription status updated', 'subscription_status_changed',
         'Hi {{member_name}}, your subscription status changed to {{status}}.', true, now())
        """
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_whatsapp_automation_rules_event_type", table_name="whatsapp_automation_rules")
    op.drop_table("whatsapp_automation_rules")
