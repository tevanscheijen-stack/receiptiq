from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.db.base import Base
from app.db.session import get_db
from app.main import create_app
from app.models import Receipt
from app.ocr.base import OCRInput, OCRProcessingError, get_ocr_engine
from app.services.processing import (
    OCR_COMPLETED,
    OCR_FAILED,
    OCR_PENDING,
    OCR_PROCESSING,
    PROCESSING_COMPLETED,
    PROCESSING_FAILED,
    PROCESSING_PROCESSING,
    PROCESSING_QUEUED,
    PROCESSING_UPLOADED,
    ReceiptProcessingService,
)


class FakeOCREngine:
    def __init__(self, text: str = "OCR line one\nOCR line two") -> None:
        self.text = text
        self.inputs: list[OCRInput] = []

    def recognize_text(self, ocr_input: OCRInput) -> str:
        self.inputs.append(ocr_input)
        return self.text


class FailingOCREngine:
    def recognize_text(self, ocr_input: OCRInput) -> str:
        raise OCRProcessingError("ReceiptIQ could not read this receipt.")


@pytest.fixture
def client(tmp_path: Path) -> Generator[TestClient]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)

    original_receipt_dir = settings.receipt_originals_dir
    settings.receipt_originals_dir = str(tmp_path / "data" / "receipts" / "originals")

    def override_get_db() -> Generator[Session]:
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app = create_app()
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_ocr_engine] = lambda: FakeOCREngine()

    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
        settings.receipt_originals_dir = original_receipt_dir


