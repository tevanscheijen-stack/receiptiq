from fastapi.testclient import TestClient

from app.main import create_app

client = TestClient(create_app())


def test_root_returns_app_status() -> None:
    response = client.get("/")

    assert response.status_code == 200
    assert response.json() == {"name": "ReceiptIQ", "status": "running"}


def test_health_returns_healthy() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}
