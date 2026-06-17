import uuid

from sqlalchemy import Boolean, Column, Text, TIMESTAMP, text
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    email = Column(Text, unique=True, nullable=False, index=True)
    full_name = Column(Text, nullable=False)
    hashed_password = Column(Text, nullable=True)  # NULL for OAuth-only users
    is_active = Column(Boolean, nullable=False, default=True)
    is_admin = Column(Boolean, nullable=False, default=False)
    created_at = Column(TIMESTAMP(timezone=True), server_default=text("now()"), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), server_default=text("now()"), nullable=False)
