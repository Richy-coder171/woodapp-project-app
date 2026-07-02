from __future__ import annotations

from abc import ABC, abstractmethod

import numpy as np

from .grammar import normalize_symbol_text, parse_measurement
from .schemas import Recognition


class BaseRecognizer(ABC):
    @abstractmethod
    def recognize_batch(self, crops: list[np.ndarray]) -> list[Recognition]:
        raise NotImplementedError


class BaselineRecognizer(BaseRecognizer):
    """Detector-only baseline used until a trained WoodApp recognizer exists."""

    def recognize_batch(self, crops: list[np.ndarray]) -> list[Recognition]:
        return [
            Recognition("", "", 0.0, False, "recognition_not_configured")
            for _ in crops
        ]


class StaticRecognizer(BaseRecognizer):
    def __init__(self, text: str = "43x24", confidence: float = 0.9) -> None:
        self.text = text
        self.confidence = confidence

    def recognize_batch(self, crops: list[np.ndarray]) -> list[Recognition]:
        normalized = normalize_symbol_text(self.text)
        valid = parse_measurement(normalized) is not None
        return [Recognition(self.text, normalized, self.confidence, valid, "" if valid else "invalid_format") for _ in crops]
