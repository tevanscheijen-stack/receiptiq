from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.receipts import router as receipts_router
from app.api.routes import router
from app.core.config import settings


def create_app() -> FastAPI:
    app = FastAPI(title="ReceiptIQ", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(router)
    app.include_router(receipts_router)

    return app


app = create_app()
