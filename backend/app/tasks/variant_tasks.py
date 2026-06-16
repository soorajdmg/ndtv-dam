"""Asset variant generation tasks."""
import logging
import os
import time
from datetime import datetime, timezone
from pathlib import Path

from app.worker import celery_app

log = logging.getLogger(__name__)

TMP_DIR = "/tmp/dam_variants"


def _get_db_session():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.config import get_settings
    settings = get_settings()
    sync_url = settings.database_url.replace("postgresql+asyncpg", "postgresql+psycopg2")
    engine = create_engine(sync_url, pool_pre_ping=True, pool_size=2, max_overflow=3)
    return sessionmaker(bind=engine)()


def _materialise(storage_path: str, settings) -> str:
    """
    Return a local file path that workers can pass to PIL / BiRefNet.

    When R2 is active: downloads the object to TMP_DIR and returns the local path.
    When local: storage_path is already a local absolute path — returned as-is.
    """
    from app.services import storage_service
    if not settings.use_r2:
        return storage_path
    local = storage_service.key_to_local_tmp_path(storage_path, TMP_DIR)
    if not os.path.exists(local):
        storage_service.download_to_path(storage_path, local, settings)
    return local


def _save_variant_and_upload(local_path: str, key: str, settings) -> str:
    """
    Upload a just-generated local variant file to R2 (if configured).
    Returns the storage identifier (key for R2, local path otherwise).
    """
    from app.services import storage_service
    if settings.use_r2:
        storage_service.upload_file(local_path, key, settings)
        return key
    return local_path


