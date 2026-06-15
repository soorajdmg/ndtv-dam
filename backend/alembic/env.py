import os
import sys
from logging.config import fileConfig
from pathlib import Path

from sqlalchemy import engine_from_config, pool
from alembic import context

# ── sys.path fix ──────────────────────────────────────────────────────────────
# Alembic runs from various working directories depending on the environment
# (Docker container, Render native build, local dev). We must ensure that the
# directory containing the `app` package is always on sys.path before importing
# any app.* module.
#
# Directory layout (both local and in Docker):
#   <backend_root>/
#       alembic/          ← this file lives here
#       alembic.ini
#       app/              ← the package we need to import
#
# So the backend root is always one level above this file's directory.
_here = Path(__file__).resolve().parent          # .../backend/alembic/
_backend_root = _here.parent                      # .../backend/
for _p in [str(_backend_root), "/app"]:
    if _p not in sys.path:
        sys.path.insert(0, _p)
# ─────────────────────────────────────────────────────────────────────────────

# Load models so Alembic can auto-detect schema changes
from app.models import Base  # noqa: F401  (must come after sys.path fix)

config = context.config

# Override sqlalchemy.url from environment; swap asyncpg → psycopg2 for sync migrations
database_url = os.environ.get("DATABASE_URL", config.get_main_option("sqlalchemy.url"))
if database_url and "asyncpg" in database_url:
    database_url = database_url.replace("postgresql+asyncpg", "postgresql+psycopg2")
config.set_main_option("sqlalchemy.url", database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


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
