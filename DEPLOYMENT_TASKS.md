# NDTV DAM — Deployment Task List

**Strategy:** Free hosting for frontend, API, and all databases.
Celery ML workers run **locally** and connect to cloud services.

---

## Section 1 — External Services Setup (Do this first, manually)

Sign up and collect credentials from each service. You will need these before any code changes.

### 1.1 Neon (PostgreSQL)
- [ ] Sign up at https://neon.tech
- [ ] Create a new project (e.g. `ndtv-dam`)
- [ ] Copy the **connection string** — looks like:
  `postgresql+asyncpg://user:password@ep-xxx.us-east-1.aws.neon.tech/ndbname?sslmode=require`
- [ ] Save it — this replaces `DATABASE_URL` in your `.env`

### 1.2 Upstash (Redis)
- [ ] Sign up at https://upstash.com
- [ ] Create a new Redis database (region closest to you)
- [ ] Copy the **Redis URL** — looks like:
  `rediss://default:password@xxx.upstash.io:6379`
- [ ] Save it — this replaces `REDIS_URL` in your `.env`

### 1.3 Qdrant Cloud (Vector DB)
- [ ] Sign up at https://cloud.qdrant.io
- [ ] Create a free cluster (1 GB)
- [ ] Copy the **cluster URL** and **API key**
  - URL: `https://xxx-xxx.us-east4-0.gcp.cloud.qdrant.io`
  - API Key: found in the cluster dashboard
- [ ] Save both — replaces `QDRANT_HOST` and adds `QDRANT_API_KEY` in your `.env`

### 1.4 Cloudflare R2 (File Storage)
- [ ] Sign up at https://cloudflare.com (free account)
- [ ] Go to **R2 Object Storage** in the dashboard
- [ ] Create a bucket named `ndtv-dam-uploads`
- [ ] Go to **Manage R2 API Tokens** → Create token with **Object Read & Write** permissions
- [ ] Copy:
  - Account ID
  - Access Key ID
  - Secret Access Key
  - Bucket name: `ndtv-dam-uploads`
  - Endpoint: `https://<account-id>.r2.cloudflarestorage.com`
- [ ] Make the bucket **public** (optional, for direct URL access) or use presigned URLs

### 1.5 Render (Backend API)
- [ ] Sign up at https://render.com
- [ ] Connect your GitHub account and push the project repo (or use manual deploy)
- [ ] Create a new **Web Service**
  - Root directory: `backend`
  - Runtime: **Docker** (use `docker/backend.Dockerfile`)
  - Instance type: **Free**
- [ ] Add all environment variables (from Phase 3 below) in the Render dashboard
- [ ] Copy your Render service URL — looks like: `https://ndtv-dam-api.onrender.com`
- [ ] Note: Free tier spins down after 15 min idle — first request after idle is slow (~30–60s)

### 1.6 Vercel (Frontend)
- [ ] Sign up at https://vercel.com
- [ ] Import your GitHub repo
- [ ] Set root directory to `frontend`
- [ ] Add environment variable:
  - `NEXT_PUBLIC_API_URL` = your Render backend URL (e.g. `https://ndtv-dam-api.onrender.com`)
- [ ] Deploy

---

## Section 2 — Code Changes (Phased)

### Phase 1 — Add S3/R2 File Storage Support

**Goal:** Replace all local `/data/uploads/` filesystem references with Cloudflare R2 (S3-compatible).

Files to change:
- [ ] `backend/pyproject.toml` — add `boto3` dependency
- [ ] `backend/app/config.py` — add R2/S3 config settings (bucket name, endpoint, keys)
- [ ] `backend/app/services/` — create new `storage_service.py` for upload/download/URL generation
- [ ] `backend/app/routers/upload_router.py` — save uploaded files to R2 instead of local disk
- [ ] `backend/app/routers/asset_router.py` — serve/download files from R2 instead of local disk
- [ ] `backend/app/tasks/variant_tasks.py` — read source image from R2, write variants back to R2
- [ ] `backend/app/tasks/ingest_tasks.py` — check if file path references need updating
- [ ] `frontend/next.config.js` — add R2 public domain to `remotePatterns` for `<Image>` tags

