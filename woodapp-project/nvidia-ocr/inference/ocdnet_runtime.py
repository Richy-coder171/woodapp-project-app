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
    pass


class OcdnetOnnxDetector:
    def __init__(self, model_path: str | Path, confidence_threshold: float = 0.35) -> None:
        self.model_path = Path(model_path)
        self.confidence_threshold = confidence_threshold
        if not self.model_path.exists():
            raise NvidiaModelNotReady("The NVIDIA measurement detector model has not been installed.")
        import onnxruntime as ort

        self.session = ort.InferenceSession(str(self.model_path), providers=["CUDAExecutionProvider", "CPUExecutionProvider"])

    def detect(self, image: np.ndarray) -> list[DetectedMeasurement]:
        raise NvidiaModelNotReady("OCDNet output decoding must be wired to the verified exported TAO model format.")


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
