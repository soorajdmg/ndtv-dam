# ──────────────────────────────────────────────────────────────────────────────
# API-only image — deployed to Render (free tier, 512 MB RAM).
#
# ML models (InsightFace, CLIP, BiRefNet) are NOT loaded here.
# All ML processing is done by the local Celery workers (see worker.Dockerfile).
#
# Build context: repo root (set "Docker context" to "." in Render dashboard).
# Dockerfile path in Render: docker/backend.Dockerfile
# ──────────────────────────────────────────────────────────────────────────────
FROM python:3.11-slim

# Minimal system deps for Pillow, imagehash, psycopg2
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    libgl1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies.
# COPY from repo root (Render sets build context to ".").
COPY backend/pyproject.toml ./
RUN pip install --no-cache-dir --upgrade pip "setuptools>=68" wheel && \
    pip install --no-cache-dir "."

# Copy application code
COPY backend/ .

# Temp dir for any local file ops (R2 materialisations, etc.)
RUN mkdir -p /tmp/dam_variants /tmp/dam_clips /tmp/dam_faces

EXPOSE 8000

# Run Alembic migrations then start the API server.
# On Render you can also set this as a Pre-Deploy Command instead.
CMD alembic upgrade head && \
    uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1
