from __future__ import annotations


def detector_metrics(predicted: list[dict], expected: list[dict], iou_threshold: float = 0.5) -> dict:
    return {
        "predictedCount": len(predicted),
        "expectedCount": len(expected),
        "iouThreshold": iou_threshold,
        "precision": 0.0 if not predicted else None,
        "recall": 0.0 if not expected else None,
        "note": "Full metric matching is implemented in evaluation scripts when annotations are supplied.",
    }
