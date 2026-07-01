from __future__ import annotations

from dataclasses import dataclass
import importlib.util
import os
from pathlib import Path
import sys
from time import perf_counter

import cv2
import numpy as np


def _load_sibling(module_name: str, filename: str):
    path = Path(__file__).with_name(filename)
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Unable to load {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


_ocdnet = _load_sibling("woodapp_nvidia_ocdnet_runtime", "ocdnet_runtime.py")
_ocrnet = _load_sibling("woodapp_nvidia_ocrnet_runtime", "ocrnet_runtime.py")
_preprocessing = _load_sibling("woodapp_nvidia_preprocessing", "preprocessing.py")
_loader = _load_sibling("woodapp_nvidia_model_loader", "model_loader.py")

DetectedMeasurement = _ocdnet.DetectedMeasurement
MeasurementDetector = _ocdnet.MeasurementDetector
NvidiaModelNotReady = _loader.NvidiaModelNotReady
OcdnetOnnxDetector = _ocdnet.OcdnetOnnxDetector
box_from_polygon = _ocdnet.box_from_polygon
sort_and_limit_detections = _ocdnet.sort_and_limit_detections
MeasurementRecognizer = _ocrnet.MeasurementRecognizer
OcrnetOnnxRecognizer = _ocrnet.OcrnetOnnxRecognizer
RecognitionResult = _ocrnet.RecognitionResult
map_points_to_original = _preprocessing.map_points_to_original
prepare_image = _preprocessing.prepare_image
NvidiaModelLoader = _loader.NvidiaModelLoader
safe_metadata = _loader.safe_metadata


ENGINE = "nvidia-tao-ocdnet-ocrnet-v1"


@dataclass
class NvidiaPipeline:
    detector: MeasurementDetector | None = None
    recognizer: MeasurementRecognizer | None = None
    model_loader: object | None = None
    max_detections: int = int(os.getenv("NVIDIA_MAX_DETECTIONS", os.getenv("NVIDIA_OCR_MAX_DETECTIONS", "100")))
    batch_size: int = int(os.getenv("NVIDIA_RECOGNITION_BATCH_SIZE", os.getenv("NVIDIA_OCR_BATCH_SIZE", "16")))
    low_confidence_threshold: float = float(os.getenv("NVIDIA_MIN_CONFIDENCE", os.getenv("NVIDIA_OCR_LOW_CONFIDENCE_THRESHOLD", "0.70")))

    def __post_init__(self) -> None:
        if self.model_loader is None:
            self.model_loader = NvidiaModelLoader()
        bundle = self.model_loader.load_once()
        if bundle.ready:
            if self.detector is None:
                self.detector = OcdnetOnnxDetector(confidence_threshold=self.low_confidence_threshold, session_info=bundle.detector)
            if self.recognizer is None:
                self.recognizer = OcrnetOnnxRecognizer(vocabulary=bundle.dictionary, batch_size=self.batch_size, session_info=bundle.recognizer)

    def health(self) -> dict:
        return self.model_loader.health()

    def recognize_image(self, image: np.ndarray) -> dict:
        bundle = self.model_loader.require_ready()
        if self.detector is None:
            self.detector = OcdnetOnnxDetector(confidence_threshold=self.low_confidence_threshold, session_info=bundle.detector)
        if self.recognizer is None:
            self.recognizer = OcrnetOnnxRecognizer(vocabulary=bundle.dictionary, batch_size=self.batch_size, session_info=bundle.recognizer)
        start = perf_counter()
        prepared = prepare_image(image)
        detected = sort_and_limit_detections(self.detector.detect(prepared.processed), self.max_detections)
        crops: list[np.ndarray] = []
        crop_errors: dict[int, str] = {}
        mapped: list[DetectedMeasurement] = []

        for index, item in enumerate(detected):
            polygon = map_points_to_original(item.polygon, prepared.to_original)
            mapped_item = DetectedMeasurement(polygon=polygon, confidence=item.confidence, column_index=item.column_index, row_index=item.row_index)
            mapped.append(mapped_item)
            box = box_from_polygon(polygon, prepared.width, prepared.height)
            x1, y1 = int(box["x"]), int(box["y"])
            x2, y2 = int(box["x"] + box["width"]), int(box["y"] + box["height"])
            crop = prepared.original[max(0, y1):min(prepared.height, y2), max(0, x1):min(prepared.width, x2)]
            if crop.size == 0:
                crop_errors[index] = "empty_crop"
                crops.append(np.zeros((1, 1, 3), dtype=np.uint8))
            else:
                crops.append(crop.astype(np.uint8, copy=False))

        recognitions: list[RecognitionResult] = []
        batches = 0
        for offset in range(0, len(crops), self.batch_size):
            batch = crops[offset:offset + self.batch_size]
            batches += 1
            try:
                recognitions.extend(self.recognizer.recognize_batch(batch))
            except Exception:
                recognitions.extend([RecognitionResult("", None, 0.0, False, "recognition_failed") for _ in batch])

        detections = []
        valid_count = 0
        for index, item in enumerate(mapped):
            recognition = recognitions[index] if index < len(recognitions) else RecognitionResult("", None, 0.0, False, "missing_recognition")
            if index in crop_errors:
                recognition = RecognitionResult("", None, 0.0, False, crop_errors[index])
            valid = recognition.valid and recognition.confidence >= self.low_confidence_threshold
            valid_count += 1 if valid else 0
            box = box_from_polygon(item.polygon, prepared.width, prepared.height)
            detections.append({
                "id": f"measurement-{index + 1}",
                "rawText": recognition.raw_text,
                "normalizedText": recognition.normalized_text,
                "confidence": round(float(recognition.confidence), 4),
                "valid": bool(valid),
                "selected": bool(valid),
                "reason": None if valid else recognition.reason or "low_confidence",
                "columnIndex": int(item.column_index),
                "rowIndex": int(item.row_index),
                "box": box,
                "polygon": [[round(float(x), 2), round(float(y), 2)] for x, y in item.polygon],
            })

        return {
            "status": "ok",
            "engine": ENGINE,
            "imageWidth": prepared.width,
            "imageHeight": prepared.height,
            "detections": detections,
            "summary": {
                "detected": len(detections),
                "valid": valid_count,
                "invalid": len(detections) - valid_count,
                "batches": batches,
                "totalMs": int((perf_counter() - start) * 1000),
                "preprocessingMs": int(prepared.preprocessing_ms),
            },
        }