@celery_app.task(
    name="app.tasks.variant_tasks.generate_variants",
    bind=True,
    autoretry_for=(Exception,),
    max_retries=2,
    retry_backoff=True,
)
def generate_variants(self, image_id: str, force: bool = False):
    """Generate transparent cutout, square gray bg, and branded 16:9 variants.

    Args:
        image_id: UUID of the image to process.
        force: If True, bypass the quality approval gate and idempotency check.
               Set this when triggering generation on-demand from the UI.
    """
    from app.config import get_settings
    from app.models.image_models import Image, ImageQualityScore
    from app.models.job_models import ProcessingLog
    from app.models.variant_models import AssetVariant

    settings = get_settings()
    db = _get_db_session()
    start_ms = int(time.time() * 1000)

    try:
        img_record = db.query(Image).filter(Image.id == image_id).first()
        if not img_record:
            return

        if not force:
            qs = db.query(ImageQualityScore).filter(ImageQualityScore.image_id == image_id).first()
            if qs and not qs.is_approved_for_variants:
                db.add(ProcessingLog(
                    image_id=image_id, stage="variant_generation", status="skipped",
                    input_metadata={"reason": "not approved for variants"},
                ))
                db.commit()
                return

            # Idempotency: skip only if all three variants already completed successfully
            from app.models.variant_models import AssetVariant as _AV
            completed_variants = db.query(_AV).filter(
                _AV.image_id == image_id,
                _AV.generation_status == "completed",
            ).count()
            if completed_variants >= 3:
                return

        from app.services import birefnet_service

        # Materialise the source image to a local path for PIL / BiRefNet
        local_source = _materialise(img_record.storage_path, settings)

        # Temporary output dir — always local, variants are uploaded to R2 after generation
        Path(TMP_DIR).mkdir(parents=True, exist_ok=True)
        tmp_output_dir = Path(TMP_DIR)

        # Key prefix for R2 (matches the batch/image structure)
        batch_id = str(img_record.batch_id)
        r2_prefix = f"{batch_id}/variants"

        now = datetime.now(timezone.utc)

        # ── Variant 1: Transparent Cutout ─────────────────────────────────────
        local_cutout = str(tmp_output_dir / f"{image_id}_cutout.png")
        # Storage key / path saved in the DB
        cutout_key = f"{r2_prefix}/{image_id}_cutout.png"

        v1 = db.query(AssetVariant).filter(
            AssetVariant.image_id == image_id, AssetVariant.variant_type == "transparent_cutout"
        ).first() or AssetVariant(image_id=image_id, variant_type="transparent_cutout")
        v1.generation_status = "processing"
        db.add(v1)
        db.flush()

        cutout_img = None
        try:
            cutout_img = birefnet_service.remove_background(local_source)
            cutout_img.save(local_cutout, format="PNG")
            stored_cutout = _save_variant_and_upload(local_cutout, cutout_key, settings)
            v1.storage_path = stored_cutout
            v1.width, v1.height = cutout_img.size
            v1.file_size_bytes = os.path.getsize(local_cutout)
            v1.generation_status = "completed"
            v1.generated_at = now
        except Exception as e:
            v1.generation_status = "failed"
            v1.error_message = str(e)
            log.error("Transparent cutout generation failed for %s: %s", image_id, e)

        # ── Variant 2: Square Gray Background ─────────────────────────────────
        local_square = str(tmp_output_dir / f"{image_id}_square.jpg")
        square_key = f"{r2_prefix}/{image_id}_square.jpg"

        v2 = db.query(AssetVariant).filter(
            AssetVariant.image_id == image_id, AssetVariant.variant_type == "square_gray_bg"
        ).first() or AssetVariant(image_id=image_id, variant_type="square_gray_bg")
        v2.generation_status = "processing"
        db.add(v2)
        db.flush()

        try:
            # If cutout failed in this run, try loading from local tmp (previous run may have saved it)
            if cutout_img is None and os.path.exists(local_cutout):
                from PIL import Image as _PILReload
                cutout_img = _PILReload.open(local_cutout).convert("RGBA")
            if cutout_img is None:
                raise ValueError("Transparent cutout generation failed; cannot produce square variant")

            from PIL import Image as PILImage
            size = settings.variant_square_size
            canvas = PILImage.new("RGB", (size, size), (128, 128, 128))
            subject = cutout_img.copy()
            subject.thumbnail((size, size), PILImage.LANCZOS)
            paste_x = (size - subject.width) // 2
            paste_y = (size - subject.height) // 2
            canvas.paste(subject, (paste_x, paste_y), subject.split()[3])  # alpha mask
            canvas.save(local_square, format="JPEG", quality=92)

            stored_square = _save_variant_and_upload(local_square, square_key, settings)
            v2.storage_path = stored_square
            v2.width, v2.height = size, size
            v2.file_size_bytes = os.path.getsize(local_square)
            v2.generation_status = "completed"
            v2.generated_at = now
        except Exception as e:
            v2.generation_status = "failed"
            v2.error_message = str(e)
            log.error("Square gray bg generation failed for %s: %s", image_id, e)

        # ── Variant 3: NDTV Profit Branded 16:9 ──────────────────────────────
        local_branded = str(tmp_output_dir / f"{image_id}_branded.jpg")
        branded_key = f"{r2_prefix}/{image_id}_branded.jpg"

        v3 = db.query(AssetVariant).filter(
            AssetVariant.image_id == image_id, AssetVariant.variant_type == "branded_16_9"
        ).first() or AssetVariant(image_id=image_id, variant_type="branded_16_9")
        v3.generation_status = "processing"
        db.add(v3)
        db.flush()

        try:
            # If cutout failed in this run, try loading from local tmp
            if cutout_img is None and os.path.exists(local_cutout):
                from PIL import Image as _PILReload2
                cutout_img = _PILReload2.open(local_cutout).convert("RGBA")
            if cutout_img is None:
                raise ValueError("Transparent cutout generation failed; cannot produce branded variant")

            from PIL import Image as PILImage

            CANVAS_W, CANVAS_H = 1920, 1080
            BRAND_BG = (26, 26, 46)  # #1a1a2e

            canvas = PILImage.new("RGB", (CANVAS_W, CANVAS_H), BRAND_BG)

            # Subject: fit in left 50% of canvas
            subject = cutout_img.copy()
            max_w = CANVAS_W // 2
            max_h = CANVAS_H
            subject.thumbnail((max_w, max_h), PILImage.LANCZOS)
            paste_x = (max_w - subject.width) // 2
            paste_y = (CANVAS_H - subject.height) // 2
            canvas.paste(subject, (paste_x, paste_y), subject.split()[3])

            # Logo watermark (top-right) — always a local file, never in R2
            logo_local = settings.brand_logo_path
            if os.path.exists(logo_local):
                logo = PILImage.open(logo_local).convert("RGBA")
                logo_max = 200
                logo.thumbnail((logo_max, logo_max), PILImage.LANCZOS)
                logo_x = CANVAS_W - logo.width - 30
                logo_y = 30
                canvas.paste(logo, (logo_x, logo_y), logo.split()[3])
            else:
                log.warning("Brand logo not found, skipping watermark: %s", settings.brand_logo_path)

            canvas.save(local_branded, format="JPEG", quality=92)
            stored_branded = _save_variant_and_upload(local_branded, branded_key, settings)
            v3.storage_path = stored_branded
            v3.width, v3.height = CANVAS_W, CANVAS_H
            v3.file_size_bytes = os.path.getsize(local_branded)
            v3.generation_status = "completed"
            v3.generated_at = now
        except Exception as e:
            v3.generation_status = "failed"
            v3.error_message = str(e)
            log.error("Branded 16:9 generation failed for %s: %s", image_id, e)

        duration = int(time.time() * 1000) - start_ms
        db.add(ProcessingLog(
            image_id=image_id,
            stage="variant_generation",
            status="completed",
            output_metadata={
                "v1": v1.generation_status,
                "v2": v2.generation_status,
                "v3": v3.generation_status,
            },
            duration_ms=duration,
        ))
        db.commit()

    except Exception as e:
        try:
            db.add(ProcessingLog(
                image_id=image_id,
                stage="variant_generation",
                status="failed",
                error_detail=str(e),
                duration_ms=int(time.time() * 1000) - start_ms,
            ))
            db.commit()
        except Exception:
            pass
        raise
    finally:
        db.close()
