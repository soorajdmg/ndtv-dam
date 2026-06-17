import asyncio
import io
import os
from pathlib import Path
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings, Settings
from app.dependencies import get_db, get_qdrant_client
from app.models.embedding_models import ClipEmbedding
from app.models.face_models import FaceDetection
from app.models.image_models import Image, ImagePersonLink, ImageQualityScore, UploadBatch
from app.models.person_models import Person
from app.models.variant_models import AssetVariant
from app.schemas.asset_schemas import AssetVariantResponse
from app.schemas.batch_schemas import QualityBreakdown

router = APIRouter(prefix="/api", tags=["assets"])


def _open_image_bytes(storage_path: str, settings: Settings):
    """Return image bytes from R2 or local disk."""
    from app.services import storage_service
    if settings.use_r2:
        return storage_service.download_file(storage_path, settings)
    else:
        with open(storage_path, "rb") as f:
            return f.read()


@router.get("/images", summary="List all images across all batches")
async def list_images(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    status: Optional[str] = Query(None, description="Filter by upload_status"),
    db: AsyncSession = Depends(get_db),
):
    count_q = select(func.count()).select_from(Image)
    if status:
        count_q = count_q.where(Image.upload_status == status)
    total = (await db.execute(count_q)).scalar_one()

    imgs_q = select(Image).order_by(desc(Image.created_at)).offset((page - 1) * page_size).limit(page_size)
    if status:
        imgs_q = imgs_q.where(Image.upload_status == status)
    images = (await db.execute(imgs_q)).scalars().all()

    items = []
    for img in images:
        qs = (await db.execute(
            select(ImageQualityScore).where(ImageQualityScore.image_id == img.id)
        )).scalar_one_or_none()

        persons_result = await db.execute(
            select(Person)
            .join(ImagePersonLink, ImagePersonLink.person_id == Person.id)
            .where(ImagePersonLink.image_id == img.id)
        )
        persons = persons_result.scalars().all()

        items.append({
            "id": str(img.id),
            "batch_id": str(img.batch_id),
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
            "matched_persons": [p.full_name for p in persons],
        })

    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/images/{image_id}/variants", response_model=list[AssetVariantResponse], summary="Get image variants")
async def get_image_variants(image_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AssetVariant).where(AssetVariant.image_id == image_id))
    variants = result.scalars().all()
    return [AssetVariantResponse.model_validate(v) for v in variants]


@router.post("/images/{image_id}/generate-variants", summary="Trigger on-demand variant generation")
async def generate_image_variants(image_id: UUID, db: AsyncSession = Depends(get_db)):
    """Enqueue variant generation for this image, bypassing quality gate and idempotency.
    Use this endpoint when the user explicitly requests variant generation from the UI.
    """
    result = await db.execute(select(Image).where(Image.id == image_id))
    img = result.scalar_one_or_none()
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")

    from app.tasks.variant_tasks import generate_variants
    generate_variants.apply_async(args=[str(image_id)], kwargs={"force": True}, queue="variant")
    return {"image_id": str(image_id), "status": "enqueued"}


