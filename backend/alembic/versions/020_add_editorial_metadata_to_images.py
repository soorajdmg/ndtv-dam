"""Add editorial metadata columns to images table

Revision ID: 020
Revises: 019
Create Date: 2024-01-01 00:00:20
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "020"
down_revision = "019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("images", sa.Column("title", sa.Text(), nullable=True))
    op.add_column("images", sa.Column("caption", sa.Text(), nullable=True))
    op.add_column(
        "images",
        sa.Column(
            "manual_tags",
            postgresql.ARRAY(sa.Text()),
            nullable=False,
            server_default="{}",
        ),
    )


def downgrade() -> None:
    op.drop_column("images", "manual_tags")
    op.drop_column("images", "caption")
    op.drop_column("images", "title")
