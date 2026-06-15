from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class QualityBreakdown(BaseModel):
    sharpness: Optional[float] = None
    brightness: Optional[float] = None
    contrast: Optional[float] = None
    face_visibility: Optional[float] = None
    composition: Optional[float] = None
    overall: Optional[float] = None


class ShortlistItem(BaseModel):
    rank: int
    image_id: UUID
    original_filename: str
    storage_path: str
    selection_reason: Optional[str] = None
    quality: QualityBreakdown
    matched_persons: list[str] = []
    variant_ids: list[UUID] = []
    semantic_tags: list[str] = []


class ShortlistResponse(BaseModel):
    batch_id: UUID
    items: list[ShortlistItem]
    total: int
