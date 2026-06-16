from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings


class Base(DeclarativeBase):
    pass


# Engine and session factory are created lazily on first use so that simply
# importing this module (e.g. from alembic env.py) does not immediately call
# create_async_engine. This prevents ModuleNotFoundError / import-time crashes
# when DATABASE_URL is not yet resolved or when alembic loads the module just
# to read table metadata.
_engine = None
_AsyncSessionLocal = None


def _get_engine():
    global _engine
    if _engine is None:
        settings = get_settings()
        # Ensure the URL uses the asyncpg driver.
        # Neon and some other providers give plain postgresql:// or postgres:// URLs.
        url = settings.database_url
        for sync_prefix in ("postgresql://", "postgres://"):
            if url.startswith(sync_prefix):
                url = "postgresql+asyncpg://" + url[len(sync_prefix):]
                break

        # asyncpg does not accept ?sslmode=require as a query param.
        # Strip it and pass ssl=True via connect_args instead.
        ssl_required = "sslmode=require" in url
        url = url.replace("?sslmode=require", "").replace("&sslmode=require", "")

        connect_args = {"ssl": True} if ssl_required else {}

        _engine = create_async_engine(
            url,
            echo=False,
            # Keep pool small for Neon free tier (~20 max connections shared with Celery workers)
            pool_size=3,
            max_overflow=5,
            pool_pre_ping=True,
            connect_args=connect_args,
        )
    return _engine


def _get_session_factory():
    global _AsyncSessionLocal
    if _AsyncSessionLocal is None:
        _AsyncSessionLocal = async_sessionmaker(
            _get_engine(),
            class_=AsyncSession,
            expire_on_commit=False,
            autocommit=False,
            autoflush=False,
        )
    return _AsyncSessionLocal


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    session_factory = _get_session_factory()
    async with session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