### Phase 2 — Qdrant Cloud Authentication

**Goal:** Qdrant Cloud requires an API key; local Qdrant does not. Update the Qdrant client to support it.

Files to change:
- [ ] `backend/app/config.py` — add `QDRANT_API_KEY` and `QDRANT_USE_HTTPS` settings
- [ ] `backend/app/services/qdrant_service.py` — pass API key and HTTPS to the Qdrant client constructor

### Phase 3 — Environment Variables

**Goal:** Document and update all env vars for cloud deployment.

- [ ] `backend/.env.production` (new file, not committed) — create with all cloud values:
  ```
  DATABASE_URL=postgresql+asyncpg://...neon.tech/...?sslmode=require
  REDIS_URL=rediss://default:...@....upstash.io:6379
  QDRANT_HOST=https://xxx.cloud.qdrant.io
  QDRANT_API_KEY=your-qdrant-api-key
  QDRANT_PORT=6333
  R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
  R2_ACCESS_KEY_ID=your-key
  R2_SECRET_ACCESS_KEY=your-secret
  R2_BUCKET_NAME=ndtv-dam-uploads
  R2_PUBLIC_URL=https://pub-xxx.r2.dev  (if public bucket enabled)
  UPLOAD_DIR=/tmp/uploads  (temp local dir for workers only)
  ```
- [ ] `frontend/.env.production` (new file, not committed):
  ```
  NEXT_PUBLIC_API_URL=https://ndtv-dam-api.onrender.com
  ```
- [ ] Add `*.env.production` to `.gitignore` so secrets are never committed

### Phase 4 — Database Migration Against Cloud Postgres

**Goal:** Run Alembic migrations to create all tables in Neon.

Steps (run locally, targeting cloud DB):
- [ ] Set `DATABASE_URL` in your local shell to the Neon connection string
- [ ] Run: `cd backend && alembic upgrade head`
- [ ] Verify all 14 migration versions applied successfully in Neon dashboard

### Phase 5 — Local Celery Worker Setup for Cloud Services

**Goal:** Configure your local machine to run Celery workers that connect to cloud Redis, Postgres, and Qdrant.

- [ ] Create `backend/.env.local-worker` with cloud service URLs but local model paths
- [ ] Verify Celery worker starts and connects: `celery -A app.worker worker --loglevel=info`
- [ ] Test by uploading an image via the deployed frontend and watching the local worker pick up the job
- [ ] Document the start command in `README.md` or `Makefile` as `make worker-cloud`

### Phase 6 — Update next.config.js for Production

**Goal:** Allow the Next.js `<Image>` component to load images from R2 and the Render backend.

- [ ] `frontend/next.config.js` — update `remotePatterns`:
  - Remove `localhost:8000`
  - Add your Render backend URL
  - Add your R2 public bucket URL (if using public access)

---

## Section 3 — Deployment Checklist (Final Verification)

Do these after all code changes and service signups are done.

- [ ] Push updated code to GitHub
- [ ] Render auto-deploys from GitHub — confirm build succeeds
- [ ] Vercel auto-deploys from GitHub — confirm build succeeds
- [ ] Open deployed frontend URL — confirm it loads
- [ ] Hit `GET /health` on the Render backend — confirm Postgres, Redis, Qdrant all show healthy
- [ ] Start local Celery workers pointing to cloud services
- [ ] Upload a test image via the frontend — confirm it appears in R2 bucket
- [ ] Confirm Celery worker processes the job (face detection, CLIP embedding, variants)
- [ ] Run a semantic search — confirm Qdrant returns results
- [ ] Check review queue works end-to-end

---

## Quick Reference — Service URLs After Setup

| Service | URL |
|---|---|
| Frontend | `https://your-project.vercel.app` |
| Backend API | `https://ndtv-dam-api.onrender.com` |
| API Docs (Swagger) | `https://ndtv-dam-api.onrender.com/docs` |
| Neon Dashboard | https://console.neon.tech |
| Upstash Dashboard | https://console.upstash.com |
| Qdrant Cloud Dashboard | https://cloud.qdrant.io |
| Cloudflare R2 Dashboard | https://dash.cloudflare.com → R2 |

