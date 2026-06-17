import uuid
from datetime import datetime, date
from typing import Optional

from sqlalchemy import Boolean, Date, ForeignKey, Text, TIMESTAMP, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Person(Base):
    __tablename__ = "persons"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    full_name: Mapped[str] = mapped_column(Text, nullable=False)
    aliases: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, default=list)
    designation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    organization: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    category: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source: Mapped[Optional[str]] = mapped_column(Text, nullable=True)       # NDTV | NDTV Profit | ANI | Reuters | PTI
    person_type: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # Govt | Business | Market | NDTV | Others
    face_embedding: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    organization_links: Mapped[list["PersonOrganizationLink"]] = relationship(back_populates="person", cascade="all, delete-orphan")
    image_links: Mapped[list["ImagePersonLink"]] = relationship(back_populates="person", cascade="all, delete-orphan")  # type: ignore[name-defined]


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    entity_type: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    parent_organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    # Self-referential relationship
    children: Mapped[list["Organization"]] = relationship("Organization", back_populates="parent", foreign_keys=[parent_organization_id])
    parent: Mapped[Optional["Organization"]] = relationship("Organization", back_populates="children", remote_side=[id])
    person_links: Mapped[list["PersonOrganizationLink"]] = relationship(back_populates="organization")


class PersonOrganizationLink(Base):
    __tablename__ = "person_organization_links"

    person_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("persons.id", ondelete="CASCADE"), primary_key=True)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), primary_key=True)
    designation: Mapped[Optional[str]] = mapped_column(Text, nullable=True, primary_key=True)
    valid_from: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    valid_to: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    person: Mapped["Person"] = relationship(back_populates="organization_links")
    organization: Mapped["Organization"] = relationship(back_populates="person_links")
