"""Create processing_logs table

Revision ID: 012
Revises: 011
Create Date: 2024-01-01 00:00:12
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "012"
down_revision = "011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "processing_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("image_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("images.id", ondelete="SET NULL"), nullable=True),
        sa.Column("batch_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("upload_batches.id", ondelete="SET NULL"), nullable=True),
        sa.Column("stage", sa.Text(), nullable=False),  # face_detection, face_recognition, clip_embedding, variant_generation, quality_scoring, duplicate_check
        sa.Column("status", sa.Text(), nullable=False),  # started, completed, failed, skipped, dead_letter
        sa.Column("input_metadata", postgresql.JSONB(), nullable=True),
        sa.Column("output_metadata", postgresql.JSONB(), nullable=True),
        sa.Column("error_detail", sa.Text(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_processing_logs_image_stage", "processing_logs", ["image_id", "stage"])
    op.create_index("ix_processing_logs_batch_id", "processing_logs", ["batch_id"])
    op.create_index("ix_processing_logs_status", "processing_logs", ["status"])


def downgrade() -> None:
    op.drop_index("ix_processing_logs_status", "processing_logs")
    op.drop_index("ix_processing_logs_batch_id", "processing_logs")
    op.drop_index("ix_processing_logs_image_stage", "processing_logs")
    op.drop_table("processing_logs")
