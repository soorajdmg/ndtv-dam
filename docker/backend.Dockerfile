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

# Minimal runtime libs — no build tools needed (no native ML extensions).
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

# Ensure Python can find the `app` package at /app/app
ENV PYTHONPATH=/app

# Install API-only dependencies (no torch/insightface/CLIP — keeps image small).
# COPY from repo root (Render sets build context to ".").
COPY backend/requirements-api.txt ./
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements-api.txt

# Copy application code
COPY backend/ .

# Temp dir for any local file ops (R2 materialisations, etc.)
RUN mkdir -p /tmp/dam_variants /tmp/dam_clips /tmp/dam_faces

EXPOSE 8000

CMD ["sh", "-c", "python -m alembic -c /app/alembic.ini upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1"]
