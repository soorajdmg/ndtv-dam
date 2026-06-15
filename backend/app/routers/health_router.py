import redis.asyncio as aioredis
from fastapi import APIRouter, Depends
from qdrant_client import AsyncQdrantClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.dependencies import get_db, get_qdrant_client, get_redis_client

router = APIRouter(prefix="/health", tags=["health"])


@router.get("", summary="Health check", description="Returns service status and connectivity checks for all dependencies.")
async def health_check(
    db: AsyncSession = Depends(get_db),
    qdrant: AsyncQdrantClient = Depends(get_qdrant_client),
    redis: aioredis.Redis = Depends(get_redis_client),
    settings=Depends(get_settings),
):
    status = {"service": "ndtv-dam-backend", "status": "ok", "checks": {}}

    # PostgreSQL
    try:
        await db.execute(text("SELECT 1"))
        status["checks"]["postgres"] = "ok"
    except Exception as e:
        status["checks"]["postgres"] = f"error: {e}"
        status["status"] = "degraded"

    # Qdrant
    try:
        await qdrant.get_collections()
        status["checks"]["qdrant"] = "ok"
    except Exception as e:
        status["checks"]["qdrant"] = f"error: {e}"
        status["status"] = "degraded"

    # Redis
    try:
        await redis.ping()
        status["checks"]["redis"] = "ok"
    except Exception as e:
        status["checks"]["redis"] = f"error: {e}"
        status["status"] = "degraded"

    # ─── AI Service Circuit Breakers ──────────────────────────────────────────
    # Import module-level flags directly to avoid loading the heavy models
    try:
        from app.services import face_service, birefnet_service

        face_degraded = face_service.FACE_SERVICE_DEGRADED
        face_failures = face_service._face_failures
        status["checks"]["face_service"] = (
            "degraded (circuit open)" if face_degraded else "ok"
        )
        status["checks"]["face_service_consecutive_failures"] = face_failures

        birefnet_degraded = birefnet_service.BIREFNET_DEGRADED
        birefnet_failures = birefnet_service._birefnet_failures
        status["checks"]["birefnet_service"] = (
            "degraded (circuit open)" if birefnet_degraded else "ok"
        )
        status["checks"]["birefnet_service_consecutive_failures"] = birefnet_failures

        if face_degraded or birefnet_degraded:
            status["status"] = "degraded"
    except Exception as e:
        status["checks"]["ai_services"] = f"error reading circuit state: {e}"

    return status


@router.post("/reset-circuit/{service}", summary="Reset AI service circuit breaker")
async def reset_circuit_breaker(service: str):
    """
    Manually reset a tripped circuit breaker so the service can attempt recovery.
    Accepts: 'face' or 'birefnet'.
    """
    if service == "face":
        from app.services import face_service
        face_service._record_success()
        return {"service": "face_service", "status": "circuit reset"}
    elif service == "birefnet":
        from app.services import birefnet_service
        birefnet_service._record_success()
        return {"service": "birefnet_service", "status": "circuit reset"}
    else:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=f"Unknown service '{service}'. Use 'face' or 'birefnet'.")
