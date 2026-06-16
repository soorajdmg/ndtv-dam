import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Enum, ForeignKey, Integer, Text, TIMESTAMP, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ProcessingLog(Base):
    __tablename__ = "processing_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    image_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("images.id", ondelete="SET NULL"), nullable=True)
    batch_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("upload_batches.id", ondelete="SET NULL"), nullable=True)
    stage: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False)  # started | completed | failed | skipped | dead_letter
    input_metadata: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    output_metadata: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    error_detail: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    duration_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)


class ShortlistedImage(Base):
    __tablename__ = "shortlisted_images"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    batch_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("upload_batches.id", ondelete="CASCADE"), nullable=False)
    image_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("images.id", ondelete="CASCADE"), nullable=False)
    rank: Mapped[int] = mapped_column(Integer, nullable=False)
    selection_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    selected_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    batch: Mapped["UploadBatch"] = relationship(back_populates="shortlisted_images")  # type: ignore[name-defined]
    image: Mapped["Image"] = relationship()  # type: ignore[name-defined]


class ReviewQueue(Base):
    __tablename__ = "review_queue"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    face_detection_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("face_detections.id", ondelete="CASCADE"), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)  # low_confidence | unknown_face | pose_issue | manual_flag
    status: Mapped[str] = mapped_column(
        Enum("pending", "in_review", "resolved", name="review_status_enum"),
        nullable=False,
        default="pending",
    )
    assigned_to: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    resolution_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)

    face_detection: Mapped["FaceDetection"] = relationship(back_populates="review_items")  # type: ignore[name-defined]


