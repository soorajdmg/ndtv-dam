import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, Boolean, Enum, Float, ForeignKey, Integer, Text, TIMESTAMP, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class UploadBatch(Base):
    __tablename__ = "upload_batches"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    status: Mapped[str] = mapped_column(
        Enum("pending", "processing", "completed", "failed", "partial_failure", name="batch_status_enum"),
        nullable=False,
        default="pending",
    )
    total_images: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    processed_images: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    failed_images: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    submitted_by: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    completed_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)

    images: Mapped[list["Image"]] = relationship(back_populates="batch", cascade="all, delete-orphan")
    shortlisted_images: Mapped[list["ShortlistedImage"]] = relationship(back_populates="batch", cascade="all, delete-orphan")  # type: ignore[name-defined]


class Image(Base):
    __tablename__ = "images"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    batch_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("upload_batches.id", ondelete="CASCADE"), nullable=False)
    original_filename: Mapped[str] = mapped_column(Text, nullable=False)
    storage_path: Mapped[str] = mapped_column(Text, nullable=False)
    file_hash: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    width: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    height: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    file_size_bytes: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    format: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    upload_status: Mapped[str] = mapped_column(
        Enum("queued", "processing", "completed", "failed", name="upload_status_enum"),
        nullable=False,
        default="queued",
    )
    is_duplicate: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    duplicate_of_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("images.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    batch: Mapped["UploadBatch"] = relationship(back_populates="images")
    quality_score: Mapped[Optional["ImageQualityScore"]] = relationship(back_populates="image", uselist=False, cascade="all, delete-orphan")
    face_detections: Mapped[list["FaceDetection"]] = relationship(back_populates="image", cascade="all, delete-orphan")  # type: ignore[name-defined]
    person_links: Mapped[list["ImagePersonLink"]] = relationship(back_populates="image", cascade="all, delete-orphan")
    variants: Mapped[list["AssetVariant"]] = relationship(back_populates="image", cascade="all, delete-orphan")  # type: ignore[name-defined]
    clip_embedding: Mapped[Optional["ClipEmbedding"]] = relationship(back_populates="image", uselist=False, cascade="all, delete-orphan")  # type: ignore[name-defined]


class ImageQualityScore(Base):
    __tablename__ = "image_quality_scores"

    image_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("images.id", ondelete="CASCADE"), primary_key=True)
    sharpness_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    brightness_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    contrast_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    face_visibility_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    composition_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    overall_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    is_approved_for_variants: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    computed_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    image: Mapped["Image"] = relationship(back_populates="quality_score")


class ImagePersonLink(Base):
    __tablename__ = "image_person_links"

    image_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("images.id", ondelete="CASCADE"), primary_key=True)
    person_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("persons.id", ondelete="CASCADE"), primary_key=True)
    primary_face: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    image: Mapped["Image"] = relationship(back_populates="person_links")
    person: Mapped["Person"] = relationship(back_populates="image_links")  # type: ignore[name-defined]


