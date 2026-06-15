"""Create image_quality_scores table

Revision ID: 006
Revises: 005
Create Date: 2024-01-01 00:00:06
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "image_quality_scores",
        sa.Column("image_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("images.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("sharpness_score", sa.Float(), nullable=True),
        sa.Column("brightness_score", sa.Float(), nullable=True),
        sa.Column("contrast_score", sa.Float(), nullable=True),
        sa.Column("face_visibility_score", sa.Float(), nullable=True),
        sa.Column("composition_score", sa.Float(), nullable=True),
        sa.Column("overall_score", sa.Float(), nullable=True),
        sa.Column("is_approved_for_variants", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("computed_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_quality_scores_overall", "image_quality_scores", ["overall_score"])


def downgrade() -> None:
    op.drop_index("ix_quality_scores_overall", "image_quality_scores")
    op.drop_table("image_quality_scores")
