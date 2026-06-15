"""Create review_queue table

Revision ID: 014
Revises: 013
Create Date: 2024-01-01 00:00:14
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None

review_status_enum = postgresql.ENUM(
    "pending", "in_review", "resolved",
    name="review_status_enum",
    create_type=False,
)


def upgrade() -> None:
    op.execute("CREATE TYPE review_status_enum AS ENUM ('pending', 'in_review', 'resolved')")
    op.create_table(
        "review_queue",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("face_detection_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("face_detections.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),  # low_confidence | unknown_face | pose_issue | manual_flag
        sa.Column("status", review_status_enum, nullable=False, server_default="pending"),
        sa.Column("assigned_to", sa.Text(), nullable=True),
        sa.Column("resolution_notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("resolved_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )
    op.create_index("ix_review_queue_status", "review_queue", ["status"])
    op.create_index("ix_review_queue_detection_id", "review_queue", ["face_detection_id"])


def downgrade() -> None:
    op.drop_index("ix_review_queue_detection_id", "review_queue")
    op.drop_index("ix_review_queue_status", "review_queue")
    op.drop_table("review_queue")
    op.execute("DROP TYPE IF EXISTS review_status_enum")