---

## Notes

- **Celery workers must run locally** whenever you need image processing (face detection, CLIP embedding, variant generation). The API on Render only receives uploads and queues jobs — workers do the actual ML work.
- **Render free tier sleeps** after 15 minutes of no traffic. The first request after sleep takes 30–60 seconds to wake up. This is expected.
- **Qdrant free tier** gives 1 GB. Each CLIP embedding is 768 floats × 4 bytes = ~3 KB. You can store ~300,000 embeddings before hitting the limit.
- **Neon free tier** gives 500 MB storage and 1 compute unit. Sufficient for demo/portfolio use.
- **Cloudflare R2 free tier** gives 10 GB storage and 1 million read operations/month. Sufficient for demo use.

---

## Section 4 — What Can Go Wrong (Risk Analysis)

A full audit of every known failure point discovered by analyzing the codebase. Read this before touching anything.

---

### CRITICAL — Will definitely break without fixing

#### C1. Qdrant Cloud requires API key — not implemented in code
**Affected files:** `backend/app/config.py`, `backend/app/main.py`, `backend/app/services/qdrant_service.py`, `backend/app/tasks/embedding_tasks.py`, `backend/app/tasks/face_tasks.py`

Every `AsyncQdrantClient` call currently does:
```python
AsyncQdrantClient(host=settings.qdrant_host, port=settings.qdrant_port)
```
Qdrant Cloud requires a full URL and an API key. This will silently fail or throw a connection error.

**Fix (Phase 2):** Add `QDRANT_API_KEY` and `QDRANT_URL` to config, update every client instantiation to:
```python
AsyncQdrantClient(url=settings.qdrant_url, api_key=settings.qdrant_api_key)
```

---

#### C2. Upstash Redis requires `rediss://` (TLS) — not `redis://`
**Affected files:** `backend/app/config.py`, `backend/app/worker.py`

The default config has `redis://localhost:6379/0`. Upstash requires encrypted connections (`rediss://`). Celery will fail to connect if the protocol is wrong.

**Fix (Phase 3):** Set `REDIS_URL=rediss://default:password@xxx.upstash.io:6379` in env. The `s` in `rediss` is not a typo — it means TLS.

---

#### C3. Neon PostgreSQL requires SSL — connection string must include `?sslmode=require`
**Affected files:** `backend/app/config.py`, `backend/alembic/env.py`

Neon rejects unencrypted connections. A `DATABASE_URL` without `?sslmode=require` will fail immediately.

**Fix (Phase 3):** Always use:
```
postgresql+asyncpg://user:pass@ep-xxx.neon.tech/dbname?sslmode=require
```
Alembic already handles the `asyncpg → psycopg2` conversion correctly, but the `sslmode` must be present.

---

#### C4. Local filesystem `/data/uploads/` does not exist on Render
**Affected files:** `backend/app/config.py`, `backend/app/routers/upload_router.py`, `backend/app/routers/asset_router.py`, `backend/app/tasks/variant_tasks.py`, `backend/app/tasks/ingest_tasks.py`

The entire upload and variant pipeline reads/writes to `/data/uploads/`. On Render (and any ephemeral container), this path does not persist between deploys or restarts. Any uploaded file is gone the moment the container restarts.

**Fix (Phase 1):** Implement Cloudflare R2 storage. All file reads/writes must go through the storage service, not local disk.

---

#### C5. `/assets/ndtv_profit_logo.png` does not exist on Render
**Affected files:** `backend/app/config.py`, `backend/app/tasks/variant_tasks.py`

The branded variant (16:9 watermarked) reads the logo from `/assets/ndtv_profit_logo.png`, which is a Docker volume mount. On Render this file won't exist. The code logs a warning and skips the watermark, so it won't crash — but all branded variants will be generated without the logo.

