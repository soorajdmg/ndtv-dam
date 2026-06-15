"""
BiRefNet background removal service.
Falls back gracefully if model is unavailable.
"""
import logging
import threading

log = logging.getLogger(__name__)

# ─── Circuit Breaker ──────────────────────────────────────────────────────────
_birefnet_failures = 0
_birefnet_lock = threading.Lock()
BIREFNET_DEGRADED = False
MAX_CONSECUTIVE_FAILURES = 3

_birefnet_model = None
_model_lock = threading.Lock()


def _record_failure():
    global _birefnet_failures, BIREFNET_DEGRADED
    with _birefnet_lock:
        _birefnet_failures += 1
        if _birefnet_failures >= MAX_CONSECUTIVE_FAILURES:
            BIREFNET_DEGRADED = True
            log.critical("BiRefNet circuit breaker OPEN — background removal suspended")


def _record_success():
    global _birefnet_failures, BIREFNET_DEGRADED
    with _birefnet_lock:
        _birefnet_failures = 0
        BIREFNET_DEGRADED = False


def _load_model():
    global _birefnet_model
    with _model_lock:
        if _birefnet_model is None:
            try:
                # Try to load BiRefNet via transformers (if available)
                from transformers import AutoModelForImageSegmentation
                import torch

                _birefnet_model = AutoModelForImageSegmentation.from_pretrained(
                    "ZhengPeng7/BiRefNet",
                    trust_remote_code=True,
                )
                _birefnet_model.eval()
                log.info("BiRefNet model loaded via transformers")
            except Exception as e:
                log.warning("BiRefNet model not available, will use rembg fallback: %s", e)
                _birefnet_model = "rembg"  # sentinel


def remove_background(image_path: str):
    """
    Remove background from image. Returns RGBA PIL Image.
    Falls back to rembg if BiRefNet is unavailable.
    """
    if BIREFNET_DEGRADED:
        raise RuntimeError("BiRefNet service is degraded")

    _load_model()

    try:
        if _birefnet_model == "rembg":
            # Fallback: use rembg library
            return _rembg_remove(image_path)
        else:
            return _birefnet_remove(image_path)
    except Exception as e:
        _record_failure()
        log.error("Background removal failed for %s: %s", image_path, e)
        raise


def _birefnet_remove(image_path: str):
    """Use BiRefNet transformer model for background removal."""
    import torch
    import numpy as np
    from PIL import Image as PILImage
    from torchvision import transforms
    import torch.nn.functional as F

    img = PILImage.open(image_path).convert("RGB")
    orig_w, orig_h = img.size  # PIL size is (width, height)

    transform = transforms.Compose([
        transforms.Resize((1024, 1024)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ])
    input_tensor = transform(img).unsqueeze(0)

    with torch.no_grad():
        preds = _birefnet_model(input_tensor)[-1].sigmoid().cpu()

    # Resize mask back to original image dimensions: F.interpolate expects (N,C,H,W)
    pred = preds[0].unsqueeze(0)  # shape: (1, 1, 1024, 1024)
    mask_tensor = F.interpolate(pred, size=(orig_h, orig_w), mode="bilinear", align_corners=False)
    mask_np = (mask_tensor.squeeze().numpy() * 255).astype(np.uint8)

    img_rgba = img.convert("RGBA")
    img_rgba.putalpha(PILImage.fromarray(mask_np))
    _record_success()
    return img_rgba


def _rembg_remove(image_path: str):
    """Fallback: use rembg for background removal."""
    try:
        from rembg import remove
        from PIL import Image as PILImage
        import io

        with open(image_path, "rb") as f:
            data = f.read()
        output = remove(data)
        img = PILImage.open(io.BytesIO(output)).convert("RGBA")
        _record_success()
        return img
    except ImportError:
        raise RuntimeError(
            "No background removal backend available. "
            "Install 'rembg' (pip install rembg) or ensure BiRefNet dependencies are installed "
            "(pip install kornia timm einops)."
        )
