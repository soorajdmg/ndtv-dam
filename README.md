# NDTV Digital Asset Management (DAM)

AI-powered image asset management system for news organisations. Accepts batch image uploads, performs face recognition, semantic indexing (CLIP + Qdrant), quality scoring, automated variant generation, and provides a full editorial review workflow.

---

## Architecture at a glance

```
Browser (Next.js 14)
       │
       ▼
FastAPI Backend (Python 3.11)
  ├── PostgreSQL 16    — relational metadata, persons, recognitions
  ├── Qdrant           — CLIP vector search (768-d cosine)
  └── Redis + Celery   — async pipeline (5 queues)
         ├── ingest    — orchestration, duplicate detection
         ├── quality   — sharpness / brightness / composition scoring
         ├── face      — InsightFace detect + recognize + review queue
         ├── embedding — CLIP encode + Qdrant upsert
         └── variant   — BiRefNet cutout, square gray-bg, branded 16:9
```

Full architecture details: [docs/architecture.md](docs/architecture.md)

---

## Prerequisites

- Docker ≥ 24 and Docker Compose v2
- 8 GB RAM minimum (16 GB recommended — InsightFace + CLIP models)
- GPU optional but speeds up face detection and CLIP encoding significantly
- GNU Make (or run commands manually — see `Makefile` for reference)

---

## Quick Start

### 1. Clone and configure environment

```bash
git clone <repo-url> ndtv-dam
cd ndtv-dam
cp .env.example .env          # edit if needed (defaults work for local dev)
```

### 2. Start all services

```bash
make up
# Equivalent: docker compose up -d --build
```

Services started:
| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API docs (Swagger) | http://localhost:8000/docs |
| Flower (Celery monitor) | http://localhost:5555 |
| Qdrant dashboard | http://localhost:6333/dashboard |

### 3. Run database migrations

```bash
make migrate
# Equivalent: docker compose exec backend alembic upgrade head
```

This creates all 14 tables and PostgreSQL enums.

### 4. Seed the Person Master (optional)

```bash
make seed
# Equivalent: docker compose exec backend python scripts/seed_person_master.py
```

Loads a small sample dataset of persons and organisations.

### 5. Import your own Person Master

```bash
docker compose exec backend python scripts/import_person_master.py --file /path/to/persons.csv
```

See [docs/person-master-guide.md](docs/person-master-guide.md) for CSV format.

---

## Development Workflow

### Run backend tests

```bash
make test-backend
# Equivalent: docker compose exec backend pytest --cov=app --cov-report=term-missing
```

Tests use an in-memory SQLite database — no running infrastructure required.

### Lint and type-check

```bash
make lint
# Runs ruff check + mypy on backend; eslint on frontend
```

### Watch logs

```bash
docker compose logs -f backend
docker compose logs -f celery_worker
```

### Stop all services

```bash
make down
```

---

## API Overview

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Service + dependency health check, circuit breaker state |
| `POST` | `/api/upload/batch` | Upload image batch (multipart, up to 500 files) |
| `GET` | `/api/batch/{id}/status` | Batch processing progress |
| `GET` | `/api/batches` | Paginated list of all batches |
| `GET` | `/api/batch/{id}/shortlist` | Top-ranked images for a batch |
| `POST` | `/api/search/semantic` | Semantic text search (CLIP + Qdrant) |
| `POST` | `/api/search/similar` | Find visually similar images by image ID |
| `GET` | `/api/search/by-person/{id}` | All images featuring a person |
| `POST` | `/api/persons` | Create a person with optional reference image |
| `GET` | `/api/persons` | Paginated + filtered person list |
| `PUT` | `/api/persons/{id}` | Update person metadata / embedding |
| `POST` | `/api/persons/merge` | Merge duplicate person records |
| `GET` | `/api/review/queue` | Pending review items |
| `POST` | `/api/review/queue/{id}/claim` | Claim a review item |
| `POST` | `/api/review/queue/{id}/resolve` | Confirm / correct / reject a recognition |
| `POST` | `/api/review/bulk-resolve` | Bulk resolve multiple items |
| `GET` | `/api/images/{id}/variants` | Asset variants for an image |
| `GET` | `/api/assets/{variant_id}/download` | Stream variant file |
| `POST` | `/api/admin/reprocess-image/{id}` | Reprocess specific pipeline stages |
| `POST` | `/health/reset-circuit/{service}` | Reset tripped AI service circuit breaker |
| `GET` | `/metrics` | Prometheus metrics |

