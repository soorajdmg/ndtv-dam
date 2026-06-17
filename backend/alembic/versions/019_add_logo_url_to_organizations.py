"""Add logo_url to organizations table

Revision ID: 019
Revises: 018
Create Date: 2024-01-01 00:00:19
"""
from alembic import op
import sqlalchemy as sa

revision = "019"
down_revision = "018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("organizations", sa.Column("logo_url", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("organizations", "logo_url")
