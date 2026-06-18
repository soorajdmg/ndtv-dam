from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class AssetVariantResponse(BaseModel):
    id: UUID
    image_id: UUID
    variant_type: str
    storage_path: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    file_size_bytes: Optional[int] = None
    generation_status: str
    error_message: Optional[str] = None
    generated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ImageMetadataUpdate(BaseModel):
    title: Optional[str] = None
    caption: Optional[str] = None
    manual_tags: Optional[list[str]] = None


class ImageDetailResponse(BaseModel):
    id: UUID
    batch_id: UUID
    original_filename: str
    title: Optional[str] = None
    caption: Optional[str] = None
    manual_tags: list[str] = []
    width: Optional[int] = None
    height: Optional[int] = None
    file_size_bytes: Optional[int] = None
    format: Optional[str] = None
    upload_status: str
    is_duplicate: bool = False
    duplicate_of_id: Optional[UUID] = None
    created_at: datetime

    model_config = {"from_attributes": True}
