from datetime import datetime

from pydantic import BaseModel


class RootResponse(BaseModel):
    name: str
    status: str


class HealthResponse(BaseModel):
    status: str


class ReceiptResponse(BaseModel):
    id: str
    original_filename: str
    stored_filename: str
    file_extension: str
    mime_type: str
    file_size: int
    upload_timestamp: datetime
    status: str
    processing_status: str
    processing_started_at: datetime | None
    processing_finished_at: datetime | None
    processing_error: str | None
    ocr_status: str
    ocr_started_at: datetime | None
    ocr_finished_at: datetime | None
    ocr_error: str | None
    ocr_text: str | None

    model_config = {"from_attributes": True}


class ProcessReceiptsRequest(BaseModel):
    receipt_ids: list[str]
