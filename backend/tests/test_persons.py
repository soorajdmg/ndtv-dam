"""Tests for the Person Master API."""
import pytest
from httpx import AsyncClient


PERSON_PAYLOAD = {
    "full_name": "Test Person",
    "aliases": ["TP", "Testy"],
    "designation": "Test Designation",
    "organization": "Test Org",
    "category": "Government",
}


@pytest.mark.asyncio
async def test_create_person(client: AsyncClient):
    response = await client.post("/api/persons", json=PERSON_PAYLOAD)
    assert response.status_code == 201
    data = response.json()
    assert data["full_name"] == "Test Person"
    assert data["aliases"] == ["TP", "Testy"]
    assert data["category"] == "Government"
    assert "id" in data
    return data["id"]


@pytest.mark.asyncio
async def test_create_duplicate_person_returns_409(client: AsyncClient):
    await client.post("/api/persons", json=PERSON_PAYLOAD)
    response = await client.post("/api/persons", json=PERSON_PAYLOAD)
    assert response.status_code == 409
    detail = response.json()["detail"]
    assert detail["message"] == "Person already exists"


@pytest.mark.asyncio
async def test_list_persons(client: AsyncClient):
    await client.post("/api/persons", json=PERSON_PAYLOAD)
    response = await client.get("/api/persons")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert data["total"] >= 1


@pytest.mark.asyncio
async def test_list_persons_search_filter(client: AsyncClient):
    await client.post("/api/persons", json=PERSON_PAYLOAD)
    response = await client.get("/api/persons?search=Test+Person")
    assert response.status_code == 200
    data = response.json()
    assert any(p["full_name"] == "Test Person" for p in data["items"])


@pytest.mark.asyncio
async def test_list_persons_no_match(client: AsyncClient):
    response = await client.get("/api/persons?search=DefinitelyNotFound12345")
    assert response.status_code == 200
    assert response.json()["total"] == 0


@pytest.mark.asyncio
async def test_get_person(client: AsyncClient):
    create_resp = await client.post("/api/persons", json=PERSON_PAYLOAD)
    person_id = create_resp.json()["id"]

    response = await client.get(f"/api/persons/{person_id}")
    assert response.status_code == 200
    assert response.json()["id"] == person_id


@pytest.mark.asyncio
async def test_get_nonexistent_person_returns_404(client: AsyncClient):
    fake_id = "00000000-0000-0000-0000-000000000000"
    response = await client.get(f"/api/persons/{fake_id}")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_update_person(client: AsyncClient):
    create_resp = await client.post("/api/persons", json=PERSON_PAYLOAD)
    person_id = create_resp.json()["id"]

    response = await client.put(
        f"/api/persons/{person_id}",
        json={"designation": "Updated Designation"},
    )
    assert response.status_code == 200
    assert response.json()["designation"] == "Updated Designation"


@pytest.mark.asyncio
async def test_delete_person(client: AsyncClient):
    create_resp = await client.post("/api/persons", json=PERSON_PAYLOAD)
    person_id = create_resp.json()["id"]

    delete_resp = await client.delete(f"/api/persons/{person_id}")
    assert delete_resp.status_code == 204

    # Deleted person should return 404
    get_resp = await client.get(f"/api/persons/{person_id}")
    assert get_resp.status_code == 404


@pytest.mark.asyncio
async def test_merge_persons(client: AsyncClient):
    p1 = (await client.post("/api/persons", json={**PERSON_PAYLOAD, "full_name": "Person Alpha"})).json()
    p2 = (await client.post("/api/persons", json={**PERSON_PAYLOAD, "full_name": "Person Beta"})).json()

    merge_resp = await client.post(
        "/api/persons/merge",
        json={"source_person_id": p1["id"], "target_person_id": p2["id"]},
    )
    assert merge_resp.status_code == 200
    assert merge_resp.json()["target_id"] == p2["id"]

    # Source should now be soft-deleted (404)
    assert (await client.get(f"/api/persons/{p1['id']}")).status_code == 404
    # Target still accessible
    assert (await client.get(f"/api/persons/{p2['id']}")).status_code == 200
