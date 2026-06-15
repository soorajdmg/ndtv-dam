"""Tests for the Review Queue API."""
import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.face_models import FaceDetection, FaceRecognition
from app.models.image_models import Image, UploadBatch
from app.models.job_models import ReviewQueue


async def _seed_review_item(db: AsyncSession) -> tuple[str, str]:
    """Create the minimum records needed to have a ReviewQueue item."""
    batch = UploadBatch(id=uuid.uuid4(), status="completed", total_images=1)
    db.add(batch)
    await db.flush()

    img = Image(
        id=uuid.uuid4(),
        batch_id=batch.id,
        original_filename="test.jpg",
        storage_path="/tmp/test.jpg",
        upload_status="completed",
        is_duplicate=False,
    )
    db.add(img)
    await db.flush()

    fd = FaceDetection(
        id=uuid.uuid4(),
        image_id=img.id,
        bbox_x=10, bbox_y=10, bbox_w=80, bbox_h=100,
        detection_confidence=0.95,
    )
    db.add(fd)
    await db.flush()

    fr = FaceRecognition(
        id=uuid.uuid4(),
        face_detection_id=fd.id,
        similarity_score=0.38,
        recognition_status="low_confidence",
        recognition_method="insightface",
    )
    db.add(fr)

    rq = ReviewQueue(
        id=uuid.uuid4(),
        face_detection_id=fd.id,
        reason="low_confidence",
        status="pending",
    )
    db.add(rq)
    await db.flush()

    return str(rq.id), str(fd.id)


@pytest.mark.asyncio
async def test_get_review_queue(client: AsyncClient, db_session: AsyncSession):
    await _seed_review_item(db_session)
    response = await client.get("/api/review/queue")
    assert response.status_code == 200
    body = response.json()
    assert "items" in body
    assert "total" in body
    assert body["total"] >= 1


@pytest.mark.asyncio
async def test_claim_review_item(client: AsyncClient, db_session: AsyncSession):
    review_id, _ = await _seed_review_item(db_session)
    response = await client.post(
        f"/api/review/queue/{review_id}/claim?reviewer=editor1"
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "in_review"
    assert body["assigned_to"] == "editor1"


@pytest.mark.asyncio
async def test_resolve_review_reject(client: AsyncClient, db_session: AsyncSession):
    review_id, _ = await _seed_review_item(db_session)
    # Claim first
    await client.post(f"/api/review/queue/{review_id}/claim?reviewer=editor1")

    response = await client.post(
        f"/api/review/queue/{review_id}/resolve",
        json={"action": "reject", "notes": "Not a match"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "resolved"
    assert body["action"] == "reject"


@pytest.mark.asyncio
async def test_resolve_already_resolved_returns_409(client: AsyncClient, db_session: AsyncSession):
    review_id, _ = await _seed_review_item(db_session)
    await client.post(f"/api/review/queue/{review_id}/claim?reviewer=editor1")
    await client.post(
        f"/api/review/queue/{review_id}/resolve",
        json={"action": "reject"},
    )
    # Resolve again → 409
    response = await client.post(
        f"/api/review/queue/{review_id}/resolve",
        json={"action": "confirm"},
    )
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_bulk_resolve(client: AsyncClient, db_session: AsyncSession):
    r1, _ = await _seed_review_item(db_session)
    r2, _ = await _seed_review_item(db_session)

    response = await client.post(
        "/api/review/bulk-resolve",
        json={"review_ids": [r1, r2], "action": "reject"},
    )
    assert response.status_code == 200
    assert response.json()["resolved"] == 2
