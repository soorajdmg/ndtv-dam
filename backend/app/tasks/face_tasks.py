"""Face detection and recognition tasks."""
import logging
import time

from app.worker import celery_app

log = logging.getLogger(__name__)


def _get_db_session():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.config import get_settings
    settings = get_settings()
    sync_url = settings.database_url.replace("postgresql+asyncpg", "postgresql+psycopg2")
    engine = create_engine(sync_url, pool_pre_ping=True, pool_size=2, max_overflow=3)
    return sessionmaker(bind=engine)()


def _make_qdrant_client(settings):
    """Create an AsyncQdrantClient for local Qdrant or Qdrant Cloud."""
    from qdrant_client import AsyncQdrantClient
    if settings.qdrant_api_key:
        host = settings.qdrant_host
        if not host.startswith("http"):
            scheme = "https" if settings.qdrant_use_https else "http"
            host = f"{scheme}://{host}"
        return AsyncQdrantClient(url=host, api_key=settings.qdrant_api_key)
    return AsyncQdrantClient(host=settings.qdrant_host, port=settings.qdrant_port)


def _check_already_done(db, image_id: str, stage: str) -> bool:
    from app.models.job_models import ProcessingLog
    return db.query(ProcessingLog).filter(
        ProcessingLog.image_id == image_id,
        ProcessingLog.stage == stage,
        ProcessingLog.status == "completed",
    ).first() is not None


