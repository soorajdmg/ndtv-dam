"""
Ingest pipeline orchestration tasks.

process_batch → fan-out per-image tasks → batch_finalizer → shortlist_batch
"""
import logging
from datetime import datetime, timedelta, timezone

from celery import chord, group

from app.worker import celery_app

log = logging.getLogger(__name__)


def _get_db_session():
    """Create a synchronous DB session for use inside Celery tasks."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.config import get_settings

    settings = get_settings()
    sync_url = settings.database_url.replace("postgresql+asyncpg", "postgresql+psycopg2")
    engine = create_engine(sync_url, pool_pre_ping=True, pool_size=2, max_overflow=3)
    Session = sessionmaker(bind=engine)
    return Session()


@celery_app.task(
    name="app.tasks.ingest_tasks.process_batch",
    bind=True,
    autoretry_for=(Exception,),
    max_retries=3,
    retry_backoff=True,
    retry_backoff_max=60,
)
def process_batch(self, batch_id: str):
    """Orchestrator: fan out per-image processing tasks for a batch."""
    from app.models.image_models import Image, UploadBatch
    from app.tasks.face_tasks import process_image_faces
    from app.tasks.quality_tasks import score_image

    db = _get_db_session()
    try:
        batch = db.query(UploadBatch).filter(UploadBatch.id == batch_id).first()
        if not batch:
            log.error("Batch not found", extra={"batch_id": batch_id})
            return

        batch.status = "processing"
        db.commit()

        images = (
            db.query(Image)
            .filter(Image.batch_id == batch_id, Image.upload_status == "queued", Image.is_duplicate == False)
            .all()
        )

        if not images:
            log.info("No images to process in batch", extra={"batch_id": batch_id})
            batch_finalizer.apply_async(args=[batch_id], queue="ingest")
            return

        # Fan out: quality scoring → face detection per image
        # (face_tasks dispatches index_image independently after face detection completes)
        per_image_tasks = group(
            [score_image.si(str(img.id)) | process_image_faces.si(str(img.id)) for img in images]
        )

        # Chain: fan-out → finalizer → shortlist
        chord(per_image_tasks)(batch_finalizer.si(batch_id))

    finally:
        db.close()


@celery_app.task(
    name="app.tasks.ingest_tasks.batch_finalizer",
    bind=True,
    autoretry_for=(Exception,),
    max_retries=3,
    retry_backoff=True,
)
def batch_finalizer(self, batch_id: str, *args):
    """Update batch status, tally counts, trigger shortlisting."""
    from app.models.image_models import Image, UploadBatch

    db = _get_db_session()
    try:
        batch = db.query(UploadBatch).filter(UploadBatch.id == batch_id).first()
        if not batch:
            return

        images = db.query(Image).filter(Image.batch_id == batch_id).all()
        processed = sum(1 for i in images if i.upload_status == "completed")
        failed = sum(1 for i in images if i.upload_status == "failed")
        total = len(images)

        batch.processed_images = processed
        batch.failed_images = failed
        batch.completed_at = datetime.now(timezone.utc)

        if total == 0 or (processed == 0 and failed == 0):
            # Nothing was processed — treat as failed
            batch.status = "failed"
        elif failed == 0:
            batch.status = "completed"
        elif processed == 0:
            batch.status = "failed"
        else:
            batch.status = "partial_failure"

        db.commit()
        log.info("Batch finalized", extra={"batch_id": batch_id, "processed": processed, "failed": failed})

        # Trigger shortlisting
        shortlist_batch.apply_async(args=[batch_id], queue="ingest")

    finally:
        db.close()


@celery_app.task(
    name="app.tasks.ingest_tasks.shortlist_batch",
    bind=True,
    autoretry_for=(Exception,),
    max_retries=2,
)
def shortlist_batch(self, batch_id: str):
    """Select top-N images from a completed batch based on overall_score."""
    from app.config import get_settings
    from app.models.image_models import Image, ImageQualityScore, ImagePersonLink
    from app.models.job_models import ShortlistedImage
    from app.models.person_models import Person
    from sqlalchemy import and_

    settings = get_settings()
    db = _get_db_session()
    try:
        # Delete existing shortlist for idempotency
        db.query(ShortlistedImage).filter(ShortlistedImage.batch_id == batch_id).delete()
        db.commit()

        images = (
            db.query(Image, ImageQualityScore)
            .join(ImageQualityScore, ImageQualityScore.image_id == Image.id, isouter=True)
            .filter(
                and_(
                    Image.batch_id == batch_id,
                    Image.upload_status == "completed",
                    Image.is_duplicate == False,
                )
            )
            .order_by(ImageQualityScore.overall_score.desc().nullslast())
            .limit(settings.shortlist_count * 3)  # over-fetch for diversity filter
            .all()
        )

        # Diversity filter: ensure not all top images feature the same person
        selected = []
        seen_persons: set[str] = set()
        any_person_image_added = False

        for img, qs in images:
            if len(selected) >= settings.shortlist_count:
                break

            # Get persons in this image
            persons_in_img = (
                db.query(Person)
                .join(ImagePersonLink, ImagePersonLink.person_id == Person.id)
                .filter(ImagePersonLink.image_id == img.id)
                .all()
            )
            person_ids = {str(p.id) for p in persons_in_img}

            # If all top candidates have same person, include at least one diverse image
            if not person_ids or any(pid not in seen_persons for pid in person_ids) or not any_person_image_added:
                selected.append((img, qs))
                seen_persons.update(person_ids)
                if person_ids:
                    any_person_image_added = True

        for rank, (img, qs) in enumerate(selected[:settings.shortlist_count], start=1):
            score_str = f"{qs.overall_score:.2f}" if qs and qs.overall_score else "N/A"
            sl = ShortlistedImage(
                batch_id=batch_id,
                image_id=img.id,
                rank=rank,
                selection_reason=f"Auto-shortlisted: overall_score={score_str}",
            )
            db.add(sl)

        db.commit()
        log.info("Shortlisting complete", extra={"batch_id": batch_id, "count": len(selected)})

    finally:
        db.close()


@celery_app.task(name="app.tasks.ingest_tasks.clean_stale_jobs")
def clean_stale_jobs():
    """Mark batches stuck in 'processing' for >30 min as 'failed'."""
    from app.models.image_models import UploadBatch

    db = _get_db_session()
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=30)
        stale = (
            db.query(UploadBatch)
            .filter(UploadBatch.status == "processing", UploadBatch.created_at < cutoff)
            .all()
        )
        for batch in stale:
            batch.status = "failed"
            log.critical("Stale batch detected and marked failed", extra={"batch_id": str(batch.id)})
        db.commit()

    finally:
        db.close()
