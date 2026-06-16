import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import Text, cast, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.dependencies import get_db, get_qdrant_client
from app.models import Image, Person
from app.models.embedding_models import ClipEmbedding
from app.models.image_models import ImagePersonLink, ImageQualityScore
from app.schemas.search_schemas import (
    SearchResultItem,
    SemanticSearchRequest,
    SemanticSearchResponse,
    SimilarSearchRequest,
)

_log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/search", tags=["search"])


@router.post("/semantic", response_model=SemanticSearchResponse, summary="Semantic search by text")
async def semantic_search(
    request: SemanticSearchRequest,
    db: AsyncSession = Depends(get_db),
    qdrant=Depends(get_qdrant_client),
    settings: Settings = Depends(get_settings),
):
    from app.services.clip_service import get_clip_service
    from app.services.qdrant_service import search_images

    results = []
    fallback_used = False

    try:
        clip = get_clip_service()
        query_vector = clip.encode_text(request.query_text)
        results, fallback_used = await search_images(
            qdrant=qdrant,
            query_vector=query_vector.tolist(),
            filters=request.filters,
            top_k=request.top_k,
            settings=settings,
        )
    except Exception as clip_err:
        _log.warning("CLIP/Qdrant search failed, using metadata fallback: %s", clip_err)
        fallback_used = True

    # Enrich Qdrant results with PostgreSQL metadata
    items = []
    for point in results:
        image_id = UUID(point.payload.get("image_id"))
        img_result = await db.execute(select(Image).where(Image.id == image_id))
        img = img_result.scalar_one_or_none()
        if not img:
            continue

        qs_result = await db.execute(select(ImageQualityScore).where(ImageQualityScore.image_id == image_id))
        qs = qs_result.scalar_one_or_none()

        persons_result = await db.execute(
            select(Person)
            .join(ImagePersonLink, ImagePersonLink.person_id == Person.id)
            .where(ImagePersonLink.image_id == image_id)
        )
        persons = persons_result.scalars().all()

        items.append(SearchResultItem(
            image_id=image_id,
            score=point.score,
            storage_path=img.storage_path,
            original_filename=img.original_filename,
            overall_quality_score=qs.overall_score if qs else None,
            matched_persons=[p.full_name for p in persons],
            batch_id=img.batch_id,
            upload_date=img.created_at,
        ))

    # ── Metadata fallback: tags + persons (name/aliases/designation/org) + filename ──
    if not items:
        fallback_used = True
        q = request.query_text
        seen_ids: set[UUID] = set()

        # 1. Images whose semantic tags contain the query word
        by_tags = (
            select(Image)
            .join(ClipEmbedding, ClipEmbedding.image_id == Image.id)
            .where(cast(ClipEmbedding.semantic_tags, Text).ilike(f"%{q}%"))
        )

        # 2. Images linked to a person matching name, alias, designation, or organisation
        by_person = (
            select(Image)
            .join(ImagePersonLink, ImagePersonLink.image_id == Image.id)
            .join(Person, Person.id == ImagePersonLink.person_id)
            .where(or_(
                Person.full_name.ilike(f"%{q}%"),
                Person.designation.ilike(f"%{q}%"),
                Person.organization.ilike(f"%{q}%"),
                Person.category.ilike(f"%{q}%"),
            ))
        )

        # 3. Images whose filename contains the query
        by_filename = select(Image).where(Image.original_filename.ilike(f"%{q}%"))

        async def _enrich(img: Image) -> SearchResultItem:
            qs_res = await db.execute(
                select(ImageQualityScore).where(ImageQualityScore.image_id == img.id)
            )
            qs = qs_res.scalar_one_or_none()
            p_res = await db.execute(
                select(Person)
                .join(ImagePersonLink, ImagePersonLink.person_id == Person.id)
                .where(ImagePersonLink.image_id == img.id)
            )
            persons = p_res.scalars().all()
            return SearchResultItem(
                image_id=img.id,
                score=0.0,
                storage_path=img.storage_path,
                original_filename=img.original_filename,
                overall_quality_score=qs.overall_score if qs else None,
                matched_persons=[p.full_name for p in persons],
                batch_id=img.batch_id,
                upload_date=img.created_at,
            )

        for subq in (by_tags, by_person, by_filename):
            try:
                fb_result = await db.execute(subq.limit(request.top_k))
                for img in fb_result.scalars().all():
                    if img.id in seen_ids:
                        continue
                    seen_ids.add(img.id)
                    items.append(await _enrich(img))
                    if len(items) >= request.top_k:
                        break
            except Exception as subq_err:
                _log.warning("Fallback subquery failed: %s", subq_err)
            if len(items) >= request.top_k:
                break

    return SemanticSearchResponse(
        query=request.query_text,
        results=items,
        total=len(items),
        fallback_used=fallback_used,
    )


@router.post("/similar", response_model=SemanticSearchResponse, summary="Find visually similar images")
async def find_similar(
    request: SimilarSearchRequest,
    db: AsyncSession = Depends(get_db),
    qdrant=Depends(get_qdrant_client),
    settings: Settings = Depends(get_settings),
):
    from app.services.qdrant_service import get_image_vector, search_images
    from app.schemas.search_schemas import SearchFilters

    vector = await get_image_vector(qdrant, str(request.image_id), settings)
    if vector is None:
        raise HTTPException(status_code=404, detail="Image not indexed in Qdrant")

    results, _ = await search_images(
        qdrant=qdrant,
        query_vector=vector,
        filters=SearchFilters(),
        top_k=request.top_k,
        settings=settings,
    )

    items = []
    for point in results:
        if UUID(point.payload.get("image_id")) == request.image_id:
            continue  # skip self
        img_result = await db.execute(select(Image).where(Image.id == UUID(point.payload.get("image_id"))))
        img = img_result.scalar_one_or_none()
        if not img:
            continue
        items.append(SearchResultItem(
            image_id=img.id,
            score=point.score,
            storage_path=img.storage_path,
            original_filename=img.original_filename,
            overall_quality_score=None,
            matched_persons=[],
            batch_id=img.batch_id,
            upload_date=img.created_at,
        ))

    return SemanticSearchResponse(query=str(request.image_id), results=items, total=len(items))


@router.get("/by-person/{person_id}", response_model=SemanticSearchResponse, summary="Images by person")
async def search_by_person(
    person_id: UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Image)
        .join(ImagePersonLink, ImagePersonLink.image_id == Image.id)
        .join(ImageQualityScore, ImageQualityScore.image_id == Image.id, isouter=True)
        .where(ImagePersonLink.person_id == person_id)
        .order_by(ImageQualityScore.overall_score.desc().nullslast())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    images = result.scalars().all()

    items = []
    for img in images:
        qs_res = await db.execute(select(ImageQualityScore).where(ImageQualityScore.image_id == img.id))
        qs = qs_res.scalar_one_or_none()
        items.append(SearchResultItem(
            image_id=img.id,
            score=qs.overall_score if qs else 0.0,
            storage_path=img.storage_path,
            original_filename=img.original_filename,
            overall_quality_score=qs.overall_score if qs else None,
            matched_persons=[],
            batch_id=img.batch_id,
            upload_date=img.created_at,
        ))

    return SemanticSearchResponse(query=str(person_id), results=items, total=len(items))
