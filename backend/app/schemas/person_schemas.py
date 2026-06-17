from datetime import datetime, date
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class OrganizationCreate(BaseModel):
    name: str
    entity_type: Optional[str] = None
    parent_organization_id: Optional[UUID] = None


class OrganizationResponse(BaseModel):
    id: UUID
    name: str
    entity_type: Optional[str] = None
    parent_organization_id: Optional[UUID] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class PersonOrganizationLinkCreate(BaseModel):
    organization_id: UUID
    designation: Optional[str] = None
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None


class PersonOrganizationLinkResponse(BaseModel):
    organization_id: UUID
    designation: Optional[str] = None
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None

    model_config = {"from_attributes": True}


class PersonCreate(BaseModel):
    full_name: str = Field(..., min_length=1)
    aliases: list[str] = Field(default_factory=list)
    designation: Optional[str] = None
    organization: Optional[str] = None
    category: Optional[str] = None  # Government | Analyst | Businessperson | NDTV Staff
    source: Optional[str] = None      # NDTV | NDTV Profit | ANI | Reuters | PTI
    person_type: Optional[str] = None  # Govt | Business | Market | NDTV | Others


class PersonUpdate(BaseModel):
    full_name: Optional[str] = None
    aliases: Optional[list[str]] = None
    designation: Optional[str] = None
    organization: Optional[str] = None
    category: Optional[str] = None
    source: Optional[str] = None
    person_type: Optional[str] = None


class PersonResponse(BaseModel):
    id: UUID
    full_name: str
    aliases: list[str]
    designation: Optional[str] = None
    organization: Optional[str] = None
    category: Optional[str] = None
    source: Optional[str] = None
    person_type: Optional[str] = None
    has_face_embedding: bool = False
    created_at: datetime
    updated_at: datetime
    image_count: int = 0
    organization_links: list[PersonOrganizationLinkResponse] = []

    model_config = {"from_attributes": True}


class PersonListResponse(BaseModel):
    items: list[PersonResponse]
    total: int
    page: int
    page_size: int


class PersonMergeRequest(BaseModel):
    source_person_id: UUID
    target_person_id: UUID
