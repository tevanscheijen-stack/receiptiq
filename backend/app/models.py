import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Receipt(Base):
    __tablename__ = "receipts"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    stored_filename: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=False
    )
    file_extension: Mapped[str] = mapped_column(String(16), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(255), nullable=False)
    file_size: Mapped[int] = mapped_column(nullable=False)
    upload_timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="UPLOADED")
    processing_status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="uploaded"
    )
    processing_started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    processing_finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    processing_error: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    ocr_status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="pending"
    )
    ocr_started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    ocr_finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    ocr_error: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    ocr_text: Mapped[str | None] = mapped_column(Text, nullable=True)
