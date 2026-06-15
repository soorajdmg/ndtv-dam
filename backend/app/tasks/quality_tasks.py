"""Quality scoring tasks."""
import logging
import time

import cv2
import numpy as np

from app.worker import celery_app

log = logging.getLogger(__name__)


def _get_db_session():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.config import get_settings
    settings = get_settings()
    sync_url = settings.database_url.replace("postgresql+asyncpg", "postgresql+psycopg2")
    engine = create_engine(sync_url, pool_pre_ping=True, pool_size=2, max_overflow=3)
    return sessionmaker(bind=engine)()


def _check_already_done(db, image_id: str, stage: str) -> bool:
    from app.models.job_models import ProcessingLog
    existing = db.query(ProcessingLog).filter(
        ProcessingLog.image_id == image_id,
        ProcessingLog.stage == stage,
        ProcessingLog.status == "completed",
    ).first()
    return existing is not None


def compute_sharpness(img_gray: np.ndarray) -> float:
    """Laplacian variance — higher = sharper."""
    return float(cv2.Laplacian(img_gray, cv2.CV_64F).var())


def compute_brightness(img_gray: np.ndarray) -> float:
    """Mean pixel intensity in [0, 255]."""
    return float(np.mean(img_gray))


def compute_contrast(img_gray: np.ndarray) -> float:
    """Std deviation of pixel intensities."""
    return float(np.std(img_gray))


def normalize_brightness(brightness: float, min_b: int, max_b: int) -> float:
    """Score 1.0 if in [min_b, max_b], linearly degraded outside."""
    if min_b <= brightness <= max_b:
        return 1.0
    elif brightness < min_b:
        return max(0.0, brightness / min_b)
    else:
        return max(0.0, 1.0 - (brightness - max_b) / (255 - max_b))


def compute_rule_of_thirds_score(
    face_bbox: tuple[int, int, int, int],
    image_width: int,
    image_height: int,
) -> float:
    """
    Score how close the face centroid is to any rule-of-thirds intersection.
    Returns [0.0, 1.0].
    """
    x, y, w, h = face_bbox
    cx = x + w / 2
    cy = y + h / 2

    # Four rule-of-thirds intersections
    thirds_x = [image_width / 3, 2 * image_width / 3]
    thirds_y = [image_height / 3, 2 * image_height / 3]

    min_dist = float("inf")
    for tx in thirds_x:
        for ty in thirds_y:
            dist = ((cx - tx) ** 2 + (cy - ty) ** 2) ** 0.5
            if dist < min_dist:
                min_dist = dist

    # Normalize: max possible distance is diagonal / 2
    max_dist = ((image_width / 3) ** 2 + (image_height / 3) ** 2) ** 0.5
    score = max(0.0, 1.0 - (min_dist / max_dist))
    return round(score, 4)


@celery_app.task(
    name="app.tasks.quality_tasks.score_image",
    bind=True,
    autoretry_for=(Exception,),
    max_retries=3,
    retry_backoff=True,
)
def score_image(self, image_id: str):
    """Compute sharpness, brightness, contrast and store in image_quality_scores."""
    from app.config import get_settings
    from app.models.image_models import Image, ImageQualityScore
    from app.models.job_models import ProcessingLog

    settings = get_settings()
    db = _get_db_session()
    start_ms = int(time.time() * 1000)

    try:
        if _check_already_done(db, image_id, "quality_scoring"):
            log.info("Quality scoring already done (idempotent skip)", extra={"image_id": image_id})
            return

        db.add(ProcessingLog(image_id=image_id, stage="quality_scoring", status="started"))
        db.commit()

        img_record = db.query(Image).filter(Image.id == image_id).first()
        if not img_record:
            return

        # Materialise the image from R2 if needed
        if settings.use_r2:
            from app.services.storage_service import key_to_local_tmp_path, download_to_path
            import pathlib
            local_img = key_to_local_tmp_path(img_record.storage_path, "/tmp/dam_quality")
            if not pathlib.Path(local_img).exists():
                pathlib.Path(local_img).parent.mkdir(parents=True, exist_ok=True)
                download_to_path(img_record.storage_path, local_img, settings)
            read_path = local_img
        else:
            read_path = img_record.storage_path

        img_cv = cv2.imread(read_path, cv2.IMREAD_GRAYSCALE)
        if img_cv is None:
            raise ValueError(f"Cannot read image: {read_path}")

        sharpness = compute_sharpness(img_cv)
        brightness = compute_brightness(img_cv)
        contrast = compute_contrast(img_cv)

        brightness_norm = normalize_brightness(brightness, settings.quality_brightness_min, settings.quality_brightness_max)
        sharpness_norm = min(1.0, sharpness / 500.0)  # normalize to ~[0,1]
        contrast_norm = min(1.0, contrast / 80.0)

        # Stub composition and face_visibility — will be updated after face detection
        composition = 0.5
        face_visibility = 0.5

        overall = (
            0.30 * sharpness_norm
            + 0.20 * brightness_norm
            + 0.20 * face_visibility
            + 0.15 * contrast_norm
            + 0.15 * composition
        )

        is_approved = (
            sharpness >= settings.quality_sharpness_min
            and settings.quality_brightness_min <= brightness <= settings.quality_brightness_max
        )

        # Upsert quality score
        existing_qs = db.query(ImageQualityScore).filter(ImageQualityScore.image_id == image_id).first()
        if existing_qs:
            existing_qs.sharpness_score = sharpness_norm
            existing_qs.brightness_score = brightness_norm
            existing_qs.contrast_score = contrast_norm
            existing_qs.face_visibility_score = face_visibility
            existing_qs.composition_score = composition
            existing_qs.overall_score = round(overall, 4)
            existing_qs.is_approved_for_variants = is_approved
        else:
            db.add(ImageQualityScore(
                image_id=image_id,
                sharpness_score=sharpness_norm,
                brightness_score=brightness_norm,
                contrast_score=contrast_norm,
                face_visibility_score=face_visibility,
                composition_score=composition,
                overall_score=round(overall, 4),
                is_approved_for_variants=is_approved,
            ))

        duration = int(time.time() * 1000) - start_ms
        db.add(ProcessingLog(
            image_id=image_id,
            stage="quality_scoring",
            status="completed",
            output_metadata={"sharpness": sharpness_norm, "brightness": brightness_norm, "overall": overall},
            duration_ms=duration,
        ))
        db.commit()

    except Exception as e:
        db.add(ProcessingLog(
            image_id=image_id,
            stage="quality_scoring",
            status="failed",
            error_detail=str(e),
            duration_ms=int(time.time() * 1000) - start_ms,
        ))
        db.commit()
        raise
    finally:
        db.close()


@celery_app.task(
    name="app.tasks.quality_tasks.compute_final_score",
    bind=True,
)
def compute_final_score(self, image_id: str):
    """Recompute overall_score with final face detection data."""
    from app.models.image_models import ImageQualityScore

    db = _get_db_session()
    try:
        qs = db.query(ImageQualityScore).filter(ImageQualityScore.image_id == image_id).first()
        if not qs:
            return

        overall = (
            0.30 * (qs.sharpness_score or 0.0)
            + 0.20 * (qs.brightness_score or 0.0)
            + 0.20 * (qs.face_visibility_score or 0.0)
            + 0.15 * (qs.contrast_score or 0.0)
            + 0.15 * (qs.composition_score or 0.0)
        )
        qs.overall_score = round(overall, 4)
        db.commit()
    finally:
        db.close()
