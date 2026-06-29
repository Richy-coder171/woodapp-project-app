from __future__ import annotations

from time import perf_counter
from typing import Any

import numpy as np

from .column_grouping import sort_lines
from .config import BATCH_SIZE, ENGINE_NAME, LOW_CONFIDENCE_THRESHOLD
from .crop_normalization import crop_line, normalize_crop
from .grammar import normalize_symbol_text, parse_measurement
from .image_pipeline import map_box_to_original, prepare_page
from .line_detector import detect_measurement_lines
from .recognizer import BaseRecognizer, BaselineRecognizer


class DomainScanner:
    engine = ENGINE_NAME

    def __init__(self, recognizer: BaseRecognizer | None = None, batch_size: int = BATCH_SIZE) -> None:
        self.recognizer = recognizer or BaselineRecognizer()
        self.batch_size = batch_size

    def recognize_image(self, image: np.ndarray, include_diagnostics: bool = True) -> dict[str, Any]:
        start = perf_counter()
        prepared = prepare_page(image)
        lines, detector_info = detect_measurement_lines(prepared.image)
        lines = sort_lines(lines)

        crops = []
        crop_lines = []
        failed_crops = 0
        for line in lines:
            crop = crop_line(prepared.image, line)
            if crop is None:
                failed_crops += 1
                continue
            try:
                crops.append(normalize_crop(crop))
                crop_lines.append(line)
            except ValueError:
                failed_crops += 1

        recognitions = []
        batches = 0
        for index in range(0, len(crops), self.batch_size):
            batch = crops[index:index + self.batch_size]
            recognitions.extend(self.recognizer.recognize_batch(batch))
            batches += 1

        detections = []
        valid_count = 0
        invalid_count = 0
        for index, (line, recognition) in enumerate(zip(crop_lines, recognitions)):
            normalized = normalize_symbol_text(recognition.normalized_text or recognition.raw_text)
            parsed = parse_measurement(normalized)
            valid = bool(parsed) and recognition.valid and recognition.confidence >= LOW_CONFIDENCE_THRESHOLD
            reason = recognition.reason
            if not parsed:
                reason = reason or "invalid_format"
            elif recognition.confidence < LOW_CONFIDENCE_THRESHOLD:
                reason = reason or "low_confidence"
            if valid:
                valid_count += 1
            else:
                invalid_count += 1
            box = map_box_to_original(line.to_dict(), prepared.transform, prepared.original_width, prepared.original_height)
            detections.append({
                "id": f"measurement-{index + 1}",
                "rawText": recognition.raw_text,
                "normalizedText": normalized,
                "confidence": float(round(recognition.confidence, 4)),
                "valid": valid,
                "selected": bool(valid),
                "reason": "" if valid else reason,
                "columnIndex": int(line.column_index),
                "rowIndex": int(line.row_index),
                "box": box,
                "parsedValues": {"aRaw": parsed[0], "bRaw": parsed[1]} if parsed else {},
            })

        diagnostics = {
            "detectedLines": len(lines),
            "recognizedValid": valid_count,
            "recognizedInvalid": invalid_count,
            "failedCrops": failed_crops,
            "batches": batches,
            "columnCount": detector_info.get("columnCount", 0),
            "componentCount": detector_info.get("componentCount", 0),
            "totalMs": int((perf_counter() - start) * 1000),
        }
        return {
            "status": "ok",
            "engine": self.engine,
            "imageWidth": prepared.original_width,
            "imageHeight": prepared.original_height,
            "detections": detections,
            "diagnostics": diagnostics if include_diagnostics else {},
        }
