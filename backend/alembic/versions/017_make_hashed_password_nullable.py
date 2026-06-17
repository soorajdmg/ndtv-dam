"""Make hashed_password nullable for OAuth users

Revision ID: 017
Revises: 016
Create Date: 2026-06-17
"""
from alembic import op
import sqlalchemy as sa

revision = "017"
down_revision = "016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("users", "hashed_password", nullable=True)


def downgrade() -> None:
    # Fill NULLs with a sentinel so NOT NULL can be restored without a crash.
    # These rows cannot log in via password but the schema will be valid.
    op.execute(
        "UPDATE users SET hashed_password = '__oauth_user__' WHERE hashed_password IS NULL"
    )
    op.alter_column("users", "hashed_password", nullable=False)
