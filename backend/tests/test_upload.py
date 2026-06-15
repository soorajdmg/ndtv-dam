"""Tests for the upload pipeline (validation layer, without Celery)."""
import io
import pytest
from httpx import AsyncClient
from PIL import Image as PILImage
from unittest.mock import patch


def make_jpeg(width: int = 640, height: int = 480) -> bytes:
    buf = io.BytesIO()
    PILImage.new("RGB", (width, height), (100, 150, 200)).save(buf, format="JPEG")
    buf.seek(0)
    return buf.read()


def make_png(width: int = 640, height: int = 480) -> bytes:
    buf = io.BytesIO()
    PILImage.new("RGB", (width, height), (200, 100, 50)).save(buf, format="PNG")
    buf.seek(0)
    return buf.read()


@pytest.fixture(autouse=True)
def mock_celery(monkeypatch):
    """Prevent real Celery tasks from being dispatched during tests."""
    with patch("app.tasks.ingest_tasks.process_batch.apply_async"):
        yield


@pytest.mark.asyncio
async def test_upload_single_jpeg(client: AsyncClient, tmp_path):
    data = make_jpeg()
    response = await client.post(
        "/api/upload/batch",
        files=[("files", ("test.jpg", data, "image/jpeg"))],
    )
    assert response.status_code == 202
    body = response.json()
    assert "batch_id" in body
    assert body["total_images"] >= 1
    assert body["status"] == "pending"


@pytest.mark.asyncio
async def test_upload_multiple_files(client: AsyncClient, tmp_path):
    files = [("files", (f"img{i}.jpg", make_jpeg(), "image/jpeg")) for i in range(5)]
    response = await client.post("/api/upload/batch", files=files)
    assert response.status_code == 202
    body = response.json()
    assert body["total_images"] == 5


@pytest.mark.asyncio
async def test_upload_rejects_invalid_type(client: AsyncClient):
    response = await client.post(
        "/api/upload/batch",
        files=[("files", ("test.txt", b"not an image", "text/plain"))],
    )
    assert response.status_code == 202
    body = response.json()
    # File should be rejected, not queued
    assert body["total_images"] == 0
    assert len(body["rejected_files"]) == 1


@pytest.mark.asyncio
async def test_upload_rejects_too_small_image(client: AsyncClient):
    tiny = make_jpeg(width=50, height=50)
    response = await client.post(
        "/api/upload/batch",
        files=[("files", ("tiny.jpg", tiny, "image/jpeg"))],
    )
    assert response.status_code == 202
    body = response.json()
    assert body["total_images"] == 0
    assert len(body["rejected_files"]) == 1
    assert "resolution" in body["rejected_files"][0]


@pytest.mark.asyncio
async def test_duplicate_detection(client: AsyncClient):
    data = make_jpeg()
    files = [("files", (f"img{i}.jpg", data, "image/jpeg")) for i in range(2)]
    response = await client.post("/api/upload/batch", files=files)
    assert response.status_code == 202
    body = response.json()
    # One original + one duplicate
    assert body["duplicate_images"] >= 1


@pytest.mark.asyncio
async def test_batch_status_endpoint(client: AsyncClient):
    data = make_jpeg()
    upload_resp = await client.post(
        "/api/upload/batch",
        files=[("files", ("test.jpg", data, "image/jpeg"))],
    )
    batch_id = upload_resp.json()["batch_id"]

    status_resp = await client.get(f"/api/batch/{batch_id}/status")
    assert status_resp.status_code == 200
    body = status_resp.json()
    assert body["batch_id"] == batch_id
    assert body["status"] == "pending"
    assert "percent_complete" in body


@pytest.mark.asyncio
async def test_batch_status_not_found(client: AsyncClient):
    fake_id = "00000000-0000-0000-0000-000000000001"
    response = await client.get(f"/api/batch/{fake_id}/status")
    assert response.status_code == 404
