"""Create face_detections table

Revision ID: 007
Revises: 006
Create Date: 2024-01-01 00:00:07
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "face_detections",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("image_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("images.id", ondelete="CASCADE"), nullable=False),
        sa.Column("bbox_x", sa.Integer(), nullable=False),
        sa.Column("bbox_y", sa.Integer(), nullable=False),
        sa.Column("bbox_w", sa.Integer(), nullable=False),
        sa.Column("bbox_h", sa.Integer(), nullable=False),
        sa.Column("detection_confidence", sa.Float(), nullable=False),
        sa.Column("embedding_vector", postgresql.JSONB(), nullable=True),  # raw 512-d vector for traceability
        sa.Column("pose_yaw", sa.Float(), nullable=True),
        sa.Column("pose_pitch", sa.Float(), nullable=True),
        sa.Column("pose_roll", sa.Float(), nullable=True),
        sa.Column("landmark_json", postgresql.JSONB(), nullable=True),
        sa.Column("detected_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_face_detections_image_id", "face_detections", ["image_id"])


def downgrade() -> None:
    op.drop_index("ix_face_detections_image_id", "face_detections")
    op.drop_table("face_detections")
