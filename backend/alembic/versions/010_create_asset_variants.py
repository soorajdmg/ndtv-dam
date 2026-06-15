"""Create asset_variants table

Revision ID: 010
Revises: 009
Create Date: 2024-01-01 00:00:10
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None

variant_type_enum = postgresql.ENUM(
    "transparent_cutout", "square_gray_bg", "branded_16_9",
    name="variant_type_enum",
    create_type=False,
)
variant_gen_status_enum = postgresql.ENUM(
    "pending", "processing", "completed", "failed",
    name="variant_gen_status_enum",
    create_type=False,
)


def upgrade() -> None:
    op.execute("CREATE TYPE variant_type_enum AS ENUM ('transparent_cutout', 'square_gray_bg', 'branded_16_9')")
    op.execute("CREATE TYPE variant_gen_status_enum AS ENUM ('pending', 'processing', 'completed', 'failed')")
    op.create_table(
        "asset_variants",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("image_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("images.id", ondelete="CASCADE"), nullable=False),
        sa.Column("variant_type", variant_type_enum, nullable=False),
        sa.Column("storage_path", sa.Text(), nullable=True),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("file_size_bytes", sa.BigInteger(), nullable=True),
        sa.Column("generation_status", variant_gen_status_enum, nullable=False, server_default="pending"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("generated_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )
    op.create_index("ix_asset_variants_image_id", "asset_variants", ["image_id"])


def downgrade() -> None:
    op.drop_index("ix_asset_variants_image_id", "asset_variants")
    op.drop_table("asset_variants")
    op.execute("DROP TYPE IF EXISTS variant_gen_status_enum")
    op.execute("DROP TYPE IF EXISTS variant_type_enum")
