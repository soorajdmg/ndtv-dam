"""Create image_person_links table

Revision ID: 009
Revises: 008
Create Date: 2024-01-01 00:00:09
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "image_person_links",
        sa.Column("image_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("images.id", ondelete="CASCADE"), nullable=False),
        sa.Column("person_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("persons.id", ondelete="CASCADE"), nullable=False),
        sa.Column("primary_face", sa.Boolean(), nullable=False, server_default="false"),
        sa.PrimaryKeyConstraint("image_id", "person_id", name="pk_image_person_link"),
    )
    op.create_index("ix_image_person_links_image_id", "image_person_links", ["image_id"])
    op.create_index("ix_image_person_links_person_id", "image_person_links", ["person_id"])


def downgrade() -> None:
    op.drop_index("ix_image_person_links_person_id", "image_person_links")
    op.drop_index("ix_image_person_links_image_id", "image_person_links")
    op.drop_table("image_person_links")
