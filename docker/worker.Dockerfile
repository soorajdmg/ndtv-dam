# ──────────────────────────────────────────────────────────────────────────────
# Celery worker image — runs locally (NOT on Render).
#
# Contains all ML models: InsightFace, CLIP, BiRefNet.
# Connects to cloud services (Neon, Upstash Redis, Qdrant Cloud, R2) via env vars.
#
# Build from repo root:
#   docker build -f docker/worker.Dockerfile -t ndtv-dam-worker .
#
# Run (with .env.local-worker loaded):
#   docker run --env-file backend/.env.local-worker ndtv-dam-worker
# ──────────────────────────────────────────────────────────────────────────────
FROM python:3.11-slim

# System deps for OpenCV, InsightFace, Pillow, PyTorch
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    libgl1 \
    libglib2.0-dev \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/pyproject.toml ./
RUN pip install --no-cache-dir --upgrade pip "setuptools>=68" wheel && \
    pip install --no-cache-dir torch==2.3.0 torchvision==0.18.0 --index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir "."

# Pre-download CLIP model
RUN python -c "\
from transformers import CLIPModel, CLIPProcessor; \
CLIPModel.from_pretrained('openai/clip-vit-base-patch32'); \
CLIPProcessor.from_pretrained('openai/clip-vit-base-patch32'); \
print('CLIP model cached.')"

# Pre-download BiRefNet model
RUN python -c "\
from transformers import AutoModelForImageSegmentation; \
AutoModelForImageSegmentation.from_pretrained('ZhengPeng7/BiRefNet', trust_remote_code=True); \
print('BiRefNet model cached.')"

# Pre-download InsightFace buffalo_l model (retry on network failure)
RUN for i in 1 2 3 4 5; do \
      python -c "\
import insightface; \
from insightface.app import FaceAnalysis; \
app = FaceAnalysis(name='buffalo_l', providers=['CPUExecutionProvider']); \
app.prepare(ctx_id=0, det_size=(640, 640)); \
print('InsightFace buffalo_l cached.')" && break; \
      echo "Attempt $i failed, retrying..."; \
      rm -rf /root/.insightface/models/buffalo_l*; \
      sleep 5; \
    done

COPY backend/ .

RUN mkdir -p /tmp/dam_variants /tmp/dam_clips /tmp/dam_faces

# Start all five Celery queues in one worker process
CMD ["celery", "-A", "app.worker", "worker", \
     "--queues=ingest,face,embedding,variant,quality", \
     "--loglevel=info", \
     "--concurrency=2"]
