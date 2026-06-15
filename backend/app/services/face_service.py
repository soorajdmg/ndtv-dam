"""
InsightFace integration: detection, embedding extraction, cosine similarity matching,
and in-memory person embedding cache.
"""
import logging
import threading
from dataclasses import dataclass, field
from typing import Optional

import numpy as np

log = logging.getLogger(__name__)

# ─── Circuit Breaker ──────────────────────────────────────────────────────────
_face_failures = 0
_face_failure_lock = threading.Lock()
FACE_SERVICE_DEGRADED = False
MAX_CONSECUTIVE_FAILURES = 5


def _record_failure():
    global _face_failures, FACE_SERVICE_DEGRADED
    with _face_failure_lock:
        _face_failures += 1
        if _face_failures >= MAX_CONSECUTIVE_FAILURES:
            FACE_SERVICE_DEGRADED = True
            log.critical("InsightFace circuit breaker OPEN — face detection suspended")


def _record_success():
    global _face_failures, FACE_SERVICE_DEGRADED
    with _face_failure_lock:
        _face_failures = 0
        FACE_SERVICE_DEGRADED = False


# ─── Data Classes ─────────────────────────────────────────────────────────────
@dataclass
class FaceDetectionResult:
    bbox: tuple[int, int, int, int]  # x, y, w, h
    detection_confidence: float
    embedding: np.ndarray
    pose_yaw: float
    pose_pitch: float
    pose_roll: float
    landmarks: Optional[list] = None


@dataclass
class RecognitionResult:
    matched_person_id: Optional[str]
    similarity_score: float
    status: str  # recognized | low_confidence | unknown


# ─── Singleton Model ─────────────────────────────────────────────────────────
_face_app = None
_face_app_lock = threading.Lock()

# In-memory person embedding cache: {person_id: np.ndarray}
_person_embeddings: dict[str, np.ndarray] = {}
_embedding_lock = threading.Lock()


def get_face_app():
    global _face_app
    if _face_app is None:
        with _face_app_lock:
            if _face_app is None:
                try:
                    import insightface
                    from app.config import get_settings
                    settings = get_settings()
                    fa = insightface.app.FaceAnalysis(
                        name=settings.insightface_model,
                        allowed_modules=["detection", "recognition"],
                    )
                    fa.prepare(ctx_id=0, det_size=(640, 640))
                    _face_app = fa
                    log.info("InsightFace model loaded: %s", settings.insightface_model)
                    _record_success()
                except Exception as e:
                    _record_failure()
                    log.error("Failed to load InsightFace model: %s", e)
                    raise
    return _face_app


def detect_faces(image_path: str) -> list[FaceDetectionResult]:
    """Detect all faces in an image and return structured results."""
    if FACE_SERVICE_DEGRADED:
        log.warning("Face service degraded — skipping detection")
        return []

    import cv2
    try:
        fa = get_face_app()
        img = cv2.imread(image_path)
        if img is None:
            raise ValueError(f"Cannot read image: {image_path}")

        faces = fa.get(img)
        results = []
        for face in faces:
            x1, y1, x2, y2 = [int(v) for v in face.bbox]
            w, h = x2 - x1, y2 - y1
            pose = face.pose if (hasattr(face, "pose") and face.pose is not None) else [0.0, 0.0, 0.0]
            results.append(FaceDetectionResult(
                bbox=(x1, y1, w, h),
                detection_confidence=float(face.det_score),
                embedding=face.embedding if face.embedding is not None else np.zeros(512),
                pose_yaw=float(pose[1]),
                pose_pitch=float(pose[0]),
                pose_roll=float(pose[2]),
                landmarks=face.kps.tolist() if hasattr(face, "kps") and face.kps is not None else None,
            ))
        _record_success()
        return results

    except Exception as e:
        _record_failure()
        log.error("Face detection failed for %s: %s", image_path, e)
        raise


def compute_similarity(embedding_a: np.ndarray, embedding_b: np.ndarray) -> float:
    """Cosine similarity between two face embeddings."""
    norm_a = np.linalg.norm(embedding_a)
    norm_b = np.linalg.norm(embedding_b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(embedding_a, embedding_b) / (norm_a * norm_b))


def load_person_embeddings(db_session) -> None:
    """Load all person embeddings from DB into in-memory cache."""
    from app.models.person_models import Person
    global _person_embeddings

    persons = db_session.query(Person).filter(
        Person.face_embedding.isnot(None),
        Person.deleted_at.is_(None),
    ).all()

    new_cache = {}
    for p in persons:
        if p.face_embedding:
            new_cache[str(p.id)] = np.array(p.face_embedding, dtype=np.float32)

    with _embedding_lock:
        _person_embeddings = new_cache

    log.info("Person embeddings loaded: %d", len(new_cache))


def refresh_person_embeddings() -> None:
    """Reload person embedding cache (called after Person Master updates)."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.config import get_settings

    settings = get_settings()
    sync_url = settings.database_url.replace("postgresql+asyncpg", "postgresql+psycopg2")
    engine = create_engine(sync_url, pool_pre_ping=True)
    Session = sessionmaker(bind=engine)
    db = Session()
    try:
        load_person_embeddings(db)
    finally:
        db.close()


def recognize_face(face_embedding: np.ndarray, threshold: Optional[float] = None) -> RecognitionResult:
    """Match a face embedding against the person cache using cosine similarity."""
    from app.config import get_settings
    settings = get_settings()

    if threshold is None:
        threshold = settings.confidence_face_threshold
    low_threshold = settings.confidence_low_threshold

    with _embedding_lock:
        cache = dict(_person_embeddings)

    if not cache:
        return RecognitionResult(matched_person_id=None, similarity_score=0.0, status="unknown")

    best_person_id = None
    best_score = -1.0

    for person_id, ref_embedding in cache.items():
        score = compute_similarity(face_embedding, ref_embedding)
        if score > best_score:
            best_score = score
            best_person_id = person_id

    if best_score >= threshold:
        return RecognitionResult(matched_person_id=best_person_id, similarity_score=best_score, status="recognized")
    elif best_score >= low_threshold:
        return RecognitionResult(matched_person_id=best_person_id, similarity_score=best_score, status="low_confidence")
    else:
        return RecognitionResult(matched_person_id=None, similarity_score=best_score, status="unknown")
