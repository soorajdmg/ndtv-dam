import os
import sys
from logging.config import fileConfig
from pathlib import Path

from sqlalchemy import engine_from_config, pool
from sqlalchemy.orm import DeclarativeBase
from alembic import context

# ── sys.path fix ──────────────────────────────────────────────────────────────
_here = Path(__file__).resolve().parent   # .../alembic/
_backend_root = _here.parent              # .../  (contains app/)
for _p in [str(_backend_root), "/app"]:
    if _p not in sys.path:
        sys.path.insert(0, _p)
# ─────────────────────────────────────────────────────────────────────────────

# Define a standalone Base purely for Alembic metadata.
# We do NOT import app.models here — those imports drag in pydantic-settings,
# sqlalchemy async engine creation, and other runtime deps that can fail in the
# build/migration environment. The individual migration scripts (versions/*.py)
# define the schema directly via op.create_table(), so Alembic does NOT need
# the ORM models to run existing migrations. target_metadata=None is correct
# for a migrations-only (non-autogenerate) workflow.
target_metadata = None

config = context.config

# Override sqlalchemy.url from environment; swap asyncpg → psycopg2 for sync migrations
database_url = os.environ.get("DATABASE_URL", config.get_main_option("sqlalchemy.url"))
if database_url and "asyncpg" in database_url:
    database_url = database_url.replace("postgresql+asyncpg", "postgresql+psycopg2")
config.set_main_option("sqlalchemy.url", database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
