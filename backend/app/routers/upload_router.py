import hashlib
import io
import uuid
from pathlib import Path
from typing import Optional

import imagehash
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from PIL import Image as PILImage
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.dependencies import get_db
from app.models import Image, UploadBatch
from app.schemas.upload_schemas import UploadBatchResponse

router = APIRouter(prefix="/api/upload", tags=["upload"])

ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp", "image/jpg"}


async def _compute_hashes(data: bytes) -> tuple[str, str]:
    md5 = hashlib.md5(data).hexdigest()
    img = PILImage.open(io.BytesIO(data))
    phash = str(imagehash.phash(img))
    return md5, phash


async def _check_duplicate(db: AsyncSession, md5: str, phash: str, settings: Settings) -> Optional[uuid.UUID]:
    hash_str = f"{md5}:{phash}"
    # Exact match
    result = await db.execute(select(Image).where(Image.file_hash == hash_str).limit(1))
    existing = result.scalars().first()
    if existing:
        return existing.id

    # Near-duplicate: fetch all images with same MD5 prefix or similar phash
    # For PoC: do exact MD5 check then phash hamming distance check
    result = await db.execute(select(Image).where(Image.file_hash.isnot(None)))
    all_images = result.scalars().all()
    target_phash = imagehash.hex_to_hash(phash)
    for img in all_images:
        if img.file_hash:
            parts = img.file_hash.split(":")
            if len(parts) == 2:
                existing_phash = imagehash.hex_to_hash(parts[1])
                if abs(target_phash - existing_phash) <= settings.phash_duplicate_threshold:
                    return img.id
    return None


@router.post(
    "/batch",
    response_model=UploadBatchResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Upload image batch",
    description="Accepts up to MAX_UPLOAD_BATCH_SIZE images via multipart/form-data. Returns batch_id and enqueues processing.",
)
async def upload_batch(
    files: list[UploadFile] = File(...),
    submitted_by: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    import traceback, logging
    try:
        return await _upload_batch_inner(files, submitted_by, db, settings)
    except Exception as e:
        logging.getLogger("uvicorn.error").error("Upload failed: %s\n%s", e, traceback.format_exc())
        raise


async def _upload_batch_inner(
    files: list[UploadFile],
    submitted_by,
    db: AsyncSession,
    settings: Settings,
):
    if len(files) > settings.max_upload_batch_size:
        raise HTTPException(
            status_code=400,
            detail=f"Too many files. Maximum batch size is {settings.max_upload_batch_size}.",
        )

    batch_id = uuid.uuid4()
    rejected_files: list[str] = []
    queued_count = 0
    duplicate_count = 0
    image_records: list[Image] = []

    # Create batch record first
    batch = UploadBatch(
        id=batch_id,
        status="pending",
        total_images=0,
        processed_images=0,
        failed_images=0,
        submitted_by=submitted_by,
    )
    db.add(batch)
    await db.flush()

    for file in files:
        # Validate MIME type
        if file.content_type not in ALLOWED_MIME_TYPES:
            rejected_files.append(f"{file.filename}: invalid type ({file.content_type})")
            continue

        # Read data
        data = await file.read()

        # Validate file size
        if len(data) > settings.max_file_size_bytes:
            rejected_files.append(f"{file.filename}: exceeds 20MB limit")
            continue

        # Validate image and dimensions
        try:
            pil_img = PILImage.open(io.BytesIO(data))
            width, height = pil_img.size
            fmt = pil_img.format or "JPEG"
        except Exception:
            rejected_files.append(f"{file.filename}: cannot read image")
            continue

        if width < settings.min_image_dimension or height < settings.min_image_dimension:
            rejected_files.append(f"{file.filename}: resolution {width}x{height} below minimum {settings.min_image_dimension}px")
            continue

        # Compute hashes
        md5, phash = await _compute_hashes(data)
        hash_str = f"{md5}:{phash}"

        # Check for duplicates
        duplicate_of_id = await _check_duplicate(db, md5, phash, settings)
        is_duplicate = duplicate_of_id is not None

        # Save to storage (R2 if configured, otherwise local disk)
        image_id = uuid.uuid4()
        ext = Path(file.filename or "image.jpg").suffix or ".jpg"
        storage_key = f"{batch_id}/{image_id}{ext}"

        import asyncio
        from app.services import storage_service
        await asyncio.to_thread(storage_service.upload_file, data, storage_key, settings)

        # storage_path stored in DB: key when using R2, absolute path when local
        if settings.use_r2:
            storage_path = storage_key
        else:
            storage_path = str(Path(settings.upload_dir) / storage_key)

        image_record = Image(
            id=image_id,
            batch_id=batch_id,
            original_filename=file.filename or "unknown",
            storage_path=storage_path,
            file_hash=hash_str,
            width=width,
            height=height,
            file_size_bytes=len(data),
            format=fmt,
            upload_status="queued",
            is_duplicate=is_duplicate,
            duplicate_of_id=duplicate_of_id,
        )
        db.add(image_record)
        image_records.append(image_record)

        if is_duplicate:
            duplicate_count += 1
        else:
            queued_count += 1

    # Update batch totals
    batch.total_images = len(image_records)
    await db.commit()

    # Enqueue Celery task
    from app.tasks.ingest_tasks import process_batch
    process_batch.apply_async(args=[str(batch_id)], queue="ingest")

    return UploadBatchResponse(
        batch_id=batch_id,
        total_images=len(image_records),
        queued_images=queued_count,
        duplicate_images=duplicate_count,
        rejected_files=rejected_files,
        status="pending",
    )