@celery_app.task(
    name="app.tasks.face_tasks.process_image_faces",
    bind=True,
)
def process_image_faces(self, image_id: str):
    """Detect faces, run recognition, update DB, enqueue low-confidence for review."""
    from app.config import get_settings
    from app.models.face_models import FaceDetection, FaceRecognition
    from app.models.image_models import Image, ImagePersonLink, ImageQualityScore
    from app.models.job_models import ProcessingLog
    from app.services import face_service
    from app.tasks.quality_tasks import compute_rule_of_thirds_score

    settings = get_settings()
    db = _get_db_session()
    start_ms = int(time.time() * 1000)

    try:
        if _check_already_done(db, image_id, "face_detection"):
            log.info("Face detection already done (idempotent skip)", extra={"image_id": image_id})
            return

        # Load person embeddings cache on first run
        face_service.load_person_embeddings(db)

        db.add(ProcessingLog(image_id=image_id, stage="face_detection", status="started"))
        db.commit()

        img_record = db.query(Image).filter(Image.id == image_id).first()
        if not img_record:
            return

        img_record.upload_status = "processing"
        db.commit()

        # ── Detect faces ──────────────────────────────────────────────────────
        # Materialise file from R2 if needed before passing to InsightFace
        if settings.use_r2:
            from app.services.storage_service import key_to_local_tmp_path, download_to_path
            import pathlib
            local_img = key_to_local_tmp_path(img_record.storage_path, "/tmp/dam_faces")
            if not pathlib.Path(local_img).exists():
                pathlib.Path(local_img).parent.mkdir(parents=True, exist_ok=True)
                download_to_path(img_record.storage_path, local_img, settings)
            detect_path = local_img
        else:
            detect_path = img_record.storage_path

        try:
            detections = face_service.detect_faces(detect_path)
        except Exception as e:
            log.error("Face detection model error for %s: %s — skipping face detection", image_id, e)
            db.add(ProcessingLog(
                image_id=image_id, stage="face_detection", status="skipped",
                error_detail=str(e), duration_ms=int(time.time() * 1000) - start_ms
            ))
            img_record.upload_status = "completed"
            db.commit()
            from app.tasks.embedding_tasks import index_image
            index_image.apply_async(args=[image_id], queue="embedding")
            return

        if not detections:
            # No face — update quality score
            qs = db.query(ImageQualityScore).filter(ImageQualityScore.image_id == image_id).first()
            if qs:
                qs.face_visibility_score = 0.0
                _recompute_overall(qs)
            db.add(ProcessingLog(
                image_id=image_id, stage="face_detection", status="completed",
                output_metadata={"faces_detected": 0},
                duration_ms=int(time.time() * 1000) - start_ms,
            ))
            img_record.upload_status = "completed"
            db.commit()
            # Still index via CLIP
            from app.tasks.embedding_tasks import index_image
            index_image.apply_async(args=[image_id], queue="embedding")
            return

        # ── Persist detections & run recognition ─────────────────────────────
        primary_face_added = False
        for idx, det in enumerate(detections):
            # Pose degradation check
            pose_flag = abs(det.pose_yaw) > 45 or abs(det.pose_pitch) > 30
            face_vis = 1.0 if not pose_flag else max(0.1, 1.0 - (abs(det.pose_yaw) / 90.0))

            fd = FaceDetection(
                image_id=image_id,
                bbox_x=det.bbox[0],
                bbox_y=det.bbox[1],
                bbox_w=det.bbox[2],
                bbox_h=det.bbox[3],
                detection_confidence=det.detection_confidence,
                embedding_vector=det.embedding.tolist(),
                pose_yaw=det.pose_yaw,
                pose_pitch=det.pose_pitch,
                pose_roll=det.pose_roll,
                landmark_json={"kps": det.landmarks} if det.landmarks else None,
            )
            db.add(fd)
            db.flush()

            # Run recognition
            result = face_service.recognize_face(det.embedding)

            fr = FaceRecognition(
                face_detection_id=fd.id,
                matched_person_id=result.matched_person_id,
                similarity_score=result.similarity_score,
                recognition_method="insightface",
                recognition_status=result.status,
            )
            db.add(fr)

            if result.status == "recognized" and result.matched_person_id:
                # Update image-person link
                existing = db.query(ImagePersonLink).filter(
                    ImagePersonLink.image_id == image_id,
                    ImagePersonLink.person_id == result.matched_person_id,
                ).first()
                if not existing:
                    db.add(ImagePersonLink(
                        image_id=image_id,
                        person_id=result.matched_person_id,
                        primary_face=not primary_face_added,
                    ))
                    primary_face_added = True

            elif result.status in ("low_confidence", "unknown"):
                enqueue_for_review.apply_async(
                    args=[str(fd.id), result.status if result.status != "low_confidence" else "low_confidence"],
                    queue="face",
                )

            # Update quality scores with face data
            qs = db.query(ImageQualityScore).filter(ImageQualityScore.image_id == image_id).first()
            if qs and idx == 0:  # primary face
                qs.face_visibility_score = face_vis * det.detection_confidence
                # Composition score from rule of thirds
                if img_record.width and img_record.height:
                    qs.composition_score = compute_rule_of_thirds_score(
                        det.bbox, img_record.width, img_record.height
                    )
                _recompute_overall(qs)

            # Store unknown face embedding in Qdrant for retrospective matching
            if result.status == "unknown":
                _store_unknown_face_async(str(fd.id), det.embedding.tolist())

        db.add(ProcessingLog(
            image_id=image_id,
            stage="face_detection",
            status="completed",
            output_metadata={"faces_detected": len(detections)},
            duration_ms=int(time.time() * 1000) - start_ms,
        ))
        img_record.upload_status = "completed"
        db.commit()

        # Continue pipeline — variants are generated on-demand only
        from app.tasks.embedding_tasks import index_image
        index_image.apply_async(args=[image_id], queue="embedding")

    except Exception as e:
        try:
            img_rec = db.query(Image).filter(Image.id == image_id).first()
            if img_rec:
                img_rec.upload_status = "failed"
            db.add(ProcessingLog(
                image_id=image_id, stage="face_detection", status="dead_letter",
                error_detail=str(e), duration_ms=int(time.time() * 1000) - start_ms,
            ))
            db.commit()
        except Exception:
            pass
        raise
    finally:
        db.close()


def _recompute_overall(qs) -> None:
    qs.overall_score = round(
        0.30 * (qs.sharpness_score or 0.0)
        + 0.20 * (qs.brightness_score or 0.0)
        + 0.20 * (qs.face_visibility_score or 0.0)
        + 0.15 * (qs.contrast_score or 0.0)
        + 0.15 * (qs.composition_score or 0.0),
        4,
    )


