import io
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.dependencies import get_db
from app.models import Image, Organization, Person, PersonOrganizationLink
from app.models.image_models import ImagePersonLink
from app.services import storage_service
from app.schemas.person_schemas import (
    OrganizationCreate,
    OrganizationResponse,
    OrganizationUpdate,
    PersonCreate,
    PersonListResponse,
    PersonMergeRequest,
    PersonOrganizationLinkCreate,
    PersonResponse,
    PersonUpdate,
)

router = APIRouter(prefix="/api", tags=["persons"])


# ─── Persons ──────────────────────────────────────────────────────────────────

@router.post("/persons", response_model=PersonResponse, status_code=201, summary="Create a person")
async def create_person(
    payload: PersonCreate,
    db: AsyncSession = Depends(get_db),
):
    # Deduplication check — return existing record so callers can proceed without error
    filters = [Person.full_name.ilike(payload.full_name), Person.deleted_at.is_(None)]
    result = await db.execute(select(Person).where(*filters))
    existing = result.scalar_one_or_none()
    if existing:
        count_res = await db.execute(
            select(func.count()).select_from(ImagePersonLink).where(ImagePersonLink.person_id == existing.id)
        )
        return PersonResponse(
            id=existing.id,
            full_name=existing.full_name,
            aliases=existing.aliases or [],
            designation=existing.designation,
            organization=existing.organization,
            category=existing.category,
            source=existing.source,
            person_type=existing.person_type,
            has_face_embedding=bool(existing.face_embedding),
            created_at=existing.created_at,
            updated_at=existing.updated_at,
            image_count=count_res.scalar_one(),
            organization_links=[],
        )

    person = Person(**payload.model_dump())
    db.add(person)
    await db.flush()

    return PersonResponse(
        id=person.id,
        full_name=person.full_name,
        aliases=person.aliases or [],
        designation=person.designation,
        organization=person.organization,
        category=person.category,
        source=person.source,
        person_type=person.person_type,
        has_face_embedding=bool(person.face_embedding),
        created_at=person.created_at,
        updated_at=person.updated_at,
        image_count=0,
        organization_links=[],
    )


@router.get("/persons", response_model=PersonListResponse, summary="List persons")
async def list_persons(
    search: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    organization: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    query = select(Person).where(Person.deleted_at.is_(None))

    if search:
        query = query.where(
            or_(Person.full_name.ilike(f"%{search}%"), Person.aliases.any(search))
        )
    if category:
        query = query.where(Person.category == category)
    if organization:
        query = query.where(Person.organization.ilike(f"%{organization}%"))

    count_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = count_result.scalar_one()

    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    persons = result.scalars().all()

    items = []
    for p in persons:
        count_res = await db.execute(
            select(func.count()).select_from(ImagePersonLink).where(ImagePersonLink.person_id == p.id)
        )
        img_count = count_res.scalar_one()
        items.append(PersonResponse(
            id=p.id,
            full_name=p.full_name,
            aliases=p.aliases or [],
            designation=p.designation,
            organization=p.organization,
            category=p.category,
            has_face_embedding=bool(p.face_embedding),
            created_at=p.created_at,
            updated_at=p.updated_at,
            image_count=img_count,
            organization_links=[],
        ))

    return PersonListResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("/persons/{person_id}", response_model=PersonResponse, summary="Get person details")
async def get_person(person_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Person).where(Person.id == person_id, Person.deleted_at.is_(None)))
    person = result.scalar_one_or_none()
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")

    count_res = await db.execute(
        select(func.count()).select_from(ImagePersonLink).where(ImagePersonLink.person_id == person_id)
    )
    img_count = count_res.scalar_one()

    return PersonResponse(
        id=person.id,
        full_name=person.full_name,
        aliases=person.aliases or [],
        designation=person.designation,
        organization=person.organization,
        category=person.category,
        has_face_embedding=bool(person.face_embedding),
        created_at=person.created_at,
        updated_at=person.updated_at,
        image_count=img_count,
        organization_links=[],
    )


