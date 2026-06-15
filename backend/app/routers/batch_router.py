from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.models import Image, ShortlistedImage, UploadBatch
from app.models.embedding_models import ClipEmbedding
from app.models.image_models import ImagePersonLink, ImageQualityScore
from app.models.person_models import Person
from app.models.variant_models import AssetVariant
from app.schemas.batch_schemas import QualityBreakdown, ShortlistItem, ShortlistResponse
from app.schemas.upload_schemas import BatchStatusResponse

router = APIRouter(prefix="/api", tags=["batch"])


@router.get(
    "/batches",
    summary="List all upload batches",
)
async def list_batches(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    count_result = await db.execute(select(func.count()).select_from(UploadBatch))
    total = count_result.scalar_one()

    result = await db.execute(
        select(UploadBatch)
        .order_by(desc(UploadBatch.created_at))
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    batches = result.scalars().all()

    items = []
    for b in batches:
        pct = 0.0
        if b.total_images > 0:
            pct = round((b.processed_images / b.total_images) * 100, 1)
        items.append({
            "batch_id": str(b.id),
            "status": b.status,
            "total": b.total_images,
            "processed": b.processed_images,
            "failed": b.failed_images,
            "percent_complete": pct,
            "submitted_by": b.submitted_by,
            "created_at": b.created_at.isoformat(),
            "completed_at": b.completed_at.isoformat() if b.completed_at else None,
        })
    return {"items": items, "total": total}


@router.get(
    "/batch/{batch_id}/status",
    response_model=BatchStatusResponse,
    summary="Get batch processing status",
)
async def get_batch_status(batch_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(UploadBatch).where(UploadBatch.id == batch_id))
    batch = result.scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    percent = 0.0
    if batch.total_images > 0:
        percent = round((batch.processed_images / batch.total_images) * 100, 1)

    return BatchStatusResponse(
        batch_id=batch.id,
        status=batch.status,
        total=batch.total_images,
        processed=batch.processed_images,
        failed=batch.failed_images,
        percent_complete=percent,
        estimated_remaining=None,
        created_at=batch.created_at,
        completed_at=batch.completed_at,
    )


@router.get(
    "/batch/{batch_id}/shortlist",
    response_model=ShortlistResponse,
    summary="Get shortlisted images for a batch",
)
async def get_batch_shortlist(batch_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(UploadBatch).where(UploadBatch.id == batch_id))
    batch = result.scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    result = await db.execute(
        select(ShortlistedImage)
        .where(ShortlistedImage.batch_id == batch_id)
        .order_by(ShortlistedImage.rank)
    )
    shortlisted = result.scalars().all()

    items = []
    for sl in shortlisted:
        img_result = await db.execute(select(Image).where(Image.id == sl.image_id))
        img = img_result.scalar_one_or_none()
        if not img:
            continue

        # Get quality scores
        qs_result = await db.execute(select(ImageQualityScore).where(ImageQualityScore.image_id == sl.image_id))
        qs = qs_result.scalar_one_or_none()
        quality = QualityBreakdown(
            sharpness=qs.sharpness_score if qs else None,
            brightness=qs.brightness_score if qs else None,
            contrast=qs.contrast_score if qs else None,
            face_visibility=qs.face_visibility_score if qs else None,
            composition=qs.composition_score if qs else None,
            overall=qs.overall_score if qs else None,
        )

        # Get matched persons
        persons_result = await db.execute(
            select(Person)
            .join(ImagePersonLink, ImagePersonLink.person_id == Person.id)
            .where(ImagePersonLink.image_id == sl.image_id)
        )
        persons = persons_result.scalars().all()

        # Get variant IDs
        variants_result = await db.execute(select(AssetVariant).where(AssetVariant.image_id == sl.image_id))
        variants = variants_result.scalars().all()

        # Get semantic tags from CLIP embedding record
        clip_result = await db.execute(select(ClipEmbedding).where(ClipEmbedding.image_id == sl.image_id))
        clip_emb = clip_result.scalar_one_or_none()
        semantic_tags: list[str] = clip_emb.semantic_tags if clip_emb and clip_emb.semantic_tags else []

        items.append(ShortlistItem(
            rank=sl.rank,
            image_id=sl.image_id,
            original_filename=img.original_filename,
            storage_path=img.storage_path,
            selection_reason=sl.selection_reason,
            quality=quality,
            matched_persons=[p.full_name for p in persons],
            variant_ids=[v.id for v in variants],
            semantic_tags=semantic_tags,
        ))

    return ShortlistResponse(batch_id=batch_id, items=items, total=len(items))


@router.get(
    "/batch/{batch_id}/images",
    summary="List all images in a batch",
)
async def get_batch_images(
    batch_id: UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(UploadBatch).where(UploadBatch.id == batch_id))
    batch = result.scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    count_result = await db.execute(
        select(func.count()).select_from(Image).where(Image.batch_id == batch_id)
    )
    total = count_result.scalar_one()

    imgs_result = await db.execute(
        select(Image)
        .where(Image.batch_id == batch_id)
        .order_by(Image.created_at)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    images = imgs_result.scalars().all()

    items = []
    for img in images:
        qs_result = await db.execute(
            select(ImageQualityScore).where(ImageQualityScore.image_id == img.id)
        )
        qs = qs_result.scalar_one_or_none()

        items.append({
            "id": str(img.id),
            "original_filename": img.original_filename,
            "width": img.width,
            "height": img.height,
            "file_size_bytes": img.file_size_bytes,
            "format": img.format,
            "upload_status": img.upload_status,
            "is_duplicate": img.is_duplicate,
            "duplicate_of_id": str(img.duplicate_of_id) if img.duplicate_of_id else None,
            "created_at": img.created_at.isoformat(),
            "overall_quality_score": qs.overall_score if qs else None,
        })

    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.post(
    "/batch/{batch_id}/shortlist/override",
    summary="Manually override batch shortlist",
)
async def override_shortlist(
    batch_id: UUID,
    image_ids: list[UUID],
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(UploadBatch).where(UploadBatch.id == batch_id))
    batch = result.scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    for rank, img_id in enumerate(image_ids, start=1):
        sl = ShortlistedImage(
            batch_id=batch_id,
            image_id=img_id,
            rank=rank,
            selection_reason="manual_override",
        )
        db.add(sl)

    return {"message": "Shortlist updated", "count": len(image_ids)}
