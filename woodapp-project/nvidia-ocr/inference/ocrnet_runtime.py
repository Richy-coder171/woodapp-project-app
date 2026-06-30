from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
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
    def __init__(self, model_path: str | Path, vocabulary: str = "0123456789x.", batch_size: int = 16) -> None:
        self.model_path = Path(model_path)
        self.vocabulary = vocabulary
        self.batch_size = batch_size
        if not self.model_path.exists():
            raise NvidiaModelNotReady("The NVIDIA measurement recognizer model has not been installed.")
        import onnxruntime as ort

        self.session = ort.InferenceSession(str(self.model_path), providers=["CUDAExecutionProvider", "CPUExecutionProvider"])

    def recognize_batch(self, crops: list[np.ndarray]) -> list[RecognitionResult]:
        raise NvidiaModelNotReady("OCRNet output decoding must be wired to the verified exported TAO model format.")


class NvidiaModelNotReady(RuntimeError):
    pass