**Fix (Phase 1):** Upload the logo to R2 and read it from there, or bundle it into the Docker image directly.

---

#### C6. CORS will reject all frontend requests in production
**Affected files:** `backend/app/main.py`, `backend/app/config.py`

Current CORS config:
```python
allow_origins=[settings.frontend_url, "http://localhost:3000"]
```
`settings.frontend_url` defaults to `http://localhost:3000`. In production, the Vercel frontend is on `https://your-app.vercel.app`. The backend on Render will reject every API request from Vercel with a CORS error.

**Fix (Phase 3):** Set `FRONTEND_URL=https://your-app.vercel.app` in Render environment variables.

---

#### C7. `next.config.js` image domains hardcoded to `localhost:8000`
**Affected files:** `frontend/next.config.js`

Next.js `<Image>` components will refuse to load images from any domain not listed in `remotePatterns`. Currently only `localhost:8000` is listed. All images from the Render backend or R2 will fail to display.

**Fix (Phase 6):** Add Render backend hostname and R2 public hostname to `remotePatterns`.

---

### HIGH — Will cause failures or data loss under normal use

#### H1. Render free tier has 512 MB RAM — ML models need 4–6 GB
**Affected files:** `backend/app/main.py`, `backend/app/services/face_service.py`, `backend/app/services/clip_service.py`, `backend/app/services/birefnet_service.py`

The startup lifespan tries to warm up InsightFace on boot. On Render free tier (512 MB RAM), this will trigger an OOM kill and the container will crash-loop.

**Fix:** The backend deployed to Render must NOT load ML models. Since Celery workers (which run the ML tasks) stay local, the API itself should not import or warm up any models at startup. The lifespan warmup in `main.py` must be disabled or made conditional for cloud deployment.

---

#### H2. BiRefNet fallback (`rembg`) is not in `pyproject.toml`
**Affected files:** `backend/app/services/birefnet_service.py`, `backend/pyproject.toml`

`birefnet_service.py` has a fallback to `rembg` if BiRefNet fails. However `rembg` is not listed as a dependency in `pyproject.toml`. If BiRefNet fails (circuit breaker opens), the fallback will throw `ModuleNotFoundError`.

**Fix (Phase 1):** Add `rembg` to `pyproject.toml` dependencies, or remove the fallback reference.

---

#### H3. HuggingFace model downloads will timeout on first Render boot
**Affected files:** `backend/app/services/clip_service.py`, `backend/app/services/birefnet_service.py`

Models are downloaded from HuggingFace Hub on first use. On Render free tier, the container has limited network and disk. The download can take several minutes and may exceed Render's startup timeout (causing the deploy to be marked as failed).

The `backend.Dockerfile` claims to pre-cache models at build time, but if this step fails silently during build, the runtime download will still happen.

**Fix:** Verify the Docker build actually caches the models. Check the build log for the `huggingface-cli download` or equivalent step. If not caching correctly, add explicit download commands to the Dockerfile.

---

#### H4. Alembic migrations will NOT run automatically on Render deploys
**Affected files:** `backend/alembic/`, Render deploy config

There is no startup script that runs `alembic upgrade head` before the FastAPI server starts. After pushing schema changes, the deployed API will run against an outdated database schema, causing 500 errors.

**Fix:** Add a pre-start script to Render. In the Render dashboard, set a **Pre-Deploy Command**:
```bash
cd backend && alembic upgrade head
```
Or add it to the Docker entrypoint.

---

#### H5. Database connection pool exhaustion with dual sync/async pools
**Affected files:** `backend/app/tasks/variant_tasks.py`, `backend/app/tasks/ingest_tasks.py`, `backend/app/tasks/face_tasks.py`, `backend/app/tasks/embedding_tasks.py`, `backend/app/tasks/quality_tasks.py`

Every Celery task creates its own synchronous SQLAlchemy engine and session. The FastAPI app also has its own async engine. On Neon's free tier (which limits concurrent connections to ~20), running multiple Celery tasks simultaneously alongside normal API traffic can exhaust the connection pool.

