"""add receipt processing lifecycle

Revision ID: 20260705_0003
Revises: 20260705_0002
Create Date: 2026-07-05 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260705_0003"
down_revision: str | None = "20260705_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "receipts",
        sa.Column(
            "processing_status",
            sa.String(length=32),
            nullable=False,
            server_default="uploaded",
        ),
    )
    op.add_column(
        "receipts",
        sa.Column("processing_started_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "receipts",
        sa.Column("processing_finished_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "receipts",
        sa.Column("processing_error", sa.String(length=1024), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("receipts", "processing_error")
    op.drop_column("receipts", "processing_finished_at")
    op.drop_column("receipts", "processing_started_at")
    op.drop_column("receipts", "processing_status")
