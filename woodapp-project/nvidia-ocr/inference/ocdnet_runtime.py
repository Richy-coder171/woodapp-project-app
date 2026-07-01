from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

import numpy as np


@dataclass(frozen=True)
class DetectedMeasurement:
    polygon: list[list[float]]
    confidence: float
    column_index: int = 0
    row_index: int = 0


class MeasurementDetector(Protocol):
    def detect(self, image: np.ndarray) -> list[DetectedMeasurement]:
        ...


class NvidiaModelNotReady(RuntimeError):
    def __init__(self, code: str = "NVIDIA_MODEL_NOT_READY", message: str = "The NVIDIA measurement models are not installed.") -> None:
        super().__init__(message)
        self.code = code


class OcdnetOnnxDetector:
    def __init__(self, model_path: str | Path | None = None, confidence_threshold: float = 0.35, session_info: object | None = None) -> None:
        self.model_path = Path(model_path) if model_path is not None else None
        self.confidence_threshold = confidence_threshold
        if session_info is not None:
            self.session_info = session_info
            self.session = session_info.session
            return
        if self.model_path is None or not self.model_path.exists():
            raise NvidiaModelNotReady("DETECTOR_MODEL_MISSING")
        import onnxruntime as ort

        self.session = ort.InferenceSession(str(self.model_path), providers=["CPUExecutionProvider"])
        self.session_info = None

    def detect(self, image: np.ndarray) -> list[DetectedMeasurement]:
        raise NvidiaModelNotReady("MODEL_OUTPUT_UNSUPPORTED", "OCDNet output decoding must be wired to the verified exported TAO model format.")


def box_from_polygon(polygon: list[list[float]], image_width: int, image_height: int) -> dict:
    xs = [point[0] for point in polygon]
    ys = [point[1] for point in polygon]
    x1 = max(0.0, min(xs))
    y1 = max(0.0, min(ys))
    x2 = min(float(image_width), max(xs))
    y2 = min(float(image_height), max(ys))
    return {"x": round(x1, 2), "y": round(y1, 2), "width": round(max(0.0, x2 - x1), 2), "height": round(max(0.0, y2 - y1), 2)}


def sort_and_limit_detections(detections: list[DetectedMeasurement], max_detections: int = 100) -> list[DetectedMeasurement]:
    ordered = sorted(detections, key=lambda item: (min(point[0] for point in item.polygon), min(point[1] for point in item.polygon)))
    return ordered[:max_detections]
