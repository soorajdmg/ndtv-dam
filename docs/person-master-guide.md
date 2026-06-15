# Person Master Guide

## Adding a Person

### Via API
```bash
curl -X POST http://localhost:8000/api/persons \
  -H "Content-Type: application/json" \
  -d '{
    "full_name": "Nirmala Sitharaman",
    "aliases": ["FM Sitharaman", "NS"],
    "designation": "Finance Minister",
    "organization": "Ministry of Finance",
    "category": "Government"
  }'
```

### Via Frontend
Navigate to **Persons → Add Person** and fill the form.

### Categories
- `Government` — politicians, ministers, bureaucrats
- `Analyst` — economists, market analysts, commentators
- `Businessperson` — CEOs, founders, industry leaders
- `NDTV Staff` — anchors, editors, reporters
- `Politician`, `Sports`, `Entertainment`, `Other`

## Reference Images

For better recognition accuracy, provide a reference image when creating a person:
- Use a clear frontal face photo
- Minimum resolution: 200×200px
- The system extracts the face embedding and stores it for matching

## Handling Duplicates

If you try to create a person who already exists, the API returns `409 Conflict`:
```json
{
  "message": "Person already exists",
  "existing_id": "uuid...",
  "existing_name": "Nirmala Sitharaman"
}
```

Always check this before creating to avoid duplicates.

## Adding Aliases

```bash
curl -X POST "http://localhost:8000/api/persons/{person_id}/aliases?alias=NS"
```

Aliases are used in text-based fallback search and deduplication checks.

## Merging Persons

If you have two records for the same person:

```bash
curl -X POST http://localhost:8000/api/persons/merge \
  -H "Content-Type: application/json" \
  -d '{
    "source_person_id": "uuid-to-delete",
    "target_person_id": "uuid-to-keep"
  }'
```

This will:
1. Move all `face_recognitions` from source → target
2. Copy aliases from source to target
3. Soft-delete the source person (preserves audit trail)

## Bulk Import

Prepare a CSV file:
```csv
full_name,aliases,designation,organization,category
Nirmala Sitharaman,"FM Sitharaman,NS",Finance Minister,Ministry of Finance,Government
```

Then run:
```bash
python scripts/import_person_master.py --file persons.csv
```
