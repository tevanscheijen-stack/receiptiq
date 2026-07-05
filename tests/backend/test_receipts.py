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
