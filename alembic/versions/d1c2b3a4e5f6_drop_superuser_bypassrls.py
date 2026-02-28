"""drop superuser bypassrls for app role

Revision ID: d1c2b3a4e5f6
Revises: c9d8e7f6a5b4
Create Date: 2026-02-28 08:45:00.000000

"""
from typing import Sequence, Union

from alembic import op

from app.config import settings


# revision identifiers, used by Alembic.
revision: str = "d1c2b3a4e5f6"
down_revision: Union[str, Sequence[str], None] = "c9d8e7f6a5b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _quoted_role_name() -> str:
    return '"' + settings.POSTGRES_USER.replace('"', '""') + '"'


def upgrade() -> None:
    op.execute(f"ALTER ROLE {_quoted_role_name()} NOSUPERUSER NOBYPASSRLS")


def downgrade() -> None:
    op.execute(f"ALTER ROLE {_quoted_role_name()} SUPERUSER BYPASSRLS")
