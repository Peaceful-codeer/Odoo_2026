"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-07-12
"""
from alembic import op
from app.models import Base

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None

# Ordered table list (FK-safe)
_TABLES = [
    "organizations", "asset_categories", "departments", "settings", "assets",
    "users", "activity_logs", "allocations", "asset_documents", "audit_cycles",
    "bookings", "maintenance_requests", "notifications", "password_reset_tokens",
    "transfer_requests", "audit_items",
]


def upgrade():
    bind = op.get_bind()
    # btree_gist required for the exclusion constraint mixing = and &&
    op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")
    Base.metadata.create_all(bind=bind)
    # DB-level overlap prevention for shared-resource bookings
    op.execute(
        """
        ALTER TABLE bookings ADD CONSTRAINT no_overlapping_bookings
        EXCLUDE USING gist (
            asset_id WITH =,
            tstzrange(start_time, end_time) WITH &&
        ) WHERE (status <> 'CANCELLED')
        """
    )


def downgrade():
    op.execute("ALTER TABLE bookings DROP CONSTRAINT IF EXISTS no_overlapping_bookings")
    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind)
