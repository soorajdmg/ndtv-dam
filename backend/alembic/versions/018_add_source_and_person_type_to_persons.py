"""Add source and person_type columns to persons table

Revision ID: 018
Revises: 017
Create Date: 2026-06-17
"""
from alembic import op
import sqlalchemy as sa

revision = "018"
down_revision = "017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("persons", sa.Column("source", sa.Text(), nullable=True))
    op.add_column("persons", sa.Column("person_type", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("persons", "person_type")
    op.drop_column("persons", "source")
