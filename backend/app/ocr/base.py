from dataclasses import dataclass
from pathlib import Path
from typing import Protocol


@dataclass(frozen=True)
class OCRInput:
    file_path: Path
    file_extension: str


class OCRProcessingError(Exception):
    pass


class OCREngine(Protocol):
    def recognize_text(self, ocr_input: OCRInput) -> str:
        pass


def get_ocr_engine() -> OCREngine:
    from app.ocr.paddle import PaddleOCREngine

    return PaddleOCREngine()
