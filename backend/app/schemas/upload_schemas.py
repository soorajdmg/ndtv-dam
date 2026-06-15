from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class ImageResponse(BaseModel):
    id: UUID
    batch_id: UUID
    original_filename: str
    storage_path: str
    width: Optional[int] = None
    height: Optional[int] = None
    file_size_bytes: Optional[int] = None
    format: Optional[str] = None
    upload_status: str
    is_duplicate: bool
    duplicate_of_id: Optional[UUID] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class UploadBatchResponse(BaseModel):
    batch_id: UUID
    total_images: int
    queued_images: int
    duplicate_images: int
    rejected_files: list[str] = []
    status: str


class BatchStatusResponse(BaseModel):
    batch_id: UUID
    status: str
    total: int
    processed: int
    failed: int
    percent_complete: float
    estimated_remaining: None = None
    created_at: datetime
    completed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
