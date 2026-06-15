"""Create organizations table

Revision ID: 002
Revises: 001
Create Date: 2024-01-01 00:00:02
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "organizations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.Text(), nullable=False, unique=True),
        sa.Column("entity_type", sa.Text(), nullable=True),  # e.g., "Media", "Government", "Corporate"
        sa.Column(
            "parent_organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_organizations_name", "organizations", ["name"])


def downgrade() -> None:
    op.drop_index("ix_organizations_name", "organizations")
    op.drop_table("organizations")
