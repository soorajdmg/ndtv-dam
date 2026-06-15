"""Create shortlisted_images table

Revision ID: 013
Revises: 012
Create Date: 2024-01-01 00:00:13
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "shortlisted_images",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("batch_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("upload_batches.id", ondelete="CASCADE"), nullable=False),
        sa.Column("image_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("images.id", ondelete="CASCADE"), nullable=False),
        sa.Column("rank", sa.Integer(), nullable=False),
        sa.Column("selection_reason", sa.Text(), nullable=True),
        sa.Column("selected_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_shortlisted_images_batch_id", "shortlisted_images", ["batch_id"])


def downgrade() -> None:
    op.drop_index("ix_shortlisted_images_batch_id", "shortlisted_images")
    op.drop_table("shortlisted_images")
