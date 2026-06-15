from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel


class ReviewQueueItem(BaseModel):
    id: UUID
    face_detection_id: UUID
    image_id: UUID
    reason: str
    status: str
    assigned_to: Optional[str] = None
    detection_confidence: float
    ai_guess_person_id: Optional[UUID] = None
    ai_guess_person_name: Optional[str] = None
    ai_similarity_score: Optional[float] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ReviewQueueListResponse(BaseModel):
    items: list[ReviewQueueItem]
    total: int
    pending_count: int
    in_review_count: int


class ReviewClaimResponse(BaseModel):
    review_id: UUID
    status: str
    assigned_to: str


class ReviewResolveRequest(BaseModel):
    action: Literal["confirm", "correct", "reject"]
    person_id: Optional[UUID] = None
    notes: Optional[str] = None


class ReviewResolveResponse(BaseModel):
    review_id: UUID
    status: str
    action: str


class BulkResolveRequest(BaseModel):
    review_ids: list[UUID]
    action: Literal["confirm", "reject"]