@router.put("/persons/{person_id}", response_model=PersonResponse, summary="Update person")
async def update_person(
    person_id: uuid.UUID,
    payload: PersonUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Person).where(Person.id == person_id, Person.deleted_at.is_(None)))
    person = result.scalar_one_or_none()
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(person, field, value)
    await db.flush()
    await db.refresh(person)

    return PersonResponse(
        id=person.id,
        full_name=person.full_name,
        aliases=person.aliases or [],
        designation=person.designation,
        organization=person.organization,
        category=person.category,
        has_face_embedding=bool(person.face_embedding),
        created_at=person.created_at,
        updated_at=person.updated_at,
        image_count=0,
        organization_links=[],
    )


@router.delete("/persons/{person_id}", status_code=204, summary="Soft-delete person")
async def delete_person(person_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    from datetime import datetime, timezone
    result = await db.execute(select(Person).where(Person.id == person_id, Person.deleted_at.is_(None)))
    person = result.scalar_one_or_none()
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    person.deleted_at = datetime.now(timezone.utc)
    await db.flush()


@router.post("/persons/{person_id}/aliases", summary="Add alias to person")
async def add_alias(person_id: uuid.UUID, alias: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Person).where(Person.id == person_id, Person.deleted_at.is_(None)))
    person = result.scalar_one_or_none()
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")

    aliases = list(person.aliases or [])
    if alias.lower() in [a.lower() for a in aliases]:
        raise HTTPException(status_code=409, detail="Alias already exists")
    aliases.append(alias)
    person.aliases = aliases
    await db.flush()
    return {"aliases": person.aliases}


@router.post("/persons/merge", summary="Merge two persons")
async def merge_persons(payload: PersonMergeRequest, db: AsyncSession = Depends(get_db)):
    from app.models.face_models import FaceRecognition
    from datetime import datetime, timezone

    src_result = await db.execute(select(Person).where(Person.id == payload.source_person_id))
    tgt_result = await db.execute(select(Person).where(Person.id == payload.target_person_id))
    source = src_result.scalar_one_or_none()
    target = tgt_result.scalar_one_or_none()

    if not source or not target:
        raise HTTPException(status_code=404, detail="One or both persons not found")

    # Move face recognition references
    fr_result = await db.execute(
        select(FaceRecognition).where(FaceRecognition.matched_person_id == payload.source_person_id)
    )
    for fr in fr_result.scalars().all():
        fr.matched_person_id = payload.target_person_id

    # Move image_person_links from source → target (upsert to avoid PK conflicts)
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    src_links_result = await db.execute(
        select(ImagePersonLink).where(ImagePersonLink.person_id == payload.source_person_id)
    )
    for link in src_links_result.scalars().all():
        stmt = pg_insert(ImagePersonLink).values(
            image_id=link.image_id, person_id=payload.target_person_id, primary_face=link.primary_face
        ).on_conflict_do_nothing()
        await db.execute(stmt)

    # Move aliases
    src_aliases = list(source.aliases or [])
    tgt_aliases = list(target.aliases or [])
    for alias in src_aliases:
        if alias not in tgt_aliases:
            tgt_aliases.append(alias)
    if source.full_name not in tgt_aliases:
        tgt_aliases.append(source.full_name)
    target.aliases = tgt_aliases

    # Soft-delete source
    source.deleted_at = datetime.now(timezone.utc)
    await db.flush()

    return {"message": "Merge successful", "target_id": str(payload.target_person_id)}


@router.post("/persons/{person_id}/organizations", summary="Link person to organization")
async def link_person_org(
    person_id: uuid.UUID,
    payload: PersonOrganizationLinkCreate,
    db: AsyncSession = Depends(get_db),
):
    link = PersonOrganizationLink(
        person_id=person_id,
        organization_id=payload.organization_id,
        designation=payload.designation,
        valid_from=payload.valid_from,
        valid_to=payload.valid_to,
    )
    db.add(link)
    await db.flush()
    return {"message": "Linked successfully"}


# ─── Reference Photo ──────────────────────────────────────────────────────────

@router.post("/persons/{person_id}/reference-photo", summary="Upload reference face photo for a person")
async def upload_reference_photo(
    person_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Person).where(Person.id == person_id, Person.deleted_at.is_(None)))
    person = result.scalar_one_or_none()
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=422, detail="Empty file")

    # Offload ML processing to the Celery worker — the API server has no cv2/InsightFace.
    from app.tasks.face_tasks import process_reference_photo
    task = process_reference_photo.apply_async(
        args=[str(person_id), data.hex()],
        queue="face",
    )

    return {
        "message": "Reference photo queued for processing",
        "person_id": str(person_id),
        "task_id": task.id,
    }


