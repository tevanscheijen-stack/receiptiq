from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import Receipt
from app.ocr.base import OCREngine, OCRInput, OCRProcessingError, get_ocr_engine

PROCESSING_UPLOADED = "uploaded"
PROCESSING_QUEUED = "queued"
PROCESSING_PROCESSING = "processing"
PROCESSING_COMPLETED = "completed"
PROCESSING_FAILED = "failed"

OCR_PENDING = "pending"
OCR_PROCESSING = "processing"
OCR_COMPLETED = "completed"
OCR_FAILED = "failed"


class ReceiptProcessingService:
    def __init__(
        self,
        db: Session,
        processor: Callable[[Receipt], None] | None = None,
        ocr_engine: OCREngine | None = None,
    ) -> None:
        self.db = db
        self.processor = processor
        self.ocr_engine = ocr_engine

    def queue_uploaded_receipts(self) -> list[Receipt]:
        receipts = self.db.scalars(
            select(Receipt)
            .where(Receipt.processing_status == PROCESSING_UPLOADED)
            .order_by(Receipt.upload_timestamp.asc())
        ).all()

        for receipt in receipts:
            self.queue_receipt(receipt)

        self.db.commit()
        return list(receipts)

    def queue_receipt(self, receipt: Receipt) -> Receipt:
        receipt.processing_status = PROCESSING_QUEUED
        receipt.processing_started_at = None
        receipt.processing_finished_at = None
        receipt.processing_error = None
        receipt.ocr_status = OCR_PENDING
        receipt.ocr_started_at = None
        receipt.ocr_finished_at = None
        receipt.ocr_error = None
        receipt.ocr_text = None
        return receipt

    def start_processing(self, receipt: Receipt) -> Receipt:
        now = datetime.now(UTC)
        receipt.processing_status = PROCESSING_PROCESSING
        receipt.processing_started_at = now
        receipt.processing_finished_at = None
        receipt.processing_error = None
        receipt.ocr_status = OCR_PROCESSING
        receipt.ocr_started_at = now
        receipt.ocr_finished_at = None
        receipt.ocr_error = None
        return receipt

    def finish_processing(self, receipt: Receipt) -> Receipt:
        if receipt.ocr_status != OCR_COMPLETED:
            raise OCRProcessingError("OCR must finish before processing can complete.")

        now = datetime.now(UTC)
        receipt.processing_status = PROCESSING_COMPLETED
        receipt.processing_finished_at = now
        receipt.processing_error = None
        receipt.ocr_error = None
        return receipt

    def finish_ocr(self, receipt: Receipt) -> Receipt:
        receipt.ocr_status = OCR_COMPLETED
        receipt.ocr_finished_at = datetime.now(UTC)
        receipt.ocr_error = None
        return receipt

    def mark_failure(self, receipt: Receipt, error: str) -> Receipt:
        now = datetime.now(UTC)
        receipt.processing_status = PROCESSING_FAILED
        receipt.processing_finished_at = now
        receipt.processing_error = error
        receipt.ocr_status = OCR_FAILED
        receipt.ocr_finished_at = now
        receipt.ocr_error = error
        return receipt

    def process_queued_receipts(self) -> list[Receipt]:
        receipts = self.db.scalars(
            select(Receipt)
            .where(Receipt.processing_status == PROCESSING_QUEUED)
            .order_by(Receipt.upload_timestamp.asc())
        ).all()

        return self._process_receipts(list(receipts))

    def process_uploaded_receipts(self) -> list[Receipt]:
        self.queue_uploaded_receipts()
        return self.process_queued_receipts()

    def process_receipts_by_ids(self, receipt_ids: list[str]) -> list[Receipt]:
        if not receipt_ids:
            return []

        receipts = self.db.scalars(
            select(Receipt)
            .where(Receipt.id.in_(receipt_ids))
            .where(Receipt.processing_status == PROCESSING_UPLOADED)
            .order_by(Receipt.upload_timestamp.asc())
        ).all()

        for receipt in receipts:
            self.queue_receipt(receipt)

        self.db.commit()
        return self.process_queued_receipts_by_ids([receipt.id for receipt in receipts])

    def process_queued_receipts_by_ids(self, receipt_ids: list[str]) -> list[Receipt]:
        if not receipt_ids:
            return []

        receipts = self.db.scalars(
            select(Receipt)
            .where(Receipt.id.in_(receipt_ids))
            .where(Receipt.processing_status == PROCESSING_QUEUED)
            .order_by(Receipt.upload_timestamp.asc())
        ).all()

        return self._process_receipts(list(receipts))

    def _process_receipts(self, receipts: list[Receipt]) -> list[Receipt]:
        processed_receipts: list[Receipt] = []
        for receipt in receipts:
            self.start_processing(receipt)
            self.db.commit()

            try:
                self._process_receipt(receipt)
            except OCRProcessingError as exc:
                self.mark_failure(receipt, str(exc))
            except Exception:
                self.mark_failure(receipt, "ReceiptIQ could not read this receipt.")
            else:
                self.finish_ocr(receipt)
                self.finish_processing(receipt)

            self.db.commit()
            self.db.refresh(receipt)
            processed_receipts.append(receipt)

        return processed_receipts

    def _process_receipt(self, receipt: Receipt) -> None:
        if self.processor is not None:
            self.processor(receipt)
            return

        ocr_engine = self.ocr_engine or get_ocr_engine()
        original_file = Path(settings.receipt_originals_dir) / receipt.stored_filename
        receipt.ocr_text = ocr_engine.recognize_text(
            OCRInput(
                file_path=original_file,
                file_extension=receipt.file_extension,
            )
        )
