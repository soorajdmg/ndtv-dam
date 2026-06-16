from functools import lru_cache
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=["../.env", ".env"], env_file_encoding="utf-8", extra="ignore")

    # Database
    database_url: str = "postgresql+asyncpg://ndtv:ndtvpass@localhost:5432/ndtv_dam"

    # Qdrant
    qdrant_host: str = "localhost"
    qdrant_port: int = 6333
    qdrant_api_key: Optional[str] = None  # Required for Qdrant Cloud
    qdrant_use_https: bool = False         # Set True for Qdrant Cloud

    # Redis / Celery
    redis_url: str = "redis://localhost:6379/0"

    # File Storage (local fallback when R2 not configured)
    # Defaults to /tmp/dam_uploads so it works on Render's ephemeral filesystem.
    upload_dir: str = "/tmp/dam_uploads"

    # Cloudflare R2 / S3-compatible storage
    r2_endpoint: Optional[str] = None         # e.g. https://<account-id>.r2.cloudflarestorage.com
    r2_access_key_id: Optional[str] = None
    r2_secret_access_key: Optional[str] = None
    r2_bucket_name: Optional[str] = None      # e.g. ndtv-dam-uploads
    r2_public_url: Optional[str] = None       # e.g. https://pub-xxx.r2.dev (if bucket is public)

    # AI Models
    clip_model_name: str = "openai/clip-vit-base-patch32"
    insightface_model: str = "buffalo_l"

    # Face Recognition Thresholds
    confidence_face_threshold: float = 0.45
    confidence_low_threshold: float = 0.35

    # Upload Limits
    max_upload_batch_size: int = 500
    max_file_size_bytes: int = 20 * 1024 * 1024  # 20 MB
    min_image_dimension: int = 200

    # Shortlisting
    shortlist_count: int = 5

    # Quality Scoring Thresholds
    quality_sharpness_min: float = 80.0
    quality_brightness_min: int = 60
    quality_brightness_max: int = 210

    # Asset Variants
    brand_logo_path: str = "/assets/ndtv_profit_logo.png"
    variant_square_size: int = 1000

    # Duplicate Detection
    phash_duplicate_threshold: int = 8

    # Frontend (for CORS)
    frontend_url: str = "http://localhost:3000"
    next_public_api_url: str = "http://localhost:8000"

    # Qdrant collection names
    qdrant_images_collection: str = "images"
    qdrant_unknown_faces_collection: str = "unknown_faces"
    clip_vector_size: int = 512  # clip-vit-base-patch32 outputs 512-dim vectors

    # Postgres user/pass (for compose)
    postgres_user: Optional[str] = None
    postgres_password: Optional[str] = None
    postgres_db: Optional[str] = None

    @property
    def use_r2(self) -> bool:
        """True when all R2 credentials are configured."""
        return bool(self.r2_endpoint and self.r2_access_key_id and self.r2_secret_access_key and self.r2_bucket_name)


@lru_cache
def get_settings() -> Settings:
    return Settings()
