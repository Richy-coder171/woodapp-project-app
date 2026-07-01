from __future__ import annotations

import importlib.util
from pathlib import Path
import sys

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
PIPELINE = ROOT / "inference" / "pipeline.py"


def load_pipeline():
    spec = importlib.util.spec_from_file_location("test_pipeline_module", PIPELINE)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules["test_pipeline_module"] = module
    spec.loader.exec_module(module)
    return module


class ReadyLoader:
    def __init__(self, bundle) -> None:
        self.bundle = bundle
        self.health_calls = 0

    def load_once(self):
        return self.bundle

    def require_ready(self):
        return self.bundle

    def health(self):
        self.health_calls += 1
        return {"status": "ok", "engine": "nvidia-tao-ocdnet-ocrnet-v1"}


class Bundle:
    ready = True
    detector = None
    recognizer = None
    dictionary = "0123456789x."


class Detector:
    def __init__(self, detections) -> None:
        self.detections = detections
        self.calls = 0

    def detect(self, image):
        self.calls += 1
        return self.detections


class Recognizer:
    def __init__(self, results) -> None:
        self.results = results
        self.batch_sizes = []

    def recognize_batch(self, crops):
        self.batch_sizes.append(len(crops))
        offset = sum(self.batch_sizes[:-1])
        return self.results[offset:offset + len(crops)]


def test_pipeline_batches_partial_results_and_selection() -> None:
    module = load_pipeline()
    detections = [
        module.DetectedMeasurement([[10, 10], [80, 10], [80, 30], [10, 30]], 0.9),
        module.DetectedMeasurement([[20, 50], [100, 50], [100, 70], [20, 70]], 0.8),
    ]
    results = [
        module.RecognitionResult("43X24", "43x24", 0.95, True),
        module.RecognitionResult("43?24", None, 0.41, False, "invalid_format"),
    ]
    pipeline = module.NvidiaPipeline(
        detector=Detector(detections),
        recognizer=Recognizer(results),
        model_loader=ReadyLoader(Bundle()),
        batch_size=1,
    )
    image = np.full((120, 140, 3), 255, dtype=np.uint8)
    payload = pipeline.recognize_image(image)
    assert payload["summary"]["detected"] == 2
    assert payload["summary"]["batches"] == 2
    assert payload["detections"][0]["selected"] is True
    assert payload["detections"][1]["selected"] is False
    assert payload["detections"][1]["reason"] == "invalid_format"


def test_pipeline_limits_to_100_detections() -> None:
    module = load_pipeline()
    detections = [
        module.DetectedMeasurement([[i, i], [i + 10, i], [i + 10, i + 8], [i, i + 8]], 0.9)
        for i in range(120)
    ]
    results = [module.RecognitionResult("43x24", "43x24", 0.95, True) for _ in range(100)]
    pipeline = module.NvidiaPipeline(
        detector=Detector(detections),
        recognizer=Recognizer(results),
        model_loader=ReadyLoader(Bundle()),
        batch_size=16,
        max_detections=100,
    )
    image = np.full((300, 300, 3), 255, dtype=np.uint8)
    payload = pipeline.recognize_image(image)
    assert payload["summary"]["detected"] == 100
    assert payload["summary"]["batches"] == 7
