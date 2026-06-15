"""Create clip_embeddings table

Revision ID: 011
Revises: 010
Create Date: 2024-01-01 00:00:11
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "clip_embeddings",
        sa.Column("image_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("images.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("model_name", sa.Text(), nullable=False),
        sa.Column("embedding_vector", postgresql.JSONB(), nullable=True),  # backup store alongside Qdrant
        sa.Column("indexed_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("clip_embeddings")