Full interactive docs: http://localhost:8000/docs

---

## Pipeline Stages (per image)

```
Upload → Duplicate check (pHash + MD5)
       → quality_tasks.score_image      [QUEUE_QUALITY]
       → face_tasks.process_image_faces [QUEUE_FACE]
             ├── Detected → FaceRecognition → ImagePersonLink
             ├── low_confidence / unknown → ReviewQueue
             └── unknown embedding → Qdrant unknown_faces collection
       → embedding_tasks.index_image    [QUEUE_EMBEDDING]
             └── CLIP encode → Qdrant images collection
       → variant_tasks.generate_variants [QUEUE_VARIANT]
             ├── transparent_cutout.png  (BiRefNet)
             ├── square_gray_bg.jpg      (1000×1000)
             └── branded_16_9.jpg        (1920×1080 NDTV branded)
       → ingest_tasks.batch_finalizer
             └── shortlist_batch (top-N diversity-filtered)
```

---

## Resilience & Fallbacks

| Component | Circuit Breaker | Fallback |
|---|---|---|
| InsightFace | Opens after 5 consecutive failures | Images indexed via CLIP only; no face data |
| BiRefNet | Opens after 3 consecutive failures | Variant generation skipped; image still searchable |
| CLIP | N/A (hard fail) | Image logged as `clip_embedding: failed`; still in PG |
| Qdrant | N/A | Search endpoint returns metadata-only results |

Reset a tripped circuit breaker:
```bash
curl -X POST http://localhost:8000/health/reset-circuit/face
curl -X POST http://localhost:8000/health/reset-circuit/birefnet
```

---

## Key Configuration

See [.env.example](.env.example) for all variables. Most important:

| Variable | Default | Description |
|---|---|---|
| `CONFIDENCE_FACE_THRESHOLD` | `0.45` | Cosine similarity for confirmed recognition |
| `CONFIDENCE_LOW_THRESHOLD` | `0.35` | Below this → unknown face |
| `SHORTLIST_COUNT` | `5` | Images shortlisted per batch |
| `PHASH_DUPLICATE_THRESHOLD` | `8` | Hamming distance for near-duplicate |
| `BRAND_LOGO_PATH` | `/assets/ndtv_profit_logo.png` | Watermark for 16:9 variant |
| `CLIP_MODEL_NAME` | `openai/clip-vit-large-patch14` | CLIP model for semantic search |
| `INSIGHTFACE_MODEL` | `buffalo_l` | InsightFace model pack |

---

## Guides

- [Architecture & Data Flow](docs/architecture.md)
- [Person Master Management](docs/person-master-guide.md)
- [Semantic Search Guide](docs/search-guide.md)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), React Query, Tailwind CSS |
| Backend | FastAPI 0.111, Python 3.11, SQLAlchemy 2.0 async |
| Database | PostgreSQL 16 (Alembic migrations) |
| Vector Store | Qdrant (COSINE, 768-d CLIP vectors) |
| Job Queue | Celery 5.4 + Redis, Flower monitoring |
| Face AI | InsightFace `buffalo_l` (512-d embeddings) |
| Semantic AI | CLIP `openai/clip-vit-large-patch14` |
| BG Removal | BiRefNet (rembg fallback) |
| Observability | Prometheus + structlog JSON |
