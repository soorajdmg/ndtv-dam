"""CLIP embedding and Qdrant indexing tasks."""
import logging
import os
import time

from app.worker import celery_app

log = logging.getLogger(__name__)

# Semantic label vocabulary for zero-shot CLIP classification.
# Organised by news/broadcast journalism use-cases.
SEMANTIC_LABELS = [
    # Scene / setting
    "press conference",
    "outdoor event",
    "indoor event",
    "parliament",
    "court room",
    "protest",
    "rally",
    "interview",
    "news studio",
    "red carpet",
    "sports stadium",
    "disaster site",
    "military",
    "hospital",
    # Subject matter
    "portrait",
    "group photo",
    "crowd",
    "handshake",
    "signing ceremony",
    "award ceremony",
    "speech",
    "debate",
    "election",
    "technology",
    "finance",
    "business",
    "science",
    "environment",
    "health",
    "education",
    # Mood / framing
    "formal",
    "casual",
    "action shot",
    "candid",
    "posed",
]

TOP_K_TAGS = 5


def _compute_semantic_tags(clip_service, image_embedding) -> list[str]:
    """
    Zero-shot CLIP classification: rank semantic labels by cosine similarity
    against the image embedding and return the top-K label strings.
    """
    import numpy as np

    scores = []
    for label in SEMANTIC_LABELS:
        try:
            text_emb = clip_service.encode_text(label)
            score = float(np.dot(image_embedding, text_emb))
            scores.append((score, label))
        except Exception:
            pass

    scores.sort(reverse=True)
    return [label for _, label in scores[:TOP_K_TAGS]]


def _get_db_session():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.config import get_settings
    settings = get_settings()
    sync_url = settings.database_url.replace("postgresql+asyncpg", "postgresql+psycopg2")
    engine = create_engine(sync_url, pool_pre_ping=True, pool_size=2, max_overflow=3)
    return sessionmaker(bind=engine)()


def _make_qdrant_client(settings):
    """Create an AsyncQdrantClient for local Qdrant or Qdrant Cloud."""
    from qdrant_client import AsyncQdrantClient
    if settings.qdrant_api_key:
        host = settings.qdrant_host
        if not host.startswith("http"):
            scheme = "https" if settings.qdrant_use_https else "http"
            host = f"{scheme}://{host}"
        return AsyncQdrantClient(url=host, api_key=settings.qdrant_api_key)
    return AsyncQdrantClient(host=settings.qdrant_host, port=settings.qdrant_port)


@celery_app.task(
    name="app.tasks.embedding_tasks.index_image",
    bind=True,
    autoretry_for=(Exception,),
    max_retries=3,
    retry_backoff=True,
)
def index_image(self, image_id: str):
    """CLIP encode image and upsert into Qdrant."""
    import asyncio
    from app.config import get_settings
    from app.models.embedding_models import ClipEmbedding
    from app.models.image_models import Image, ImagePersonLink
    from app.models.job_models import ProcessingLog
    from app.models.person_models import Person
    from app.services.clip_service import get_clip_service
    from app.services.qdrant_service import upsert_image

    settings = get_settings()
    db = _get_db_session()
    start_ms = int(time.time() * 1000)

    try:
        # Idempotency
        existing_log = db.query(ProcessingLog).filter(
            ProcessingLog.image_id == image_id,
            ProcessingLog.stage == "clip_embedding",
            ProcessingLog.status == "completed",
        ).first()
        if existing_log:
            log.info("CLIP embedding already done (idempotent skip)", extra={"image_id": image_id})
            return

        db.add(ProcessingLog(image_id=image_id, stage="clip_embedding", status="started"))
        db.commit()

        img_record = db.query(Image).filter(Image.id == image_id).first()
        if not img_record:
            return

        # CLIP encode — materialise the file locally if stored in R2
        try:
            from app.services.storage_service import key_to_local_tmp_path, download_to_path
            if settings.use_r2:
                local_path = key_to_local_tmp_path(img_record.storage_path, "/tmp/dam_clips")
                if not os.path.exists(local_path):
                    import pathlib
                    pathlib.Path(local_path).parent.mkdir(parents=True, exist_ok=True)
                    download_to_path(img_record.storage_path, local_path, settings)
                encode_path = local_path
            else:
                encode_path = img_record.storage_path
            clip = get_clip_service()
            embedding = clip.encode_image(encode_path)
        except Exception as e:
            log.error("CLIP encoding failed for %s: %s", image_id, e)
            db.add(ProcessingLog(
                image_id=image_id, stage="clip_embedding", status="failed",
                error_detail=str(e), duration_ms=int(time.time() * 1000) - start_ms
            ))
            db.commit()
            raise

        # Zero-shot semantic tagging using CLIP text-image similarity
        semantic_tags: list[str] = []
        try:
            semantic_tags = _compute_semantic_tags(clip, embedding)
            log.info("Semantic tags for %s: %s", image_id, semantic_tags)
        except Exception as tag_err:
            log.warning("Semantic tagging failed for %s: %s", image_id, tag_err)

        # Build Qdrant payload
        persons_in_img = (
            db.query(Person)
            .join(ImagePersonLink, ImagePersonLink.person_id == Person.id)
            .filter(ImagePersonLink.image_id == image_id)
            .all()
        )

        from app.models.image_models import ImageQualityScore
        qs = db.query(ImageQualityScore).filter(ImageQualityScore.image_id == image_id).first()

        from app.models.person_models import Organization
        org_ids = list({str(p.organization) for p in persons_in_img if p.organization})
        categories = list({p.category for p in persons_in_img if p.category})

        payload = {
            "image_id": str(image_id),
            "batch_id": str(img_record.batch_id),
            "persons": [str(p.id) for p in persons_in_img],
            "organizations": org_ids,
            "categories": categories,
            "quality_score": qs.overall_score if qs else 0.0,
            "upload_date": img_record.created_at.isoformat(),
            "has_face": len(persons_in_img) > 0,
            "is_approved": qs.is_approved_for_variants if qs else False,
            "semantic_tags": semantic_tags,
        }

        # Upsert to Qdrant
        async def _upsert():
            client = _make_qdrant_client(settings)
            try:
                await upsert_image(
                    client,
                    str(image_id),
                    embedding.tolist(),
                    payload,
                    settings.qdrant_images_collection,
                )
            finally:
                await client.close()

        asyncio.run(_upsert())

        # Backup embedding + semantic tags in PostgreSQL
        existing_emb = db.query(ClipEmbedding).filter(ClipEmbedding.image_id == image_id).first()
        if existing_emb:
            existing_emb.embedding_vector = embedding.tolist()
            existing_emb.model_name = settings.clip_model_name
            existing_emb.semantic_tags = semantic_tags
        else:
            db.add(ClipEmbedding(
                image_id=image_id,
                model_name=settings.clip_model_name,
                embedding_vector=embedding.tolist(),
                semantic_tags=semantic_tags,
            ))

        duration = int(time.time() * 1000) - start_ms
        db.add(ProcessingLog(
            image_id=image_id,
            stage="clip_embedding",
            status="completed",
            output_metadata={"qdrant_indexed": True},
            duration_ms=duration,
        ))
        db.commit()

    except Exception as e:
        try:
            db.add(ProcessingLog(
                image_id=image_id,
                stage="clip_embedding",
                status="dead_letter",
                error_detail=str(e),
                duration_ms=int(time.time() * 1000) - start_ms,
            ))
            db.commit()
        except Exception:
            pass
        raise
    finally:
        db.close()