@router.get("/assets/{variant_id}/download", summary="Download variant file")
async def download_variant(
    variant_id: UUID,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    result = await db.execute(select(AssetVariant).where(AssetVariant.id == variant_id))
    variant = result.scalar_one_or_none()
    if not variant or not variant.storage_path:
        raise HTTPException(status_code=404, detail="Variant not found")

    content_type = "image/png" if variant.variant_type == "transparent_cutout" else "image/jpeg"
    filename = Path(variant.storage_path).name

    if settings.use_r2:
        import asyncio
        data = await asyncio.to_thread(_open_image_bytes, variant.storage_path, settings)
        return StreamingResponse(
            io.BytesIO(data),
            media_type=content_type,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    else:
        if not os.path.exists(variant.storage_path):
            raise HTTPException(status_code=404, detail="Variant file not found on disk")
        return FileResponse(
            path=variant.storage_path,
            media_type=content_type,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )


@router.get("/images/{image_id}/quality", response_model=QualityBreakdown, summary="Get image quality scores")
async def get_image_quality(image_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ImageQualityScore).where(ImageQualityScore.image_id == image_id))
    qs = result.scalar_one_or_none()
    if not qs:
        return QualityBreakdown()
    return QualityBreakdown(
        sharpness=qs.sharpness_score,
        brightness=qs.brightness_score,
        contrast=qs.contrast_score,
        face_visibility=qs.face_visibility_score,
        composition=qs.composition_score,
        overall=qs.overall_score,
    )


@router.get("/images/{image_id}/metadata", summary="Get image persons and semantic tags")
async def get_image_metadata(image_id: UUID, db: AsyncSession = Depends(get_db)):
    # Matched persons via image_person_links
    persons_result = await db.execute(
        select(Person)
        .join(ImagePersonLink, ImagePersonLink.person_id == Person.id)
        .where(ImagePersonLink.image_id == image_id)
    )
    persons = persons_result.scalars().all()

    # Semantic tags from CLIP embedding
    clip_result = await db.execute(select(ClipEmbedding).where(ClipEmbedding.image_id == image_id))
    clip = clip_result.scalar_one_or_none()
    semantic_tags: list[str] = clip.semantic_tags if clip and clip.semantic_tags else []

    return {
        "persons": [
            {
                "id": str(p.id),
                "full_name": p.full_name,
                "designation": p.designation,
                "organization": p.organization,
                "category": p.category,
            }
            for p in persons
        ],
        "semantic_tags": semantic_tags,
    }


@router.get("/images/{image_id}/thumbnail", summary="Serve image thumbnail")
async def get_image_thumbnail(
    image_id: UUID,
    w: int = 400,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    from PIL import Image as PILImage

    img_result = await db.execute(select(Image).where(Image.id == image_id))
    img = img_result.scalar_one_or_none()
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")

    import asyncio
    try:
        raw = await asyncio.to_thread(_open_image_bytes, img.storage_path, settings)
    except (FileNotFoundError, Exception):
        raise HTTPException(status_code=404, detail="Image file not found")

    pil_img = PILImage.open(io.BytesIO(raw)).convert("RGB")
    # Resize proportionally so the longest side = w
    pil_img.thumbnail((w, w), PILImage.LANCZOS)
    buf = io.BytesIO()
    pil_img.save(buf, format="JPEG", quality=85)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=86400"},
    )


@router.get("/face-detections/{detection_id}/crop", summary="Serve face crop on-demand")
async def get_face_crop(
    detection_id: UUID,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    from PIL import Image as PILImage

    fd_result = await db.execute(select(FaceDetection).where(FaceDetection.id == detection_id))
    fd = fd_result.scalar_one_or_none()
    if not fd:
        raise HTTPException(status_code=404, detail="Face detection not found")

    img_result = await db.execute(select(Image).where(Image.id == fd.image_id))
    img = img_result.scalar_one_or_none()
    if not img:
        raise HTTPException(status_code=404, detail="Source image not found")

    import asyncio
    try:
        raw = await asyncio.to_thread(_open_image_bytes, img.storage_path, settings)
    except Exception:
        raise HTTPException(status_code=404, detail="Source image file not found")

    pil_img = PILImage.open(io.BytesIO(raw)).convert("RGB")
    padding = 20
    x = max(0, fd.bbox_x - padding)
    y = max(0, fd.bbox_y - padding)
    x2 = min(pil_img.width, fd.bbox_x + fd.bbox_w + padding)
    y2 = min(pil_img.height, fd.bbox_y + fd.bbox_h + padding)
    crop = pil_img.crop((x, y, x2, y2)).resize((256, 256))

    buf = io.BytesIO()
    crop.save(buf, format="JPEG", quality=85)
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/jpeg")


async def _delete_image_files(img: Image, variants: list, settings: Settings) -> None:
    """Delete original + all variant files from R2 or local disk."""
    from app.services import storage_service

    keys_to_delete = []
    if img.storage_path:
        keys_to_delete.append(storage_service.local_path_to_key(img.storage_path, settings))
    for v in variants:
        if v.storage_path:
            keys_to_delete.append(storage_service.local_path_to_key(v.storage_path, settings))

    for key in keys_to_delete:
        await asyncio.to_thread(storage_service.delete_file, key, settings)


@router.delete("/images/{image_id}", status_code=200, summary="Delete an image and all its data")
async def delete_image(
    image_id: UUID,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
    qdrant=Depends(get_qdrant_client),
):
    """
    Permanently deletes an image record plus:
    - All variant files (R2 / local disk)
    - The original file (R2 / local disk)
    - The CLIP vector from Qdrant
    - All related DB rows (cascaded: quality score, face detections, variants, embeddings)
    """
    from app.services import qdrant_service

    result = await db.execute(select(Image).where(Image.id == image_id))
    img = result.scalar_one_or_none()
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")

    variants_result = await db.execute(select(AssetVariant).where(AssetVariant.image_id == image_id))
    variants = variants_result.scalars().all()

    # Delete files from storage
    await _delete_image_files(img, variants, settings)

    # Delete CLIP vector from Qdrant
    await qdrant_service.delete_image_vector(qdrant, str(image_id), settings)

    # Delete DB record (cascades to quality_score, face_detections, variants, clip_embedding)
    await db.delete(img)
    await db.commit()

    return {"deleted": str(image_id)}


@router.delete("/batches/{batch_id}", status_code=200, summary="Delete an entire batch and all its images")
async def delete_batch(
    batch_id: UUID,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
    qdrant=Depends(get_qdrant_client),
):
    """
    Permanently deletes all images in a batch plus the batch record itself.
    Cleans up storage files and Qdrant vectors for every image in the batch.
    """
    from app.services import qdrant_service

    result = await db.execute(select(UploadBatch).where(UploadBatch.id == batch_id))
    batch = result.scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    images_result = await db.execute(select(Image).where(Image.batch_id == batch_id))
    images = images_result.scalars().all()

    for img in images:
        variants_result = await db.execute(select(AssetVariant).where(AssetVariant.image_id == img.id))
        variants = variants_result.scalars().all()
        await _delete_image_files(img, variants, settings)
        await qdrant_service.delete_image_vector(qdrant, str(img.id), settings)

    # Deleting the batch cascades to all images and their children
    await db.delete(batch)
    await db.commit()

    return {"deleted_batch": str(batch_id), "deleted_images": len(images)}
