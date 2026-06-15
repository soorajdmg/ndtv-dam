"""
Qdrant client wrapper: collection initialization, upsert, filtered semantic search,
and sync-deletion logic.
"""
import logging
from typing import Optional

log = logging.getLogger(__name__)


async def create_collection_if_not_exists(qdrant, collection_name: str, vector_size: int) -> None:
    from qdrant_client.models import Distance, VectorParams

    try:
        collections = await qdrant.get_collections()
        existing = {c.name for c in collections.collections}
        if collection_name not in existing:
            await qdrant.create_collection(
                collection_name=collection_name,
                vectors_config=VectorParams(size=vector_size, distance=Distance.COSINE),
            )
            log.info("Created Qdrant collection: %s", collection_name)
    except Exception as e:
        log.error("Failed to create Qdrant collection %s: %s", collection_name, e)
        raise


async def upsert_image(
    qdrant,
    image_id: str,
    vector: list[float],
    payload: dict,
    collection_name: str,
) -> None:
    from qdrant_client.models import PointStruct

    point = PointStruct(id=image_id, vector=vector, payload=payload)
    await qdrant.upsert(collection_name=collection_name, points=[point])


async def search_images(
    qdrant,
    query_vector: list[float],
    filters,
    top_k: int,
    settings,
) -> tuple[list, bool]:
    """Execute filtered vector search; returns (results, fallback_used)."""
    from qdrant_client.models import FieldCondition, Filter, MatchAny, MatchValue, Range

    must_conditions = []

    if filters.persons:
        must_conditions.append(
            FieldCondition(key="persons", match=MatchAny(any=[str(p) for p in filters.persons]))
        )
    if filters.organizations:
        must_conditions.append(
            FieldCondition(key="organizations", match=MatchAny(any=[str(o) for o in filters.organizations]))
        )
    if filters.categories:
        must_conditions.append(
            FieldCondition(key="categories", match=MatchAny(any=filters.categories))
        )
    if filters.min_quality_score is not None:
        must_conditions.append(
            FieldCondition(key="quality_score", range=Range(gte=filters.min_quality_score))
        )
    if filters.is_approved is not None:
        must_conditions.append(
            FieldCondition(key="is_approved", match=MatchValue(value=filters.is_approved))
        )

    qdrant_filter = Filter(must=must_conditions) if must_conditions else None

    try:
        results = await qdrant.search(
            collection_name=settings.qdrant_images_collection,
            query_vector=query_vector,
            query_filter=qdrant_filter,
            limit=top_k,
            with_payload=True,
        )
        return results, False
    except Exception as e:
        log.error("Qdrant search failed: %s", e)
        return [], True


async def get_image_vector(qdrant, image_id: str, settings) -> Optional[list[float]]:
    """Retrieve an image's CLIP vector from Qdrant."""
    try:
        results = await qdrant.retrieve(
            collection_name=settings.qdrant_images_collection,
            ids=[image_id],
            with_vectors=True,
        )
        if results:
            return results[0].vector
    except Exception as e:
        log.error("Failed to retrieve vector from Qdrant for %s: %s", image_id, e)
    return None


async def delete_image_vector(qdrant, image_id: str, settings) -> None:
    """Remove an image from Qdrant (called on image deletion)."""
    try:
        await qdrant.delete(
            collection_name=settings.qdrant_images_collection,
            points_selector=[image_id],
        )
    except Exception as e:
        log.error("Failed to delete from Qdrant for %s: %s", image_id, e)


async def upsert_unknown_face(
    qdrant,
    face_id: str,
    vector: list[float],
    payload: dict,
    settings,
) -> None:
    from qdrant_client.models import PointStruct

    point = PointStruct(id=face_id, vector=vector, payload=payload)
    await qdrant.upsert(
        collection_name=settings.qdrant_unknown_faces_collection,
        points=[point],
    )


async def search_unknown_faces(
    qdrant,
    query_vector: list[float],
    threshold: float,
    top_k: int,
    settings,
) -> list:
    try:
        results = await qdrant.search(
            collection_name=settings.qdrant_unknown_faces_collection,
            query_vector=query_vector,
            limit=top_k,
            score_threshold=threshold,
            with_payload=True,
        )
        return results
    except Exception as e:
        log.error("Unknown face search failed: %s", e)
        return []
