from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class SearchFilters(BaseModel):
    persons: list[UUID] = Field(default_factory=list)
    organizations: list[UUID] = Field(default_factory=list)
    categories: list[str] = Field(default_factory=list)
    min_quality_score: Optional[float] = None
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    is_approved: Optional[bool] = None


class SemanticSearchRequest(BaseModel):
    query_text: str = Field(..., min_length=1)
    filters: SearchFilters = Field(default_factory=SearchFilters)
    top_k: int = Field(default=20, ge=1, le=100)


class SimilarSearchRequest(BaseModel):
    image_id: UUID
    top_k: int = Field(default=10, ge=1, le=50)


class SearchResultItem(BaseModel):
    image_id: UUID
    score: float
    storage_path: str
    original_filename: str
    overall_quality_score: Optional[float] = None
    matched_persons: list[str] = []
    batch_id: UUID
    upload_date: datetime


class SemanticSearchResponse(BaseModel):
    query: str
    results: list[SearchResultItem]
    total: int
    fallback_used: bool = False