**Fix:** Configure `pool_size` and `max_overflow` in both engines. For Neon free tier, keep pool sizes small (2–5 total connections).

---

#### H6. Celery Beat scheduler loses state on container restart
**Affected files:** `backend/app/worker.py`, `docker-compose.yml`

Celery Beat uses a local file (`celerybeat-schedule`) to track last-run times. On Render or any ephemeral container, this file is lost on every restart. Beat will re-run all periodic tasks immediately on startup, potentially causing duplicate job execution.

**Fix:** Since workers run locally for this deployment, Celery Beat also runs locally — so this is less of a problem. Just be aware: every time you restart your local worker, Beat will re-trigger the stale batch cleanup job.

---

### MEDIUM — Will degrade functionality or cause confusing behavior

#### M1. Blocking filesystem I/O inside async route handlers
**Affected files:** `backend/app/routers/upload_router.py`, `backend/app/routers/asset_router.py`

Calls like `Path.mkdir()`, `os.path.exists()`, and `PILImage.open()` are synchronous (blocking). In an async FastAPI handler, these block the event loop and prevent other requests from being processed concurrently.

**Fix:** Use `asyncio.to_thread()` to wrap blocking calls, or use `aiofiles.os` equivalents. This is less critical since Render free tier handles low traffic anyway.

---

#### M2. Render free tier spins down — Celery jobs queue up silently
**Affected files:** N/A (architecture issue)

If someone uploads images while the Render backend is asleep (spun down), the request will fail or timeout. The jobs will never be queued to Redis because the API never received them.

**Behavior to expect:** Users will see a slow first request (~30–60s wake-up). If the request times out before Render wakes up, the upload is lost.

**Fix:** No code fix needed. Just inform users to retry if the first request fails. Or use Render's paid tier to keep the instance always-on.

---

#### M3. `NEXT_PUBLIC_API_URL` must be set at Vercel build time, not runtime
**Affected files:** `frontend/` (any file using `process.env.NEXT_PUBLIC_API_URL`)

In Next.js, `NEXT_PUBLIC_*` variables are baked into the JavaScript bundle at **build time**, not runtime. If you set the env var in Vercel's dashboard after the first deploy, you must **redeploy** for it to take effect. Just saving the variable is not enough.

**Fix:** Set `NEXT_PUBLIC_API_URL` in Vercel before the first deploy. If you change the backend URL later, trigger a manual redeploy in Vercel.

---

#### M4. Qdrant collections must be created before first use
**Affected files:** `backend/app/main.py` (lifespan), `backend/app/services/qdrant_service.py`

The app's startup lifespan tries to create Qdrant collections. If Qdrant Cloud is unreachable during startup (or API key is wrong), collections won't be created. Later embedding tasks will then fail because the collection doesn't exist.

**Fix:** Ensure Qdrant credentials are correct before deploying. Test the connection manually:
```bash
curl -H "api-key: YOUR_KEY" https://your-cluster.qdrant.io/collections
```

---

#### M5. Render Docker build may fail — Dockerfile path is relative
**Affected files:** `docker/backend.Dockerfile`, Render deploy config

When deploying to Render using Docker, Render sets the build context to the repo root. The `backend.Dockerfile` may have `COPY` instructions that assume a specific context. Verify all `COPY` paths are relative to the repo root, not the `docker/` folder.

**Fix:** In Render's Docker settings, set:
- Dockerfile path: `docker/backend.Dockerfile`
- Docker context: `.` (repo root)

---

#### M6. Person reference images stored locally won't persist
**Affected files:** `backend/app/routers/person_router.py`

When adding a person with a reference image, the image is likely saved to the local filesystem (same upload pipeline). On Render, these reference images will be lost on restart, meaning the person master entries will exist in the database but their reference images will 404.

**Fix (Phase 1):** Covered by the R2 storage migration — once all uploads go to R2, person reference images will also be persisted there.

---

#### M7. Prometheus metrics endpoint may cause issues on Render
**Affected files:** `backend/app/main.py`