def _store_unknown_face_async(face_id: str, embedding: list) -> None:
    """Fire-and-forget: store unknown face in Qdrant for retrospective matching."""
    import threading

    def _store():
        try:
            import asyncio
            from app.config import get_settings
            settings = get_settings()
            from app.services.qdrant_service import upsert_unknown_face

            async def _do():
                client = _make_qdrant_client(settings)
                await upsert_unknown_face(
                    client, face_id, embedding, {"face_id": face_id}, settings
                )
                await client.close()

            asyncio.run(_do())
        except Exception as ex:
            log.warning("Failed to store unknown face in Qdrant: %s", ex)

    threading.Thread(target=_store, daemon=True).start()


@celery_app.task(name="app.tasks.face_tasks.enqueue_for_review")
def enqueue_for_review(face_detection_id: str, reason: str):
    """Create a review_queue record for a face detection."""
    from app.models.job_models import ReviewQueue

    db = _get_db_session()
    try:
        # Avoid duplicates
        existing = db.query(ReviewQueue).filter(
            ReviewQueue.face_detection_id == face_detection_id,
            ReviewQueue.status.in_(["pending", "in_review"]),
        ).first()
        if not existing:
            db.add(ReviewQueue(face_detection_id=face_detection_id, reason=reason))
            db.commit()
    finally:
        db.close()


@celery_app.task(name="app.tasks.face_tasks.retrospective_match")
def retrospective_match(person_id: str):
    """
    Search unknown_faces Qdrant collection for faces similar to a newly added person.
    Creates review_queue items for high-similarity matches.
    """
    import asyncio
    from app.config import get_settings
    from app.models.person_models import Person

    settings = get_settings()
    db = _get_db_session()
    try:
        person = db.query(Person).filter(Person.id == person_id).first()
        if not person or not person.face_embedding:
            return

        import numpy as np
        from app.services.qdrant_service import search_unknown_faces

        embedding = np.array(person.face_embedding, dtype=np.float32)

        async def _search():
            client = _make_qdrant_client(settings)
            try:
                return await search_unknown_faces(
                    client, embedding.tolist(), settings.confidence_face_threshold, 50, settings
                )
            finally:
                await client.close()

        matches = asyncio.run(_search())
        for match in matches:
            face_id = match.payload.get("face_id")
            if face_id:
                enqueue_for_review.apply_async(
                    args=[face_id, "retrospective_match"],
                    queue="face",
                )
        log.info("Retrospective match complete: person_id=%s matches=%d", person_id, len(matches))

    finally:
        db.close()


@celery_app.task(name="app.tasks.face_tasks.process_reference_photo", bind=True)
def process_reference_photo(self, person_id: str, image_bytes_hex: str):
    """
    Detect a face in a reference photo and store the embedding on the Person row.
    Called by the API via Celery so that InsightFace/cv2 never loads on Render.
    """
    import os
    import tempfile
    import numpy as np
    from app.config import get_settings
    from app.models.person_models import Person
    from app.services.face_service import detect_faces, refresh_person_embeddings

    settings = get_settings()
    db = _get_db_session()
    try:
        image_bytes = bytes.fromhex(image_bytes_hex)
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
            tmp.write(image_bytes)
            tmp_path = tmp.name

        try:
            faces = detect_faces(tmp_path)
        finally:
            os.unlink(tmp_path)

        if not faces:
            log.warning("No face detected in reference photo for person %s", person_id)
            return {"status": "error", "detail": "No face detected"}

        best_face = max(faces, key=lambda f: f.detection_confidence)
        embedding = best_face.embedding.tolist()

        person = db.query(Person).filter(Person.id == person_id).first()
        if not person:
            return {"status": "error", "detail": "Person not found"}

        person.face_embedding = embedding
        db.commit()

        refresh_person_embeddings()

        log.info("Reference photo processed: person_id=%s confidence=%.3f", person_id, best_face.detection_confidence)
        return {
            "status": "ok",
            "person_id": person_id,
            "detection_confidence": best_face.detection_confidence,
            "faces_detected": len(faces),
        }

    except Exception as exc:
        log.error("process_reference_photo failed: person_id=%s error=%s", person_id, exc)
        raise self.retry(exc=exc, countdown=5, max_retries=2)
    finally:
        db.close()
