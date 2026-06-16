import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import ForeignKey, Text, TIMESTAMP, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ClipEmbedding(Base):
    __tablename__ = "clip_embeddings"

    image_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("images.id", ondelete="CASCADE"), primary_key=True)
    model_name: Mapped[str] = mapped_column(Text, nullable=False)
    embedding_vector: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    semantic_tags: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    indexed_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    image: Mapped["Image"] = relationship(back_populates="clip_embedding")  # type: ignore[name-defined]


