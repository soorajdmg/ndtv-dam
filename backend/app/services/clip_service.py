"""
CLIP model service: singleton model for image and text encoding.
"""
import logging
import threading
from pathlib import Path

import numpy as np

log = logging.getLogger(__name__)

_clip_model = None
_clip_processor = None
_clip_lock = threading.Lock()
_clip_failed = False


def _load_clip():
    global _clip_model, _clip_processor, _clip_failed
    with _clip_lock:
        if _clip_model is None and not _clip_failed:
            try:
                import torch
                from transformers import CLIPModel, CLIPProcessor
                from app.config import get_settings
                settings = get_settings()

                log.info("Loading CLIP model: %s", settings.clip_model_name)
                _clip_processor = CLIPProcessor.from_pretrained(settings.clip_model_name)
                _clip_model = CLIPModel.from_pretrained(settings.clip_model_name)
                _clip_model.eval()
                log.info("CLIP model loaded successfully")
            except Exception as e:
                _clip_failed = True
                log.error("Failed to load CLIP model: %s", e)
                raise


class ClipService:
    def encode_image(self, image_path: str) -> np.ndarray:
        """Encode an image to a normalized CLIP embedding."""
        _load_clip()
        if _clip_failed:
            raise RuntimeError("CLIP model failed to load")

        import torch
        from PIL import Image as PILImage

        try:
            img = PILImage.open(image_path).convert("RGB")
            inputs = _clip_processor(images=img, return_tensors="pt")
            with torch.no_grad():
                features = _clip_model.get_image_features(**inputs)
            embedding = features[0].numpy()
            embedding = embedding / np.linalg.norm(embedding)
            return embedding
        except Exception as e:
            log.error("CLIP image encoding failed for %s: %s", image_path, e)
            raise

    def encode_text(self, text: str) -> np.ndarray:
        """Encode a text query to a normalized CLIP embedding."""
        _load_clip()
        if _clip_failed:
            raise RuntimeError("CLIP model failed to load")

        import torch

        try:
            inputs = _clip_processor(text=[text], return_tensors="pt", padding=True, truncation=True)
            with torch.no_grad():
                features = _clip_model.get_text_features(**inputs)
            embedding = features[0].numpy()
            embedding = embedding / np.linalg.norm(embedding)
            return embedding
        except Exception as e:
            log.error("CLIP text encoding failed for '%s': %s", text, e)
            raise


_clip_service: ClipService | None = None
_clip_service_lock = threading.Lock()


def get_clip_service() -> ClipService:
    global _clip_service
    if _clip_service is None:
        with _clip_service_lock:
            if _clip_service is None:
                _clip_service = ClipService()
    return _clip_service
