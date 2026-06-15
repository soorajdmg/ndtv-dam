"""Create images table

Revision ID: 005
Revises: 004
Create Date: 2024-01-01 00:00:05
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None

upload_status_enum = postgresql.ENUM(
    "queued", "processing", "completed", "failed",
    name="upload_status_enum",
    create_type=False,
)


def upgrade() -> None:
    op.execute("CREATE TYPE upload_status_enum AS ENUM ('queued', 'processing', 'completed', 'failed')")
    op.create_table(
        "images",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("batch_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("upload_batches.id", ondelete="CASCADE"), nullable=False),
        sa.Column("original_filename", sa.Text(), nullable=False),
        sa.Column("storage_path", sa.Text(), nullable=False),
        sa.Column("file_hash", sa.Text(), nullable=True),  # format: "{md5}:{phash}"
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("file_size_bytes", sa.BigInteger(), nullable=True),
        sa.Column("format", sa.Text(), nullable=True),
        sa.Column("upload_status", upload_status_enum, nullable=False, server_default="queued"),
        sa.Column("is_duplicate", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("duplicate_of_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("images.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_images_file_hash", "images", ["file_hash"])
    op.create_index("ix_images_batch_id", "images", ["batch_id"])
    op.create_index("ix_images_upload_status", "images", ["upload_status"])


def downgrade() -> None:
    op.drop_index("ix_images_upload_status", "images")
    op.drop_index("ix_images_batch_id", "images")
    op.drop_index("ix_images_file_hash", "images")
    op.drop_table("images")
    op.execute("DROP TYPE IF EXISTS upload_status_enum")
