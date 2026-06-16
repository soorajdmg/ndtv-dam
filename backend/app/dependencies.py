from typing import AsyncGenerator

import redis.asyncio as aioredis
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from qdrant_client import AsyncQdrantClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.database import get_db  # re-export for convenience

__all__ = ["get_db", "get_qdrant_client", "get_redis_client", "get_settings", "get_current_user"]

_bearer = HTTPBearer(auto_error=False)


async def get_qdrant_client(
    settings: Settings = Depends(get_settings),
) -> AsyncGenerator[AsyncQdrantClient, None]:
    if settings.qdrant_api_key:
        # Qdrant Cloud: use full URL + API key
        host = settings.qdrant_host
        if not host.startswith("http"):
            scheme = "https" if settings.qdrant_use_https else "http"
            host = f"{scheme}://{host}"
        client = AsyncQdrantClient(url=host, api_key=settings.qdrant_api_key)
    else:
        # Local Qdrant: host + port (no auth)
        client = AsyncQdrantClient(host=settings.qdrant_host, port=settings.qdrant_port)
    try:
        yield client
    finally:
        await client.close()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
):
    """FastAPI dependency that returns the authenticated User or raises 401."""
    from app.models.user_models import User
    from app.services.auth_service import decode_access_token

    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    email = decode_access_token(credentials.credentials)
    if email is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    result = await db.execute(select(User).where(User.email == email, User.is_active == True))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


async def get_redis_client(
    settings: Settings = Depends(get_settings),
) -> AsyncGenerator[aioredis.Redis, None]:
    client = aioredis.from_url(settings.redis_url, decode_responses=True)
    try:
        yield client
    finally:
        await client.aclose()
