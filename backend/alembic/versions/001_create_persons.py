"""Create persons table

Revision ID: 001
Revises:
Create Date: 2024-01-01 00:00:01
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "persons",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("full_name", sa.Text(), nullable=False),
        sa.Column("aliases", postgresql.ARRAY(sa.Text()), nullable=False, server_default="{}"),
        sa.Column("designation", sa.Text(), nullable=True),
        sa.Column("organization", sa.Text(), nullable=True),
        sa.Column("category", sa.Text(), nullable=True),  # Government, Analyst, Businessperson, NDTV Staff
        sa.Column("face_embedding", postgresql.JSONB(), nullable=True),  # reference embedding vector
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), onupdate=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_persons_full_name", "persons", ["full_name"])
    op.create_index("ix_persons_deleted_at", "persons", ["deleted_at"])


def downgrade() -> None:
    op.drop_index("ix_persons_deleted_at", "persons")
    op.drop_index("ix_persons_full_name", "persons")
    op.drop_table("persons")
