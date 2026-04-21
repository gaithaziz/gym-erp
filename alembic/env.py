import asyncio
from logging.config import fileConfig

import sqlalchemy as sa
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context
from alembic.autogenerate import rewriter
from alembic.operations import ops

from app.database import Base
from app.config import settings

# Rewriter to automatically add RLS policies to new tables with gym_id
rls_rewriter = rewriter.Rewriter()

NON_CUSTOMER_ROLES = "('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'FRONT_DESK', 'RECEPTION', 'COACH', 'EMPLOYEE', 'CASHIER')"

@rls_rewriter.rewrites(ops.CreateTableOp)
def create_table_rls(context, revision, op):
    has_gym_id = any(
        isinstance(c, sa.Column) and c.name == "gym_id" 
        for c in op.columns
    )
    if has_gym_id:
        table_name = op.table_name
        # Check for user identity columns to include self-access
        user_col = None
        for c in op.columns:
            if not isinstance(c, sa.Column): continue
            if c.name in ["user_id", "member_id", "customer_id"]:
                user_col = c.name
                break
        
        user_check = f"OR ({user_col} = NULLIF(current_setting('app.current_user_id', true), '')::uuid)" if user_col else ""
        
        return [
            op,
            ops.ExecuteSQLOp(f'ALTER TABLE "{table_name}" ENABLE ROW LEVEL SECURITY'),
            ops.ExecuteSQLOp(f'ALTER TABLE "{table_name}" FORCE ROW LEVEL SECURITY'),
            ops.ExecuteSQLOp(f"""
                CREATE POLICY tenant_isolation_policy ON "{table_name}"
                FOR ALL
                USING (
                    COALESCE(current_setting('app.current_user_role', true), 'ANONYMOUS') = 'SUPER_ADMIN'
                    OR (
                        gym_id = NULLIF(current_setting('app.current_gym_id', true), '')::uuid
                        AND (
                            current_setting('app.current_user_role', true) IN {NON_CUSTOMER_ROLES}
                            {user_check}
                        )
                    )
                )
            """)
        ]
    return op

# Import all models to ensure they are attached to Base.metadata
from app.models.user import *
from app.models.access import *
from app.models.hr import *
from app.models.finance import *
from app.models.fitness import *
from app.models.inventory import *
from app.models.gamification import *
from app.models.audit import *
from app.models.workout_log import *
from app.models.auth import *
from app.models.notification import *
from app.models.chat import *
from app.models.lost_found import *
from app.models.classes import *
from app.models.tenancy import *

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# add your model's MetaData object here
# for 'autogenerate' support
target_metadata = Base.metadata

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.

def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = str(settings.SQLALCHEMY_DATABASE_URI)
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        process_revision_directives=rls_rewriter,
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection, 
        target_metadata=target_metadata,
        process_revision_directives=rls_rewriter,
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    configuration = config.get_section(config.config_ini_section)
    if configuration is None:
        configuration = {}
    configuration["sqlalchemy.url"] = str(settings.SQLALCHEMY_DATABASE_URI)
    
    connectable = async_engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
