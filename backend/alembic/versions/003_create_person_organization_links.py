"""Create person_organization_links table

Revision ID: 003
Revises: 002
Create Date: 2024-01-01 00:00:03
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "person_organization_links",
        sa.Column("person_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("persons.id", ondelete="CASCADE"), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("designation", sa.Text(), nullable=True),
        sa.Column("valid_from", sa.Date(), nullable=True),
        sa.Column("valid_to", sa.Date(), nullable=True),
        sa.PrimaryKeyConstraint("person_id", "organization_id", "designation", name="pk_person_org_link"),
    )


def downgrade() -> None:
    op.drop_table("person_organization_links")