# ─── Organizations ────────────────────────────────────────────────────────────

@router.post("/organizations", response_model=OrganizationResponse, status_code=201, summary="Create organization")
async def create_organization(payload: OrganizationCreate, db: AsyncSession = Depends(get_db)):
    org = Organization(**payload.model_dump())
    db.add(org)
    await db.flush()
    return OrganizationResponse.model_validate(org)


@router.get("/organizations", response_model=list[OrganizationResponse], summary="List organizations")
async def list_organizations(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Organization))
    orgs = result.scalars().all()
    return [OrganizationResponse.model_validate(o) for o in orgs]


@router.get("/organizations/{org_id}", response_model=OrganizationResponse, summary="Get organization")
async def get_organization(org_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return OrganizationResponse.model_validate(org)


@router.put("/organizations/{org_id}", response_model=OrganizationResponse, summary="Update organization")
async def update_organization(
    org_id: uuid.UUID,
    payload: OrganizationUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(org, field, value)
    await db.flush()
    await db.refresh(org)
    return OrganizationResponse.model_validate(org)


@router.delete("/organizations/{org_id}", status_code=204, summary="Delete organization")
async def delete_organization(org_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    # Delete old logo from storage if present
    if org.logo_url and "/api/storage/" in org.logo_url:
        old_key = org.logo_url.split("/api/storage/", 1)[-1]
        _settings = get_settings()
        storage_service.delete_file(old_key, _settings)
    await db.delete(org)
    await db.flush()


_LOGO_ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/jpg", "image/svg+xml"}
_LOGO_MAX_BYTES = 5 * 1024 * 1024  # 5 MB


@router.post(
    "/organizations/{org_id}/logo",
    response_model=OrganizationResponse,
    summary="Upload or replace organisation logo",
)
async def upload_organization_logo(
    org_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    if file.content_type not in _LOGO_ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{file.content_type}'. Allowed: JPEG, PNG, WebP, SVG.",
        )

    data = await file.read()
    if len(data) > _LOGO_MAX_BYTES:
        raise HTTPException(status_code=400, detail="Logo file exceeds 5 MB limit.")

    # Delete previous logo if one exists
    if org.logo_url and "/api/storage/" in org.logo_url:
        old_key = org.logo_url.split("/api/storage/", 1)[-1]
        storage_service.delete_file(old_key, settings)

    ext = (file.filename or "logo").rsplit(".", 1)[-1].lower() if file.filename else "png"
    key = f"logos/{org_id}.{ext}"
    storage_service.upload_file(data, key, settings)
    logo_url = storage_service.get_public_url(key, settings)

    org.logo_url = logo_url
    await db.flush()
    await db.refresh(org)
    return OrganizationResponse.model_validate(org)


@router.delete(
    "/organizations/{org_id}/logo",
    response_model=OrganizationResponse,
    summary="Remove organisation logo",
)
async def delete_organization_logo(
    org_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    if org.logo_url and "/api/storage/" in org.logo_url:
        old_key = org.logo_url.split("/api/storage/", 1)[-1]
        storage_service.delete_file(old_key, settings)

    org.logo_url = None
    await db.flush()
    await db.refresh(org)
    return OrganizationResponse.model_validate(org)


@router.get("/organizations/{org_id}/persons", response_model=PersonListResponse, summary="List persons in organization")
async def list_persons_in_org(
    org_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    query = select(Person).where(
        Person.deleted_at.is_(None),
        Person.organization.ilike(f"%{org.name}%"),
    )
    count_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = count_result.scalar_one()

    query = query.offset((page - 1) * page_size).limit(page_size)
    persons_result = await db.execute(query)
    persons = persons_result.scalars().all()

    items = []
    for p in persons:
        count_res = await db.execute(
            select(func.count()).select_from(ImagePersonLink).where(ImagePersonLink.person_id == p.id)
        )
        img_count = count_res.scalar_one()
        items.append(PersonResponse(
            id=p.id,
            full_name=p.full_name,
            aliases=p.aliases or [],
            designation=p.designation,
            organization=p.organization,
            category=p.category,
            has_face_embedding=bool(p.face_embedding),
            created_at=p.created_at,
            updated_at=p.updated_at,
            image_count=img_count,
            organization_links=[],
        ))

    return PersonListResponse(items=items, total=total, page=page, page_size=page_size)
