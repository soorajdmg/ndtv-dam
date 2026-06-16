import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, Enum, ForeignKey, Integer, Text, TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class AssetVariant(Base):
    __tablename__ = "asset_variants"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    image_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("images.id", ondelete="CASCADE"), nullable=False)
    variant_type: Mapped[str] = mapped_column(
        Enum("transparent_cutout", "square_gray_bg", "branded_16_9", name="variant_type_enum"),
        nullable=False,
    )
    storage_path: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    width: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    height: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    file_size_bytes: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    generation_status: Mapped[str] = mapped_column(
        Enum("pending", "processing", "completed", "failed", name="variant_gen_status_enum"),
        nullable=False,
        default="pending",
    )
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    generated_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)

    image: Mapped["Image"] = relationship(back_populates="variants")  # type: ignore[name-defined]


