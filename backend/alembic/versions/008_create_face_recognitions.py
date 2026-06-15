"""Create face_recognitions table

Revision ID: 008
Revises: 007
Create Date: 2024-01-01 00:00:08
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None

recognition_status_enum = postgresql.ENUM(
    "recognized", "unknown", "low_confidence", "rejected",
    name="recognition_status_enum",
    create_type=False,
)


def upgrade() -> None:
    op.execute("CREATE TYPE recognition_status_enum AS ENUM ('recognized', 'unknown', 'low_confidence', 'rejected')")
    op.create_table(
        "face_recognitions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("face_detection_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("face_detections.id", ondelete="CASCADE"), nullable=False),
        sa.Column("matched_person_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("persons.id", ondelete="SET NULL"), nullable=True),
        sa.Column("similarity_score", sa.Float(), nullable=True),
        sa.Column("recognition_method", sa.Text(), nullable=False, server_default="insightface"),  # insightface | manual
        sa.Column("recognition_status", recognition_status_enum, nullable=False),
        sa.Column("reviewed_by", sa.Text(), nullable=True),
        sa.Column("reviewed_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )
    op.create_index("ix_face_recognitions_detection_id", "face_recognitions", ["face_detection_id"])
    op.create_index("ix_face_recognitions_person_id", "face_recognitions", ["matched_person_id"])
    op.create_index("ix_face_recognitions_status", "face_recognitions", ["recognition_status"])


def downgrade() -> None:
    op.drop_index("ix_face_recognitions_status", "face_recognitions")
    op.drop_index("ix_face_recognitions_person_id", "face_recognitions")
    op.drop_index("ix_face_recognitions_detection_id", "face_recognitions")
    op.drop_table("face_recognitions")
    op.execute("DROP TYPE IF EXISTS recognition_status_enum")
