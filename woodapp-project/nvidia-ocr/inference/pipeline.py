from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path
from time import perf_counter

import cv2
import numpy as np

from ocdnet_runtime import DetectedMeasurement, MeasurementDetector, NvidiaModelNotReady, OcdnetOnnxDetector, box_from_polygon, sort_and_limit_detections
from ocrnet_runtime import MeasurementRecognizer, OcrnetOnnxRecognizer, RecognitionResult
from preprocessing import map_points_to_original, prepare_image


ENGINE = "nvidia-tao-ocdnet-ocrnet-v1"


@dataclass
class NvidiaPipeline:
    detector: MeasurementDetector | None = None
    recognizer: MeasurementRecognizer | None = None
    detector_model: Path = Path("nvidia-ocr/models/exported/ocdnet.onnx")
    recognizer_model: Path = Path("nvidia-ocr/models/exported/ocrnet.onnx")
    max_detections: int = int(os.getenv("NVIDIA_OCR_MAX_DETECTIONS", "100"))
    batch_size: int = int(os.getenv("NVIDIA_OCR_BATCH_SIZE", "16"))
    low_confidence_threshold: float = float(os.getenv("NVIDIA_OCR_LOW_CONFIDENCE_THRESHOLD", "0.75"))

    def __post_init__(self) -> None:
        if self.detector is None and self.detector_model.exists():
            self.detector = OcdnetOnnxDetector(self.detector_model)
        if self.recognizer is None and self.recognizer_model.exists():
            self.recognizer = OcrnetOnnxRecognizer(self.recognizer_model, batch_size=self.batch_size)

    def health(self) -> dict:
        try:
            import onnxruntime as ort
            onnx_available = True
            providers = ort.get_available_providers()
            cuda_available = "CUDAExecutionProvider" in providers
        except Exception:
            onnx_available = False
            providers = []
            cuda_available = False
        return {
            "status": "ok" if self.detector and self.recognizer else "model_not_ready",
            "engine": ENGINE,
            "detectorModelLoaded": self.detector is not None,
            "recognizerModelLoaded": self.recognizer is not None,
            "runtimeBackend": "onnxruntime",
            "cudaAvailable": cuda_available,
            "tensorRtAvailable": False,
            "onnxRuntimeAvailable": onnx_available,
            "providers": providers,
        }

    def recognize_image(self, image: np.ndarray) -> dict:
        if self.detector is None or self.recognizer is None:
            raise NvidiaModelNotReady("The NVIDIA measurement model has not been installed.")
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
