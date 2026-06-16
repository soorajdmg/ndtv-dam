import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Enum, Float, ForeignKey, Integer, Text, TIMESTAMP, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class FaceDetection(Base):
    __tablename__ = "face_detections"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    image_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("images.id", ondelete="CASCADE"), nullable=False)
    bbox_x: Mapped[int] = mapped_column(Integer, nullable=False)
    bbox_y: Mapped[int] = mapped_column(Integer, nullable=False)
    bbox_w: Mapped[int] = mapped_column(Integer, nullable=False)
    bbox_h: Mapped[int] = mapped_column(Integer, nullable=False)
    detection_confidence: Mapped[float] = mapped_column(Float, nullable=False)
    embedding_vector: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    pose_yaw: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    pose_pitch: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    pose_roll: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    landmark_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    detected_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    image: Mapped["Image"] = relationship(back_populates="face_detections")  # type: ignore[name-defined]
    recognitions: Mapped[list["FaceRecognition"]] = relationship(back_populates="face_detection", cascade="all, delete-orphan")
    review_items: Mapped[list["ReviewQueue"]] = relationship(back_populates="face_detection", cascade="all, delete-orphan")  # type: ignore[name-defined]


class FaceRecognition(Base):
    __tablename__ = "face_recognitions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    face_detection_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("face_detections.id", ondelete="CASCADE"), nullable=False)
    matched_person_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("persons.id", ondelete="SET NULL"), nullable=True
    )
    similarity_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    recognition_method: Mapped[str] = mapped_column(Text, nullable=False, default="insightface")
    recognition_status: Mapped[str] = mapped_column(
        Enum("recognized", "unknown", "low_confidence", "rejected", name="recognition_status_enum"),
        nullable=False,
    )
    reviewed_by: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)

    face_detection: Mapped["FaceDetection"] = relationship(back_populates="recognitions")
    matched_person: Mapped[Optional["Person"]] = relationship()  # type: ignore[name-defined]


