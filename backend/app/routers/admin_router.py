from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.models.image_models import Image, UploadBatch

router = APIRouter(prefix="/api/admin", tags=["admin"])

VALID_STAGES = {"face", "clip", "variants", "quality"}


@router.post("/reprocess-image/{image_id}", summary="Reprocess specific stages for an image")
async def reprocess_image(
    image_id: UUID,
    stages: str = Query(default="face,clip,variants", description="Comma-separated stages to reprocess"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Image).where(Image.id == image_id))
    img = result.scalar_one_or_none()
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")

    stage_list = [s.strip() for s in stages.split(",")]
    invalid = set(stage_list) - VALID_STAGES
    if invalid:
        raise HTTPException(status_code=400, detail=f"Invalid stages: {invalid}")

    enqueued = []
    if "face" in stage_list:
        from app.tasks.face_tasks import process_image_faces
        process_image_faces.apply_async(args=[str(image_id)], queue="face")
        enqueued.append("face")

    if "clip" in stage_list:
        from app.tasks.embedding_tasks import index_image
        index_image.apply_async(args=[str(image_id)], queue="embedding")
        enqueued.append("clip")

    if "variants" in stage_list:
        from app.tasks.variant_tasks import generate_variants
        generate_variants.apply_async(args=[str(image_id)], queue="variant")
        enqueued.append("variants")

    if "quality" in stage_list:
        from app.tasks.quality_tasks import score_image
        score_image.apply_async(args=[str(image_id)], queue="quality")
        enqueued.append("quality")

    return {"image_id": str(image_id), "enqueued_stages": enqueued}


@router.post("/reprocess-batch/{batch_id}", summary="Reprocess failed images in a batch")
async def reprocess_batch(
    batch_id: UUID,
    stage: str = Query(default="failed_only"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(UploadBatch).where(UploadBatch.id == batch_id))
    batch = result.scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    if stage == "failed_only":
        images_result = await db.execute(
            select(Image).where(Image.batch_id == batch_id, Image.upload_status == "failed")
        )
    else:
        images_result = await db.execute(select(Image).where(Image.batch_id == batch_id))

    images = images_result.scalars().all()
    enqueued_count = 0
    for img in images:
        from app.tasks.face_tasks import process_image_faces
        process_image_faces.apply_async(args=[str(img.id)], queue="face")
        enqueued_count += 1

    return {"batch_id": str(batch_id), "enqueued_images": enqueued_count}
