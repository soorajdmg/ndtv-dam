"""Placeholder migration — restores broken revision chain

Revision ID: 019
Revises: 018
Create Date: 2026-06-18

This migration was re-created because the original file was lost while the
database's alembic_version table already recorded revision '020' as the head.
Adding these stubs allows Alembic to locate the full chain and run
'upgrade head' without errors.  The upgrade/downgrade bodies are intentional
no-ops because the schema changes they referenced no longer exist and the
database schema is already in the correct state.
"""
from alembic import op  # noqa: F401 — kept for Alembic discovery

revision = "019"
down_revision = "018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass  # no-op: schema already applied


def downgrade() -> None:
    pass  # no-op
