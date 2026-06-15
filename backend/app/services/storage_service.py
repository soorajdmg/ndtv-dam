"""
Storage service — abstraction over local disk and Cloudflare R2 (S3-compatible).

When R2 credentials are present (r2_endpoint, r2_access_key_id,
r2_secret_access_key, r2_bucket_name all set), every read/write goes through R2.
Otherwise, falls back to local filesystem — preserving existing local dev behaviour.

Public API
----------
upload_file(local_path_or_bytes, key)  -> storage key (str)
download_file(key)                     -> bytes
get_public_url(key)                    -> str  (presigned URL or public URL)
file_exists(key)                       -> bool
delete_file(key)                       -> None
"""
import io
import logging
import os
from pathlib import Path
from typing import Union

log = logging.getLogger(__name__)


def _get_s3_client(settings):
    """Return a boto3 S3 client configured for R2."""
    import boto3  # imported lazily so local installs without boto3 still work

    return boto3.client(
        "s3",
        endpoint_url=settings.r2_endpoint,
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        region_name="auto",  # R2 accepts "auto"
    )


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------

def upload_file(source: Union[str, bytes, Path], key: str, settings) -> str:
    """
    Upload a file to R2 or local disk.

    Parameters
    ----------
    source : str | Path | bytes
        Either a local filesystem path or raw bytes.
    key : str
        The destination storage key (relative path / object name).
    settings : Settings

    Returns
    -------
    str
        The storage key (same value as ``key``).
    """
    if settings.use_r2:
        s3 = _get_s3_client(settings)
        if isinstance(source, (str, Path)):
            s3.upload_file(str(source), settings.r2_bucket_name, key)
        else:
            s3.upload_fileobj(io.BytesIO(source), settings.r2_bucket_name, key)
        log.info("Uploaded to R2: %s", key)
    else:
        # Local fallback: write bytes/copy file into upload_dir tree
        dest = Path(settings.upload_dir) / key
        dest.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(source, (str, Path)):
            import shutil
            shutil.copy2(str(source), str(dest))
        else:
            dest.write_bytes(source)
        log.debug("Saved locally: %s", dest)

    return key


# ---------------------------------------------------------------------------
# Download
# ---------------------------------------------------------------------------

def download_file(key: str, settings) -> bytes:
    """
    Download a file from R2 or local disk and return its raw bytes.
    """
    if settings.use_r2:
        s3 = _get_s3_client(settings)
        buf = io.BytesIO()
        s3.download_fileobj(settings.r2_bucket_name, key, buf)
        return buf.getvalue()
    else:
        local_path = Path(settings.upload_dir) / key
        return local_path.read_bytes()


def download_to_path(key: str, dest_path: str, settings) -> None:
    """
    Download a file from R2 (or local disk) and save it to ``dest_path``.
    Useful when a Celery task needs a local file to hand off to PIL / cv2.
    """
    if settings.use_r2:
        s3 = _get_s3_client(settings)
        Path(dest_path).parent.mkdir(parents=True, exist_ok=True)
        s3.download_file(settings.r2_bucket_name, key, dest_path)
    else:
        import shutil
        src = Path(settings.upload_dir) / key
        shutil.copy2(str(src), dest_path)


# ---------------------------------------------------------------------------
# URL generation
# ---------------------------------------------------------------------------

def get_public_url(key: str, settings, expires_in: int = 3600) -> str:
    """
    Return a URL that can be used to retrieve the file.

    - If r2_public_url is set: returns a direct public URL (no expiry).
    - If R2 is configured but no public URL: returns a presigned URL.
    - Local fallback: returns a path relative to the backend API base URL.
    """
    if settings.use_r2:
        if settings.r2_public_url:
            base = settings.r2_public_url.rstrip("/")
            return f"{base}/{key}"
        # Generate presigned URL
        s3 = _get_s3_client(settings)
        url = s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.r2_bucket_name, "Key": key},
            ExpiresIn=expires_in,
        )
        return url
    else:
        # Local: return a relative API path that the asset_router already serves
        return f"/api/storage/{key}"


# ---------------------------------------------------------------------------
# Existence check
# ---------------------------------------------------------------------------

def file_exists(key: str, settings) -> bool:
    """Return True if the file exists in R2 / local disk."""
    if settings.use_r2:
        import botocore.exceptions
        s3 = _get_s3_client(settings)
        try:
            s3.head_object(Bucket=settings.r2_bucket_name, Key=key)
            return True
        except botocore.exceptions.ClientError:
            return False
    else:
        return (Path(settings.upload_dir) / key).exists()


# ---------------------------------------------------------------------------
# Deletion
# ---------------------------------------------------------------------------

def delete_file(key: str, settings) -> None:
    """Delete a file from R2 or local disk. Silently ignores missing files."""
    if settings.use_r2:
        s3 = _get_s3_client(settings)
        try:
            s3.delete_object(Bucket=settings.r2_bucket_name, Key=key)
            log.info("Deleted from R2: %s", key)
        except Exception as e:
            log.warning("R2 delete failed for %s: %s", key, e)
    else:
        path = Path(settings.upload_dir) / key
        try:
            path.unlink()
        except FileNotFoundError:
            pass


# ---------------------------------------------------------------------------
# Key helpers
# ---------------------------------------------------------------------------

def local_path_to_key(storage_path: str, settings) -> str:
    """
    Convert an absolute local storage_path (as stored in the DB) to a storage key.

    For local paths like ``/data/uploads/batch-uuid/image-uuid.jpg`` the key is
    ``batch-uuid/image-uuid.jpg`` (everything after upload_dir/).

    When migrating to R2 this function lets existing DB records keep working
    without a data migration — just pass the storage_path and we strip the prefix.
    """
    upload_dir = str(Path(settings.upload_dir))
    path_str = str(storage_path)
    if path_str.startswith(upload_dir):
        rel = path_str[len(upload_dir):]
        return rel.lstrip("/\\")
    # Already a key (no prefix)
    return path_str


def key_to_local_tmp_path(key: str, tmp_dir: str = "/tmp/dam_worker") -> str:
    """
    Return a deterministic local path for a given key, inside tmp_dir.
    Used by Celery workers to materialise R2 files before passing to PIL / cv2.
    """
    safe_key = key.replace("/", "_").replace("\\", "_")
    return str(Path(tmp_dir) / safe_key)
