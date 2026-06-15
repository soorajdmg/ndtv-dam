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

# Install API-only dependencies (no torch/insightface/CLIP — keeps image small).
# COPY from repo root (Render sets build context to ".").
COPY backend/requirements-api.txt ./
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements-api.txt

# Copy application code
COPY backend/ .

# Register /app permanently in Python's path via a .pth file.
# This means `import app` works from any working directory with no
# PYTHONPATH tricks needed — and without installing pyproject.toml
# (which would pull in torch/insightface/ML packages we don't want here).
RUN echo "/app" > "$(python -c 'import site; print(site.getsitepackages()[0])')/ndtv_dam.pth"

# Temp dir for any local file ops (R2 materialisations, etc.)
RUN mkdir -p /tmp/dam_variants /tmp/dam_clips /tmp/dam_faces

EXPOSE 8000

CMD ["sh", "-c", "python -m alembic -c /app/alembic.ini upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1"]
