import logging
import uuid
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator

from app.config import get_settings
from app.routers import (
    admin_router,
    asset_router,
    batch_router,
    health_router,
    person_router,
    review_router,
    search_router,
    upload_router,
)

settings = get_settings()

# ─── Structured Logging ───────────────────────────────────────────────────────
structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
)
log = structlog.get_logger("ndtv-dam")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    log.info("Starting NDTV DAM backend", env=settings.database_url[:20] + "...")

    # Ensure Qdrant collections exist
    from qdrant_client import AsyncQdrantClient
    from qdrant_client.models import Distance, VectorParams

    # Build client — supports both local (host+port) and Qdrant Cloud (URL+API key)
    if settings.qdrant_api_key:
        host = settings.qdrant_host
        if not host.startswith("http"):
            scheme = "https" if settings.qdrant_use_https else "http"
            host = f"{scheme}://{host}"
        qdrant = AsyncQdrantClient(url=host, api_key=settings.qdrant_api_key)
    else:
        qdrant = AsyncQdrantClient(host=settings.qdrant_host, port=settings.qdrant_port)

    try:
        collections = await qdrant.get_collections()
        existing = {c.name for c in collections.collections}
        for col_name in [settings.qdrant_images_collection, settings.qdrant_unknown_faces_collection]:
            if col_name not in existing:
                await qdrant.create_collection(
                    collection_name=col_name,
                    vectors_config=VectorParams(size=settings.clip_vector_size, distance=Distance.COSINE),
                )
                log.info("Created Qdrant collection", collection=col_name)
    except Exception as e:
        log.warning("Could not initialize Qdrant collections", error=str(e))
    finally:
        await qdrant.close()

    # NOTE: ML model warmup (InsightFace, CLIP, BiRefNet) is intentionally skipped here.
    # The API server on Render has only 512 MB RAM — loading these models would cause an OOM crash.
    # ML processing is handled exclusively by the local Celery workers.

    yield

    # Shutdown
    log.info("Shutting down NDTV DAM backend")


app = FastAPI(
    title="NDTV Digital Asset Management API",
    description="AI-powered DAM system with face recognition, semantic search, and automated asset variant generation.",
    version="0.1.0",
    lifespan=lifespan,
)

# ─── CORS ─────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Request ID Middleware ────────────────────────────────────────────────────
@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    request_id = str(uuid.uuid4())
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(request_id=request_id, path=request.url.path)
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response


# ─── Global Exception Handler ─────────────────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    log.error("Unhandled exception", request_id=request_id, path=str(request.url), error=str(exc), exc_info=exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"error": "Internal server error", "request_id": request_id},
    )


# ─── Prometheus Metrics ───────────────────────────────────────────────────────
Instrumentator().instrument(app).expose(app, endpoint="/metrics")

# ─── Routers ──────────────────────────────────────────────────────────────────
app.include_router(health_router.router)
app.include_router(upload_router.router)
app.include_router(batch_router.router)
app.include_router(search_router.router)
app.include_router(person_router.router)
app.include_router(review_router.router)
app.include_router(asset_router.router)
app.include_router(admin_router.router)
