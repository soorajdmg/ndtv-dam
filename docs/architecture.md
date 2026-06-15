# NDTV DAM — System Architecture

## Overview

NDTV DAM is an AI-powered Digital Asset Management system for processing news images at scale. It automates face recognition, semantic search indexing, quality scoring, and brand variant generation.

## Service Topology

```
Browser (Next.js Frontend)
    ↓ HTTP/REST
FastAPI Backend (Port 8000)
    ├── PostgreSQL  — relational data store (metadata, persons, recognitions)
    ├── Qdrant      — vector store (CLIP embeddings for semantic search)
    ├── Redis       — Celery broker + result backend
    └── Celery Workers
            ├── QUEUE_INGEST    — batch orchestration, shortlisting
            ├── QUEUE_FACE      — InsightFace detection + recognition
            ├── QUEUE_EMBEDDING — CLIP encoding + Qdrant indexing
            ├── QUEUE_VARIANT   — BiRefNet background removal + variant generation
            └── QUEUE_QUALITY   — sharpness, brightness, contrast scoring
```

## Data Flow: Upload → Index → Search

```
1. POST /api/upload/batch
   ├── Validate files (type, size, dimensions)
   ├── Compute md5 + phash for duplicate detection
   ├── Save to UPLOAD_DIR/{batch_id}/{image_id}.ext
   ├── Create UploadBatch + Image records
   └── Enqueue process_batch(batch_id) → QUEUE_INGEST

2. Celery: process_batch
   └── Fan out per image:
       ├── score_image(image_id)    → QUEUE_QUALITY
       └── process_image_faces(image_id) → QUEUE_FACE

3. Celery: score_image
   ├── Compute sharpness (Laplacian variance)
   ├── Compute brightness (mean pixel intensity)
   ├── Compute contrast (std deviation)
   └── Write ImageQualityScore

4. Celery: process_image_faces
   ├── InsightFace detect_faces() → FaceDetection records
   ├── recognize_face() against in-memory person embedding cache
   │   ├── score >= CONFIDENCE_FACE_THRESHOLD   → recognized
   │   ├── score in [LOW_THRESHOLD, THRESHOLD)  → low_confidence → ReviewQueue
   │   └── score < LOW_THRESHOLD                → unknown → ReviewQueue + Qdrant unknown_faces
   ├── Update ImagePersonLink
   ├── Update ImageQualityScore (face_visibility, composition)
   └── Enqueue:
       ├── index_image(image_id) → QUEUE_EMBEDDING
       └── generate_variants(image_id) → QUEUE_VARIANT

5. Celery: index_image
   ├── CLIP encode_image() → 768-d normalized vector
   ├── Qdrant upsert with payload {persons, orgs, quality_score, ...}
   └── Backup vector to clip_embeddings table

6. Celery: generate_variants
   ├── Check is_approved_for_variants
   ├── BiRefNet remove_background() → RGBA cutout
   ├── Variant 1: transparent_cutout.png
   ├── Variant 2: square_gray_bg.jpg (1000×1000)
   └── Variant 3: branded_16_9.jpg (1920×1080 with NDTV Profit branding)

7. batch_finalizer → shortlist_batch
   ├── Rank all non-duplicate completed images by overall_score
   ├── Apply diversity filter (avoid same person dominating)
   └── Create ShortlistedImage records (top 5 by default)
```

## Semantic Search Flow

```
POST /api/search/semantic { query_text, filters, top_k }
    ├── CLIP encode_text(query_text) → 768-d vector
    ├── Qdrant filtered search (persons, orgs, quality threshold, date range)
    ├── Enrich results with PostgreSQL metadata
    └── Fallback: ILIKE search on persons/orgs if Qdrant returns 0 results
```

## Review Queue Flow

```
Face with low_confidence/unknown status
    → ReviewQueue record created (status=pending)
    → Editor picks from /review queue
    → Claim item (status=in_review, assigned_to=editor)
    → Resolve:
        confirm  → FaceRecognition.recognition_method = "manual"
        correct  → Update matched_person_id + ImagePersonLink
        reject   → recognition_status = "rejected", remove ImagePersonLink
        new-person → Create Person, link face, resolve queue item
```

## Resilience Features

- **Circuit breakers**: InsightFace (5 failures) and BiRefNet (3 failures) trip independently; pipeline continues with remaining stages
- **Idempotency**: All Celery tasks check ProcessingLog before executing (safe to retry)
- **Dead-letter logging**: Tasks that exhaust retries write `status=dead_letter` to ProcessingLog
- **Stale batch cleanup**: Celery Beat runs every 10 minutes to mark stuck batches as `failed`
- **Retrospective matching**: Adding a new Person triggers search of `unknown_faces` Qdrant collection for historical matches
