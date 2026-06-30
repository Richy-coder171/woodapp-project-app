from __future__ import annotations

import cv2
import numpy as np

from .config import MAX_PROCESSING_SIDE
from .schemas import PreparedPage, Transform


def prepare_page(image: np.ndarray, max_side: int = MAX_PROCESSING_SIDE) -> PreparedPage:
    if image is None or not hasattr(image, "shape") or image.ndim not in (2, 3):
        raise ValueError("Invalid image")
    original_height, original_width = image.shape[:2]
    if original_width <= 0 or original_height <= 0:
        raise ValueError("Invalid image dimensions")

    longest = max(original_width, original_height)
    if longest <= max_side:
        resized = image.copy()
        to_original = np.eye(3, dtype=np.float32)
    else:
        scale = max_side / float(longest)
        resized = cv2.resize(
            image,
            (max(1, int(original_width * scale)), max(1, int(original_height * scale))),
            interpolation=cv2.INTER_AREA,
        )
        to_original = np.array([[1 / scale, 0, 0], [0, 1 / scale, 0], [0, 0, 1]], dtype=np.float32)

    return PreparedPage(original_width, original_height, resized, Transform(to_original))


def map_box_to_original(box: dict, transform: Transform, original_width: int, original_height: int) -> dict:
    points = [
        (box["x"], box["y"]),
        (box["x"] + box["width"], box["y"]),
        (box["x"] + box["width"], box["y"] + box["height"]),
        (box["x"], box["y"] + box["height"]),
    ]
    mapped = []
    for x, y in points:
        target = transform.to_original @ np.array([x, y, 1.0], dtype=np.float32)
        if target[2] != 0:
            target = target / target[2]
        mapped.append((float(target[0]), float(target[1])))
    xs = [point[0] for point in mapped]
    ys = [point[1] for point in mapped]
    x1 = max(0.0, min(xs))
    y1 = max(0.0, min(ys))
    x2 = min(float(original_width), max(xs))
    y2 = min(float(original_height), max(ys))
    return {
        "x": round(x1, 2),
        "y": round(y1, 2),
        "width": round(max(1.0, x2 - x1), 2),
        "height": round(max(1.0, y2 - y1), 2),
    }
