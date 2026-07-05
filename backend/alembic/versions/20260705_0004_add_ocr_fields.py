"""add receipt ocr fields

Revision ID: 20260705_0004
Revises: 20260705_0003
Create Date: 2026-07-05 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260705_0004"
down_revision: str | None = "20260705_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "receipts",
        sa.Column(
            "ocr_status",
            sa.String(length=32),
            nullable=False,
            server_default="pending",
        ),
    )
    op.add_column(
        "receipts",
        sa.Column("ocr_started_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "receipts",
        sa.Column("ocr_finished_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "receipts",
        sa.Column("ocr_error", sa.String(length=1024), nullable=True),
    )
    op.add_column("receipts", sa.Column("ocr_text", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("receipts", "ocr_text")
    op.drop_column("receipts", "ocr_error")
    op.drop_column("receipts", "ocr_finished_at")
    op.drop_column("receipts", "ocr_started_at")
    op.drop_column("receipts", "ocr_status")
