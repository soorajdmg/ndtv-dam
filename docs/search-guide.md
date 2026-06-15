# Semantic Search Guide

## How It Works

NDTV DAM uses CLIP (Contrastive Language-Image Pretraining) to encode both images and text queries into the same 768-dimensional vector space. Searching by text finds visually relevant images even without exact keyword matches.

## Query Syntax

### Basic Text Search
```bash
POST /api/search/semantic
{
  "query_text": "finance minister press conference",
  "top_k": 20
}
```

### With Filters
```bash
POST /api/search/semantic
{
  "query_text": "budget announcement",
  "filters": {
    "persons": ["uuid-of-nirmala-sitharaman"],
    "categories": ["Government"],
    "min_quality_score": 0.6,
    "date_from": "2024-01-01",
    "date_to": "2024-12-31",
    "is_approved": true
  },
  "top_k": 10
}
```

## Filter Options

| Filter | Type | Description |
|--------|------|-------------|
| `persons` | `UUID[]` | Only images featuring these person IDs |
| `organizations` | `UUID[]` | Only images linked to these org IDs |
| `categories` | `string[]` | Person categories: Government, Analyst, etc. |
| `min_quality_score` | `float [0-1]` | Filter out low-quality images |
| `date_from` / `date_to` | `YYYY-MM-DD` | Date range filter |
| `is_approved` | `bool` | Only variant-approved images |

## Finding Similar Images

```bash
POST /api/search/similar
{
  "image_id": "uuid-of-reference-image",
  "top_k": 10
}
```

Returns images visually similar to the reference image using CLIP embedding similarity.

## Images by Person

```bash
GET /api/search/by-person/{person_id}?page=1&page_size=20
```

Returns all images featuring a specific person, sorted by quality score.

## Scoring

Search result scores are cosine similarity values between the query embedding and image embeddings:
- `>= 0.9` — Very high relevance
- `0.7 - 0.9` — High relevance
- `0.5 - 0.7` — Moderate relevance
- `< 0.5` — Low relevance (results may be less related)

## Fallback Search

If CLIP search returns zero results above threshold, the system falls back to PostgreSQL `ILIKE` search on:
- `persons.full_name`
- `persons.aliases`
- `organizations.name`

The response includes `"fallback_used": true` when this occurs.
