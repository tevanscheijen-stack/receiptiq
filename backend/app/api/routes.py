from fastapi import APIRouter

from app.schemas import HealthResponse, RootResponse

router = APIRouter()


@router.get("/", response_model=RootResponse)
def read_root() -> RootResponse:
    return RootResponse(name="ReceiptIQ", status="running")


@router.get("/health", response_model=HealthResponse)
def read_health() -> HealthResponse:
    return HealthResponse(status="healthy")
