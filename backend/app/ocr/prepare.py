from pathlib import Path
from tempfile import TemporaryDirectory

from PIL import Image, ImageDraw

from app.ocr.base import OCRInput, OCRProcessingError, get_ocr_engine


def prepare_ocr_models() -> None:
    with TemporaryDirectory() as temporary_dir:
        image_path = Path(temporary_dir) / "receiptiq-ocr-check.png"
        image = Image.new("RGB", (640, 160), "white")
        drawing = ImageDraw.Draw(image)
        drawing.text((40, 60), "ReceiptIQ", fill="black")
        image.save(image_path)

        engine = get_ocr_engine()
        engine.recognize_text(
            OCRInput(
                file_path=image_path,
                file_extension="png",
            )
        )


def main() -> None:
    try:
        prepare_ocr_models()
    except OCRProcessingError as exc:
        raise SystemExit(f"ReceiptIQ could not prepare local OCR: {exc}") from exc


if __name__ == "__main__":
    main()
