"""Tests for the /health endpoint."""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health_returns_200(client: AsyncClient):
    response = await client.get("/health")
    # Health can return 200 even if dependencies are degraded (just checks structure)
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_health_response_shape(client: AsyncClient):
    response = await client.get("/health")
    data = response.json()
    assert "service" in data
    assert "status" in data
    assert "checks" in data
    assert data["service"] == "ndtv-dam-backend"
