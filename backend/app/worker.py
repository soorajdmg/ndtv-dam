from celery import Celery
from celery.schedules import crontab

from app.config import get_settings

settings = get_settings()

# ─── Queue Names ──────────────────────────────────────────────────────────────
QUEUE_INGEST = "ingest"
QUEUE_FACE = "face"
QUEUE_EMBEDDING = "embedding"
QUEUE_VARIANT = "variant"
QUEUE_QUALITY = "quality"

# ─── Celery Application ───────────────────────────────────────────────────────
celery_app = Celery(
    "ndtv_dam",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=[
        "app.tasks.ingest_tasks",
        "app.tasks.face_tasks",
        "app.tasks.embedding_tasks",
        "app.tasks.variant_tasks",
        "app.tasks.quality_tasks",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    result_expires=3600,
    broker_connection_retry_on_startup=True,
    # Queue routing
    task_routes={
        "app.tasks.ingest_tasks.*": {"queue": QUEUE_INGEST},
        "app.tasks.face_tasks.*": {"queue": QUEUE_FACE},
        "app.tasks.embedding_tasks.*": {"queue": QUEUE_EMBEDDING},
        "app.tasks.variant_tasks.*": {"queue": QUEUE_VARIANT},
        "app.tasks.quality_tasks.*": {"queue": QUEUE_QUALITY},
    },
    # Worker concurrency per queue type (override with CLI flags)
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    # Beat scheduler for periodic tasks
    beat_schedule={
        "clean-stale-jobs-every-10-minutes": {
            "task": "app.tasks.ingest_tasks.clean_stale_jobs",
            "schedule": crontab(minute="*/10"),
        },
    },
)

# Alias so other modules can import `celery_app` or `app`
app = celery_app
