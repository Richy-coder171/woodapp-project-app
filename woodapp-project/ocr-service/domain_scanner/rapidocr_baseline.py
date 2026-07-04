from __future__ import annotations

from typing import Any

import numpy as np

from scanner import adapt_rapidocr_result, _run_ocr
from .grammar import normalize_symbol_text, parse_measurement
from .recognizer import BaseRecognizer
from .schemas import Recognition


class RapidOcrLineBaseline(BaseRecognizer):
    def __init__(self, engine: Any) -> None:
        self.engine = engine

    def recognize_batch(self, crops: list[np.ndarray]) -> list[Recognition]:
        results = []
        for crop in crops:
            try:
                lines = adapt_rapidocr_result(_run_ocr(self.engine, crop))
                raw = " ".join(item["text"] for item in lines).strip()
                confidence = sum(item["confidence"] for item in lines) / max(1, len(lines))
            except Exception:
                results.append(Recognition("", "", 0.0, False, "recognition_failed"))
                continue
            normalized = normalize_symbol_text(raw)
            results.append(Recognition(raw, normalized, float(confidence), parse_measurement(normalized) is not None, ""))
        return results
