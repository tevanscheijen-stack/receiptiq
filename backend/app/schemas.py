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

    model_config = {"from_attributes": True}
