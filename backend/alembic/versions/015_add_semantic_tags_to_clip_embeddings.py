"""Add semantic_tags column to clip_embeddings

Revision ID: 015
Revises: 014
Create Date: 2024-01-01 00:00:15
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "015"
down_revision = "014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "clip_embeddings",
        sa.Column("semantic_tags", postgresql.JSONB(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("clip_embeddings", "semantic_tags")
