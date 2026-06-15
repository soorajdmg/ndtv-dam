import io
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import StreamingResponse
from PIL import Image as PILImage
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.models.face_models import FaceDetection, FaceRecognition
from app.models.image_models import Image, ImagePersonLink
from app.models.job_models import ProcessingLog, ReviewQueue
from app.models.person_models import Person
from app.schemas.review_schemas import (
    BulkResolveRequest,
    ReviewClaimResponse,
    ReviewQueueItem,
    ReviewQueueListResponse,
    ReviewResolveRequest,
    ReviewResolveResponse,
)

router = APIRouter(prefix="/api/review", tags=["review"])


@router.get("/queue", response_model=ReviewQueueListResponse, summary="List review queue items")
async def get_review_queue(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    reason: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    query = select(ReviewQueue).where(ReviewQueue.status.in_(["pending", "in_review"]))
    if reason:
        query = query.where(ReviewQueue.reason == reason)

    count_res = await db.execute(select(func.count()).select_from(query.subquery()))
    total = count_res.scalar_one()

    pending_res = await db.execute(
        select(func.count()).select_from(ReviewQueue).where(ReviewQueue.status == "pending")
    )
    pending_count = pending_res.scalar_one()
    in_review_res = await db.execute(
        select(func.count()).select_from(ReviewQueue).where(ReviewQueue.status == "in_review")
    )
    in_review_count = in_review_res.scalar_one()

    result = await db.execute(
        query.order_by(ReviewQueue.created_at.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items_raw = result.scalars().all()

    items = []
    for rq in items_raw:
        fd_res = await db.execute(select(FaceDetection).where(FaceDetection.id == rq.face_detection_id))
        fd = fd_res.scalar_one_or_none()
        if not fd:
            continue

        # Get AI guess
        fr_res = await db.execute(
            select(FaceRecognition)
            .where(FaceRecognition.face_detection_id == fd.id)
            .order_by(FaceRecognition.similarity_score.desc().nullslast())
        )
        fr = fr_res.scalars().first()

        person_name = None
        if fr and fr.matched_person_id:
            p_res = await db.execute(select(Person).where(Person.id == fr.matched_person_id))
            p = p_res.scalar_one_or_none()
            person_name = p.full_name if p else None

        items.append(ReviewQueueItem(
            id=rq.id,
            face_detection_id=rq.face_detection_id,
            image_id=fd.image_id,
            reason=rq.reason,
            status=rq.status,
            assigned_to=rq.assigned_to,
            detection_confidence=fd.detection_confidence,
            ai_guess_person_id=fr.matched_person_id if fr else None,
            ai_guess_person_name=person_name,
            ai_similarity_score=fr.similarity_score if fr else None,
            created_at=rq.created_at,
        ))

    return ReviewQueueListResponse(
        items=items,
        total=total,
        pending_count=pending_count,
        in_review_count=in_review_count,
    )


@router.post("/queue/{review_id}/claim", response_model=ReviewClaimResponse, summary="Claim a review item")
async def claim_review(
    review_id: UUID,
    reviewer: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(ReviewQueue).where(ReviewQueue.id == review_id))
    rq = result.scalar_one_or_none()
    if not rq:
        raise HTTPException(status_code=404, detail="Review item not found")
    if rq.status == "resolved":
        raise HTTPException(status_code=409, detail="Review item already resolved")
    if rq.status == "in_review" and rq.assigned_to != reviewer:
        raise HTTPException(status_code=409, detail=f"Item already claimed by {rq.assigned_to}")

    rq.status = "in_review"
    rq.assigned_to = reviewer
    await db.flush()

    return ReviewClaimResponse(review_id=review_id, status=rq.status, assigned_to=reviewer)


@router.post("/queue/{review_id}/resolve", response_model=ReviewResolveResponse, summary="Resolve a review item")
async def resolve_review(
    review_id: UUID,
    payload: ReviewResolveRequest,
    reviewer: str = Query(default="system"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(ReviewQueue).where(ReviewQueue.id == review_id))
    rq = result.scalar_one_or_none()
    if not rq:
        raise HTTPException(status_code=404, detail="Review item not found")
    if rq.status == "resolved":
        raise HTTPException(status_code=409, detail="Already resolved")

    fd_res = await db.execute(select(FaceDetection).where(FaceDetection.id == rq.face_detection_id))
    fd = fd_res.scalar_one_or_none()
    if not fd:
        raise HTTPException(status_code=404, detail="Face detection not found")

    fr_res = await db.execute(
        select(FaceRecognition).where(FaceRecognition.face_detection_id == fd.id)
    )
    fr = fr_res.scalars().first()

    now = datetime.now(timezone.utc)

    if payload.action == "confirm" and fr:
        fr.recognition_method = "manual"
        fr.reviewed_by = reviewer
        fr.reviewed_at = now

    elif payload.action == "correct" and payload.person_id:
        if fr:
            fr.matched_person_id = payload.person_id
            fr.recognition_status = "recognized"
            fr.recognition_method = "manual"
            fr.reviewed_by = reviewer
            fr.reviewed_at = now
        # Update image-person link
        existing_link_res = await db.execute(
            select(ImagePersonLink).where(
                ImagePersonLink.image_id == fd.image_id,
                ImagePersonLink.person_id == payload.person_id,
            )
        )
        if not existing_link_res.scalar_one_or_none():
            db.add(ImagePersonLink(image_id=fd.image_id, person_id=payload.person_id))

    elif payload.action == "reject" and fr:
        fr.recognition_status = "rejected"
        fr.reviewed_by = reviewer
        fr.reviewed_at = now
        # Remove image-person link
        link_res = await db.execute(
            select(ImagePersonLink).where(ImagePersonLink.image_id == fd.image_id)
        )
        for link in link_res.scalars().all():
            await db.delete(link)

    rq.status = "resolved"
    rq.resolved_at = now
    rq.resolution_notes = payload.notes
    await db.flush()

    db.add(ProcessingLog(
        image_id=fd.image_id,
        stage="review_resolution",
        status="completed",
        input_metadata={"review_id": str(review_id), "action": payload.action},
        output_metadata={"reviewed_by": reviewer},
    ))

    return ReviewResolveResponse(review_id=review_id, status="resolved", action=payload.action)


@router.post("/queue/{review_id}/create-new-person", summary="Create person from review context")
async def create_person_from_review(
    review_id: UUID,
    full_name: str,
    designation: Optional[str] = None,
    organization: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(ReviewQueue).where(ReviewQueue.id == review_id))
    rq = result.scalar_one_or_none()
    if not rq:
        raise HTTPException(status_code=404, detail="Review item not found")

    fd_res = await db.execute(select(FaceDetection).where(FaceDetection.id == rq.face_detection_id))
    fd = fd_res.scalar_one_or_none()

    # Create new person
    new_person = Person(
        full_name=full_name,
        designation=designation,
        organization=organization,
        face_embedding=fd.embedding_vector if fd else None,
    )
    db.add(new_person)
    await db.flush()

    # Link to image
    if fd:
        db.add(ImagePersonLink(image_id=fd.image_id, person_id=new_person.id, primary_face=True))

        # Update face recognition
        fr_res = await db.execute(select(FaceRecognition).where(FaceRecognition.face_detection_id == fd.id))
        fr = fr_res.scalars().first()
        if fr:
            fr.matched_person_id = new_person.id
            fr.recognition_status = "recognized"
            fr.recognition_method = "manual"
            fr.reviewed_at = datetime.now(timezone.utc)

    rq.status = "resolved"
    rq.resolved_at = datetime.now(timezone.utc)
    await db.flush()

    return {"message": "New person created and review resolved", "person_id": str(new_person.id)}


@router.post("/bulk-resolve", summary="Bulk resolve review items")
async def bulk_resolve(payload: BulkResolveRequest, db: AsyncSession = Depends(get_db)):
    resolved = 0
    for review_id in payload.review_ids:
        result = await db.execute(select(ReviewQueue).where(ReviewQueue.id == review_id))
        rq = result.scalar_one_or_none()
        if rq and rq.status != "resolved":
            fd_res = await db.execute(select(FaceDetection).where(FaceDetection.id == rq.face_detection_id))
            fd = fd_res.scalar_one_or_none()

            if payload.action == "reject" and fd:
                fr_res = await db.execute(select(FaceRecognition).where(FaceRecognition.face_detection_id == fd.id))
                fr = fr_res.scalars().first()
                if fr:
                    fr.recognition_status = "rejected"

            rq.status = "resolved"
            rq.resolved_at = datetime.now(timezone.utc)
            resolved += 1

    return {"resolved": resolved}
