import uuid
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.models import Receipt
from app.schemas import ReceiptResponse

router = APIRouter(prefix="/api/v1/receipts", tags=["receipts"])

ALLOWED_EXTENSIONS = {"pdf", "png", "jpg", "jpeg", "heic", "webp", "html"}
CHUNK_SIZE = 1024 * 1024
UPLOAD_FILE = File(...)
DATABASE_SESSION = Depends(get_db)


def get_file_extension(filename: str) -> str:
    return Path(filename).suffix.lower().lstrip(".")


def validate_extension(filename: str) -> str:
    extension = get_file_extension(filename)
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "ReceiptIQ supports PDF, PNG, JPG, JPEG, HEIC, WEBP, " "and HTML files."
            ),
        )
    return extension


def create_storage_path(extension: str) -> Path:
    originals_dir = Path(settings.receipt_originals_dir)
    originals_dir.mkdir(parents=True, exist_ok=True)

    while True:
        stored_filename = f"{uuid.uuid4()}.{extension}"
        storage_path = originals_dir / stored_filename
        if not storage_path.exists():
            return storage_path


def store_upload(upload: UploadFile, storage_path: Path) -> int:
    file_size = 0
    try:
        with storage_path.open("xb") as stored_file:
            while chunk := upload.file.read(CHUNK_SIZE):
                file_size += len(chunk)
                if file_size > settings.max_receipt_file_size:
                    stored_file.close()
                    storage_path.unlink(missing_ok=True)
                    raise HTTPException(
                        status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                        detail="This receipt is too large. The maximum size is 25 MB.",
                    )
                stored_file.write(chunk)
    except FileExistsError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="ReceiptIQ could not create a unique filename. Please try again.",
        ) from exc
    finally:
        upload.file.seek(0)

    return file_size


@router.post(
    "/upload",
    response_model=ReceiptResponse,
    status_code=status.HTTP_201_CREATED,
)
def upload_receipt(
    file: Annotated[UploadFile, UPLOAD_FILE],
    db: Annotated[Session, DATABASE_SESSION],
) -> ReceiptResponse:
    extension = validate_extension(file.filename or "")
    storage_path = create_storage_path(extension)
    file_size = store_upload(file, storage_path)

    receipt = Receipt(
        original_filename=file.filename or storage_path.name,
        stored_filename=storage_path.name,
        file_extension=extension,
        mime_type=file.content_type or "application/octet-stream",
        file_size=file_size,
        status="UPLOADED",
    )
    db.add(receipt)

    try:
        db.commit()
    except Exception:
        db.rollback()
        storage_path.unlink(missing_ok=True)
        raise

    db.refresh(receipt)
    return ReceiptResponse.model_validate(receipt)


@router.get("", response_model=list[ReceiptResponse])
def list_receipts(
    db: Annotated[Session, DATABASE_SESSION],
) -> list[ReceiptResponse]:
    receipts = db.scalars(
        select(Receipt).order_by(Receipt.upload_timestamp.desc())
    ).all()
    return [ReceiptResponse.model_validate(receipt) for receipt in receipts]