`prometheus-fastapi-instrumentator` is registered in the app. This is fine, but the `/metrics` endpoint is publicly accessible with no auth. Not a blocker, just be aware the endpoint is open.

---

### LOW — Minor issues, easy to fix

#### L1. `.env.example` has real-looking but fake credentials
**Affected files:** `.env.example`

The example file uses `ndtv` / `ndtvpass` as credentials. These look like real credentials and could confuse someone. More importantly, if anyone accidentally uses `.env.example` directly instead of creating a new `.env`, they'll get confusing connection failures.

**Fix:** Use clearly placeholder values like `YOUR_DB_PASSWORD` in `.env.example`.

---

#### L2. Git history may already contain secrets
**Affected files:** `.env` (if ever committed)

If a `.env` file with real credentials was ever committed to the repo (even if later deleted), those credentials are still in git history.

**Fix:** Before pushing to GitHub, run:
```bash
git log --all --full-history -- .env
```
If `.env` appears in history, rotate all credentials and use `git filter-repo` to clean the history.

---

#### L3. `next.config.js` uses `http://` for remote pattern — Render uses `https://`
**Affected files:** `frontend/next.config.js`

Current config:
```javascript
protocol: "http",
hostname: "localhost",
```
In production, Render serves over HTTPS. The `protocol` field in `remotePatterns` must be `"https"` for production URLs.

---

#### L4. No `.gitignore` entry for `.env.production` files
**Affected files:** `.gitignore` (if it exists)

The Phase 3 task creates `backend/.env.production` with real credentials. If `.gitignore` doesn't explicitly exclude it, it could accidentally be committed.

**Fix (Phase 3):** Explicitly add to `.gitignore`:
```
.env.production
.env.local-worker
*.env.production
```

---

## Risk Summary Table

| ID | Risk | Severity | Phase to Fix |
|---|---|---|---|
| C1 | Qdrant Cloud needs API key — not in code | CRITICAL | Phase 2 |
| C2 | Upstash needs `rediss://` TLS protocol | CRITICAL | Phase 3 |
| C3 | Neon needs `?sslmode=require` in DB URL | CRITICAL | Phase 3 |
| C4 | Local filesystem `/data/uploads/` won't exist on Render | CRITICAL | Phase 1 |
| C5 | Logo path `/assets/ndtv_profit_logo.png` won't exist on Render | CRITICAL | Phase 1 |
| C6 | CORS will block Vercel frontend from calling Render backend | CRITICAL | Phase 3 |
| C7 | `next.config.js` images blocked — only localhost allowed | CRITICAL | Phase 6 |
| H1 | ML model warmup on Render will OOM crash the API | HIGH | Phase 2 |
| H2 | `rembg` fallback not in dependencies | HIGH | Phase 1 |
| H3 | HuggingFace model downloads timeout on first Render boot | HIGH | Docker |
| H4 | Alembic migrations won't run automatically on deploy | HIGH | Section 1.5 |
| H5 | DB connection pool exhaustion on Neon free tier | HIGH | Phase 3 |
| H6 | Celery Beat loses schedule state on restart | HIGH | Local only |
| M1 | Blocking I/O in async handlers | MEDIUM | Optional |
| M2 | Render sleep causes upload timeouts | MEDIUM | Architecture |
| M3 | `NEXT_PUBLIC_API_URL` baked at build time — redeploy needed | MEDIUM | Section 1.6 |
| M4 | Qdrant collections must be created before first use | MEDIUM | Section 3 |
| M5 | Render Docker build context may break COPY paths | MEDIUM | Section 1.5 |
| M6 | Person reference images lost on Render restart | MEDIUM | Phase 1 |
| M7 | `/metrics` endpoint publicly accessible | LOW | Optional |
| L1 | `.env.example` has misleading fake credentials | LOW | Cleanup |
| L2 | Git history may contain committed secrets | LOW | Before GitHub push |
| L3 | `next.config.js` uses `http://` — Render needs `https://` | LOW | Phase 6 |
| L4 | `.env.production` not in `.gitignore` | LOW | Phase 3 |
