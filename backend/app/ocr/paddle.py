from pathlib import Path
from typing import Any

from app.core.config import settings
from app.ocr.base import OCRInput, OCRProcessingError

OCR_SUPPORTED_EXTENSIONS = {"pdf", "png", "jpg", "jpeg", "heic", "webp"}


class PaddleOCREngine:
    def __init__(self, ocr: Any | None = None) -> None:
        self._ocr = ocr or self._create_paddle_ocr()

    def recognize_text(self, ocr_input: OCRInput) -> str:
        if ocr_input.file_extension not in OCR_SUPPORTED_EXTENSIONS:
            raise OCRProcessingError("OCR is not available for this file type.")

        if not ocr_input.file_path.exists():
            raise OCRProcessingError("The original receipt file could not be found.")

        try:
            page_text = [
                self._recognize_image(page)
                for page in self._load_receipt_images(
                    ocr_input.file_path,
                    ocr_input.file_extension,
                )
            ]
        except OCRProcessingError:
            raise
        except Exception as exc:
            raise OCRProcessingError("OCR could not read this receipt.") from exc

        return "\n".join(text for text in page_text if text).strip()

    def _create_paddle_ocr(self) -> Any:
        import os

        ocr_cache_dir = Path(settings.ocr_cache_dir)
        ocr_cache_dir.mkdir(parents=True, exist_ok=True)
        os.environ.setdefault("PADDLE_PDX_CACHE_HOME", str(ocr_cache_dir.resolve()))

        try:
            from paddleocr import PaddleOCR
        except Exception as exc:
            raise OCRProcessingError("PaddleOCR is not installed.") from exc

        modern_options = {
            "lang": "en",
            "device": "cpu",
            "engine": "paddle_dynamic",
            "use_doc_orientation_classify": False,
            "use_doc_unwarping": False,
            "use_textline_orientation": False,
        }

        try:
            return PaddleOCR(**modern_options)
        except (TypeError, ValueError):
            return PaddleOCR(lang="en")

    def _load_receipt_images(self, file_path: Path, file_extension: str) -> list[Any]:
        if file_extension == "pdf":
            return self._load_pdf_pages(file_path)

        return [self._load_image(file_path, file_extension)]

    def _load_pdf_pages(self, file_path: Path) -> list[Any]:
        try:
            import pypdfium2 as pdfium
        except Exception as exc:
            raise OCRProcessingError("PDF OCR support is not installed.") from exc

        pdf = pdfium.PdfDocument(str(file_path))
        try:
            return [
                pdf[index].render(scale=2).to_pil().convert("RGB")
                for index in range(len(pdf))
            ]
        finally:
            pdf.close()

    def _load_image(self, file_path: Path, file_extension: str) -> Any:
        if file_extension == "heic":
            try:
                from pillow_heif import register_heif_opener
            except Exception as exc:
                raise OCRProcessingError("HEIC OCR support is not installed.") from exc

            register_heif_opener()

        from PIL import Image

        with Image.open(file_path) as image:
            return image.convert("RGB")

    def _recognize_image(self, image: Any) -> str:
        import numpy as np

        image_array = np.array(image)

        if hasattr(self._ocr, "ocr"):
            try:
                result = self._ocr.ocr(image_array, cls=True)
            except TypeError:
                result = self._ocr.ocr(image_array)
        elif hasattr(self._ocr, "predict"):
            result = self._ocr.predict(image_array)
        else:
            raise OCRProcessingError("The OCR engine is not available.")

        lines = self._extract_text_lines(result)
        return "\n".join(lines)

    def _extract_text_lines(self, result: Any) -> list[str]:
        lines: list[str] = []

        def walk(value: Any) -> None:
            if value is None:
                return

            if hasattr(value, "json"):
                walk(value.json)
                return

            if hasattr(value, "res"):
                walk(value.res)
                return

            if isinstance(value, dict):
                rec_texts = value.get("rec_texts")
                if isinstance(rec_texts, list):
                    lines.extend(str(text) for text in rec_texts if text)
                    return

                for key in ("rec_text", "text"):
                    text = value.get(key)
                    if isinstance(text, str) and text:
                        lines.append(text)
                        return

                for item in value.values():
                    walk(item)
                return

            if isinstance(value, list | tuple):
                if (
                    len(value) >= 2
                    and isinstance(value[1], list | tuple)
                    and len(value[1]) >= 1
                    and isinstance(value[1][0], str)
                ):
                    lines.append(value[1][0])
                    return

                for item in value:
                    walk(item)

        walk(result)
        return lines
