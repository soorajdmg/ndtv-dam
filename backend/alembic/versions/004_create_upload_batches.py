"""Create upload_batches table

Revision ID: 004
Revises: 003
Create Date: 2024-01-01 00:00:04
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None

batch_status = postgresql.ENUM(
    "pending", "processing", "completed", "failed", "partial_failure",
    name="batch_status_enum",
    create_type=False,
)


def upgrade() -> None:
    op.execute("CREATE TYPE batch_status_enum AS ENUM ('pending', 'processing', 'completed', 'failed', 'partial_failure')")
    op.create_table(
        "upload_batches",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("status", batch_status, nullable=False, server_default="pending"),
        sa.Column("total_images", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("processed_images", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failed_images", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("submitted_by", sa.Text(), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("completed_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )
    op.create_index("ix_upload_batches_status", "upload_batches", ["status"])
    op.create_index("ix_upload_batches_created_at", "upload_batches", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_upload_batches_created_at", "upload_batches")
    op.drop_index("ix_upload_batches_status", "upload_batches")
    op.drop_table("upload_batches")
    op.execute("DROP TYPE IF EXISTS batch_status_enum")
