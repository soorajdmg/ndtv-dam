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
