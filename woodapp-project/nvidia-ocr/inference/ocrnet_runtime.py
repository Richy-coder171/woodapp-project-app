from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re
from typing import Protocol

import numpy as np


@dataclass(frozen=True)
class RecognitionResult:
    raw_text: str
    normalized_text: str | None
    confidence: float
    valid: bool
    reason: str | None = None


class MeasurementRecognizer(Protocol):
    def recognize_batch(self, crops: list[np.ndarray]) -> list[RecognitionResult]:
        ...


def greedy_ctc_decode(indices: list[int], vocabulary: str, blank_index: int = 0) -> str:
    chars: list[str] = []
    previous = None
    for index in indices:
        if index == blank_index:
            previous = index
            continue
        if index == previous:
            continue
        char_index = index - 1 if blank_index == 0 else index
        if 0 <= char_index < len(vocabulary):
            chars.append(vocabulary[char_index])
        previous = index
    return "".join(chars)


class OcrnetOnnxRecognizer:
    def __init__(self, model_path: str | Path | None = None, vocabulary: str = "0123456789x.", batch_size: int = 16, session_info: object | None = None) -> None:
        self.model_path = Path(model_path) if model_path is not None else None
        self.vocabulary = vocabulary
        self.batch_size = batch_size
        if session_info is not None:
            self.session_info = session_info
            self.session = session_info.session
            return
        if self.model_path is None or not self.model_path.exists():
            raise NvidiaModelNotReady("RECOGNIZER_MODEL_MISSING")
        import onnxruntime as ort

        self.session = ort.InferenceSession(str(self.model_path), providers=["CPUExecutionProvider"])
        self.session_info = None

    def recognize_batch(self, crops: list[np.ndarray]) -> list[RecognitionResult]:
        raise NvidiaModelNotReady("MODEL_OUTPUT_UNSUPPORTED", "OCRNet output decoding must be wired to the verified exported TAO model format.")


class NvidiaModelNotReady(RuntimeError):
    def __init__(self, code: str = "NVIDIA_MODEL_NOT_READY", message: str = "The NVIDIA measurement models are not installed.") -> None:
        super().__init__(message)
        self.code = code


MEASUREMENT_RE = re.compile(r"^\d+(?:\.\d+)?x\d+(?:\.\d+)?$")


def normalize_measurement_text(text: str) -> str:
    return (
        str(text or "")
        .strip()
        .replace("×", "x")
        .replace("Ã—", "x")
        .replace("X", "x")
        .replace("*", "x")
        .replace(" ", "")
        .replace("\t", "")
        .replace("\n", "")
        .replace("\r", "")
    )


def validate_recognition(raw_text: str, confidence: float, min_confidence: float = 0.7) -> RecognitionResult:
    normalized = normalize_measurement_text(raw_text)
    if not MEASUREMENT_RE.fullmatch(normalized):
        return RecognitionResult(str(raw_text or ""), None, float(confidence), False, "invalid_format")
    if confidence < min_confidence:
        return RecognitionResult(str(raw_text or ""), normalized, float(confidence), False, "low_confidence")
    return RecognitionResult(str(raw_text or ""), normalized, float(confidence), True, None)