def test_upload_receipt_stores_original_file(client: TestClient) -> None:
    response = client.post(
        "/api/v1/receipts/upload",
        files={"file": ("groceries.pdf", b"receipt-data", "application/pdf")},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["original_filename"] == "groceries.pdf"
    assert body["file_extension"] == "pdf"
    assert body["mime_type"] == "application/pdf"
    assert body["file_size"] == len(b"receipt-data")
    assert body["status"] == "UPLOADED"
    assert body["processing_status"] == PROCESSING_UPLOADED
    assert body["processing_started_at"] is None
    assert body["processing_finished_at"] is None
    assert body["processing_error"] is None
    assert body["ocr_status"] == OCR_PENDING
    assert body["ocr_started_at"] is None
    assert body["ocr_finished_at"] is None
    assert body["ocr_error"] is None
    assert body["ocr_text"] is None

    stored_file = Path(settings.receipt_originals_dir) / body["stored_filename"]
    assert stored_file.exists()
    assert stored_file.read_bytes() == b"receipt-data"
    assert stored_file.name.endswith(".pdf")


def test_upload_rejects_invalid_extension(client: TestClient) -> None:
    response = client.post(
        "/api/v1/receipts/upload",
        files={"file": ("notes.txt", b"not-a-receipt", "text/plain")},
    )

    assert response.status_code == 400
    assert "supports PDF" in response.json()["detail"]


def test_upload_rejects_large_file(client: TestClient) -> None:
    response = client.post(
        "/api/v1/receipts/upload",
        files={
            "file": (
                "large.pdf",
                b"x" * (settings.max_receipt_file_size + 1),
                "application/pdf",
            )
        },
    )

    assert response.status_code == 413
    assert (
        response.json()["detail"]
        == "This receipt is too large. The maximum size is 25 MB."
    )
    assert list(Path(settings.receipt_originals_dir).glob("*")) == []


def test_upload_inserts_database_record(client: TestClient) -> None:
    upload_response = client.post(
        "/api/v1/receipts/upload",
        files={"file": ("receipt.png", b"png-data", "image/png")},
    )

    assert upload_response.status_code == 201
    list_response = client.get("/api/v1/receipts")

    assert list_response.status_code == 200
    receipts = list_response.json()
    assert len(receipts) == 1
    assert receipts[0]["original_filename"] == "receipt.png"
    assert receipts[0]["status"] == "UPLOADED"


def test_database_contains_uploaded_receipt(client: TestClient) -> None:
    response = client.post(
        "/api/v1/receipts/upload",
        files={"file": ("receipt.html", b"<html></html>", "text/html")},
    )

    assert response.status_code == 201
    app = client.app
    db_override = app.dependency_overrides[get_db]
    db = next(db_override())
    try:
        receipt = db.scalars(select(Receipt)).one()
        assert receipt.original_filename == "receipt.html"
        assert receipt.file_extension == "html"
        assert receipt.status == "UPLOADED"
    finally:
        db.close()


def test_original_receipt_endpoint_returns_stored_file(client: TestClient) -> None:
    upload_response = client.post(
        "/api/v1/receipts/upload",
        files={"file": ("receipt.png", b"png-data", "image/png")},
    )
    receipt = upload_response.json()

    response = client.get(f"/api/v1/receipts/{receipt['id']}/original")

    assert response.status_code == 200
    assert response.content == b"png-data"
    assert response.headers["content-type"] == "image/png"


def test_processing_service_status_transitions(client: TestClient) -> None:
    response = client.post(
        "/api/v1/receipts/upload",
        files={"file": ("receipt.pdf", b"receipt", "application/pdf")},
    )
    assert response.status_code == 201

    app = client.app
    db_override = app.dependency_overrides[get_db]
    db = next(db_override())
    try:
        receipt = db.scalars(select(Receipt)).one()
        service = ReceiptProcessingService(db)

        service.queue_receipt(receipt)
        assert receipt.processing_status == PROCESSING_QUEUED
        assert receipt.processing_started_at is None
        assert receipt.processing_finished_at is None
        assert receipt.processing_error is None
        assert receipt.ocr_status == OCR_PENDING
        assert receipt.ocr_started_at is None
        assert receipt.ocr_finished_at is None
        assert receipt.ocr_error is None

        service.start_processing(receipt)
        assert receipt.processing_status == PROCESSING_PROCESSING
        assert receipt.processing_started_at is not None
        assert receipt.processing_finished_at is None
        assert receipt.ocr_status == OCR_PROCESSING
        assert receipt.ocr_started_at is not None
        assert receipt.ocr_finished_at is None

        with pytest.raises(OCRProcessingError):
            service.finish_processing(receipt)

        service.finish_ocr(receipt)
        service.finish_processing(receipt)
        assert receipt.processing_status == PROCESSING_COMPLETED
        assert receipt.processing_finished_at is not None
        assert receipt.processing_error is None
        assert receipt.ocr_status == OCR_COMPLETED
        assert receipt.ocr_finished_at is not None
        assert receipt.ocr_error is None
    finally:
        db.close()


def test_processing_service_cannot_complete_before_ocr_finishes(
    client: TestClient,
) -> None:
    response = client.post(
        "/api/v1/receipts/upload",
        files={"file": ("receipt.pdf", b"receipt", "application/pdf")},
    )
    assert response.status_code == 201

    app = client.app
    db_override = app.dependency_overrides[get_db]
    db = next(db_override())
    try:
        receipt = db.scalars(select(Receipt)).one()
        service = ReceiptProcessingService(db)

        service.start_processing(receipt)

        with pytest.raises(OCRProcessingError):
            service.finish_processing(receipt)

        assert receipt.processing_status == PROCESSING_PROCESSING
        assert receipt.ocr_status == OCR_PROCESSING
    finally:
        db.close()


def test_processing_service_marks_failure(client: TestClient) -> None:
    response = client.post(
        "/api/v1/receipts/upload",
        files={"file": ("receipt.pdf", b"receipt", "application/pdf")},
    )
    assert response.status_code == 201

    app = client.app
    db_override = app.dependency_overrides[get_db]
    db = next(db_override())
    try:
        receipt = db.scalars(select(Receipt)).one()
        service = ReceiptProcessingService(db)

        service.start_processing(receipt)
        service.mark_failure(receipt, "Receipt processing failed.")

        assert receipt.processing_status == PROCESSING_FAILED
        assert receipt.processing_finished_at is not None
        assert receipt.processing_error == "Receipt processing failed."
        assert receipt.ocr_status == OCR_FAILED
        assert receipt.ocr_finished_at is not None
        assert receipt.ocr_error == "Receipt processing failed."
    finally:
        db.close()


def test_processing_service_stores_ocr_text(client: TestClient) -> None:
    upload_response = client.post(
        "/api/v1/receipts/upload",
        files={"file": ("receipt.pdf", b"receipt", "application/pdf")},
    )
    receipt_id = upload_response.json()["id"]

    app = client.app
    db_override = app.dependency_overrides[get_db]
    db = next(db_override())
    try:
        receipt = db.get(Receipt, receipt_id)
        assert receipt is not None

        service = ReceiptProcessingService(db, ocr_engine=FakeOCREngine("Milk\nBread"))
        service.process_receipts_by_ids([receipt.id])

        db.refresh(receipt)
        assert receipt.processing_status == PROCESSING_COMPLETED
        assert receipt.ocr_status == OCR_COMPLETED
        assert receipt.ocr_text == "Milk\nBread"
        assert receipt.ocr_error is None
    finally:
        db.close()


def test_processing_service_marks_ocr_failure(client: TestClient) -> None:
    upload_response = client.post(
        "/api/v1/receipts/upload",
        files={"file": ("receipt.pdf", b"receipt", "application/pdf")},
    )
    receipt_id = upload_response.json()["id"]

    app = client.app
    db_override = app.dependency_overrides[get_db]
    db = next(db_override())
    try:
        receipt = db.get(Receipt, receipt_id)
        assert receipt is not None

        service = ReceiptProcessingService(db, ocr_engine=FailingOCREngine())
        service.process_receipts_by_ids([receipt.id])

        db.refresh(receipt)
        assert receipt.processing_status == PROCESSING_FAILED
        assert receipt.processing_error == "ReceiptIQ could not read this receipt."
        assert receipt.ocr_status == OCR_FAILED
        assert receipt.ocr_error == "ReceiptIQ could not read this receipt."
        assert receipt.ocr_text is None
    finally:
        db.close()


def test_processing_uses_ocr_abstraction(client: TestClient) -> None:
    upload_response = client.post(
        "/api/v1/receipts/upload",
        files={"file": ("receipt.webp", b"receipt", "image/webp")},
    )
    receipt_id = upload_response.json()["id"]
    fake_ocr = FakeOCREngine("Recognised text")

    app = client.app
    db_override = app.dependency_overrides[get_db]
    db = next(db_override())
    try:
        receipt = db.get(Receipt, receipt_id)
        assert receipt is not None

        service = ReceiptProcessingService(db, ocr_engine=fake_ocr)
        service.process_receipts_by_ids([receipt.id])

        assert len(fake_ocr.inputs) == 1
        assert fake_ocr.inputs[0].file_extension == "webp"
        assert fake_ocr.inputs[0].file_path.name == receipt.stored_filename
    finally:
        db.close()


def test_processing_api_processes_selected_receipts_only(client: TestClient) -> None:
    upload_response = client.post(
        "/api/v1/receipts/upload",
        files={"file": ("selected.pdf", b"receipt", "application/pdf")},
    )
    other_upload_response = client.post(
        "/api/v1/receipts/upload",
        files={"file": ("not-selected.pdf", b"receipt", "application/pdf")},
    )
    selected_receipt = upload_response.json()
    other_receipt = other_upload_response.json()

    process_response = client.post(
        "/api/v1/receipts/process",
        json={"receipt_ids": [selected_receipt["id"]]},
    )

    assert process_response.status_code == 200
    receipts = {receipt["id"]: receipt for receipt in process_response.json()}
    assert receipts[selected_receipt["id"]]["processing_status"] == PROCESSING_COMPLETED
    assert receipts[selected_receipt["id"]]["processing_started_at"] is not None
    assert receipts[selected_receipt["id"]]["processing_finished_at"] is not None
    assert receipts[selected_receipt["id"]]["processing_error"] is None
    assert receipts[selected_receipt["id"]]["ocr_status"] == OCR_COMPLETED
    assert receipts[selected_receipt["id"]]["ocr_text"] == "OCR line one\nOCR line two"
    assert receipts[other_receipt["id"]]["processing_status"] == PROCESSING_UPLOADED
    assert receipts[other_receipt["id"]]["ocr_status"] == OCR_PENDING


def test_processing_api_ignores_invalid_ids(client: TestClient) -> None:
    upload_response = client.post(
        "/api/v1/receipts/upload",
        files={"file": ("receipt.pdf", b"receipt", "application/pdf")},
    )
    receipt = upload_response.json()

    process_response = client.post(
        "/api/v1/receipts/process",
        json={"receipt_ids": [receipt["id"], "not-a-real-id"]},
    )

    assert process_response.status_code == 200
    receipts = process_response.json()
    assert len(receipts) == 1
    assert receipts[0]["processing_status"] == PROCESSING_COMPLETED
    assert receipts[0]["ocr_status"] == OCR_COMPLETED


def test_processing_api_skips_completed_receipts(client: TestClient) -> None:
    upload_response = client.post(
        "/api/v1/receipts/upload",
        files={"file": ("receipt.pdf", b"receipt", "application/pdf")},
    )
    receipt = upload_response.json()

    first_process_response = client.post(
        "/api/v1/receipts/process",
        json={"receipt_ids": [receipt["id"]]},
    )
    completed_receipt = first_process_response.json()[0]

    second_process_response = client.post(
        "/api/v1/receipts/process",
        json={"receipt_ids": [receipt["id"]]},
    )

    assert second_process_response.status_code == 200
    receipts = second_process_response.json()
    assert receipts[0]["processing_status"] == PROCESSING_COMPLETED
    assert (
        receipts[0]["processing_started_at"]
        == completed_receipt["processing_started_at"]
    )
    assert (
        receipts[0]["processing_finished_at"]
        == completed_receipt["processing_finished_at"]
    )


def test_processing_api_validates_request_body(client: TestClient) -> None:
    response = client.post("/api/v1/receipts/process", json={})

    assert response.status_code == 422


def test_processing_api_returns_ocr_failure(client: TestClient) -> None:
    client.app.dependency_overrides[get_ocr_engine] = lambda: FailingOCREngine()
    upload_response = client.post(
        "/api/v1/receipts/upload",
        files={"file": ("receipt.pdf", b"receipt", "application/pdf")},
    )
    receipt = upload_response.json()

    process_response = client.post(
        "/api/v1/receipts/process",
        json={"receipt_ids": [receipt["id"]]},
    )

    assert process_response.status_code == 200
    processed_receipt = process_response.json()[0]
    assert processed_receipt["processing_status"] == PROCESSING_FAILED
    assert processed_receipt["ocr_status"] == OCR_FAILED
    assert processed_receipt["ocr_error"] == "ReceiptIQ could not read this receipt."
    assert processed_receipt["ocr_text"] is None


def test_processing_service_handles_processor_failure(client: TestClient) -> None:
    response = client.post(
        "/api/v1/receipts/upload",
        files={"file": ("receipt.pdf", b"receipt", "application/pdf")},
    )
    assert response.status_code == 201

    app = client.app
    db_override = app.dependency_overrides[get_db]
    db = next(db_override())
    try:
        receipt = db.scalars(select(Receipt)).one()
        ReceiptProcessingService(db).queue_receipt(receipt)
        db.commit()

        def failing_processor(processing_receipt: Receipt) -> None:
            raise RuntimeError("processor unavailable")

        service = ReceiptProcessingService(db, processor=failing_processor)
        processed = service.process_queued_receipts()

        assert len(processed) == 1
        assert processed[0].processing_status == PROCESSING_FAILED
        assert processed[0].processing_error == "ReceiptIQ could not read this receipt."
        assert processed[0].ocr_status == OCR_FAILED
        assert processed[0].ocr_error == "ReceiptIQ could not read this receipt."
    finally:
        db.close()
